import type { CanopyModel, SolarPoint } from '../../types'
import type { VoxelGrid } from '../voxel'
import { lightComputeShader } from './shader'

export interface GpuSimulationArgs {
  model: CanopyModel
  grid: VoxelGrid
  times: SolarPoint[]
  extinctionG: number
  windSpeedMs: number
  sunburnThresholdC: number
  occlusionEnabled: boolean
  heatingK?: number
}

export interface GpuRawOutput {
  daily: Float32Array
  series: Float32Array
  fruit: Float32Array
  computeMs: number
  readbackMs: number
}

let devicePromise: Promise<GPUDevice | null> | null = null

export function getGpuDevice() {
  if (devicePromise) return devicePromise
  devicePromise = (async () => {
    if (!navigator.gpu) return null
    try {
      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
      if (!adapter) return null
      return await adapter.requestDevice()
    } catch {
      return null
    }
  })()
  return devicePromise
}

export async function runOnGpu(args: GpuSimulationArgs): Promise<GpuRawOutput> {
  const device = await getGpuDevice()
  if (!device) throw new Error('当前浏览器或环境没有可用的 WebGPU 设备')

  const { model, grid, times } = args
  const leafCount = model.leaves.length
  const timeCount = times.length
  const fruitCount = model.fruits.length
  if (leafCount === 0 || timeCount === 0) throw new Error('没有可推演的叶片或日照时刻')

  const leafData = new Float32Array(leafCount * 8)
  model.leaves.forEach((leaf, i) => {
    const o = i * 8
    leafData[o] = leaf.x
    leafData[o + 1] = leaf.y
    leafData[o + 2] = leaf.z
    leafData[o + 3] = leaf.area
    leafData[o + 4] = leaf.nx
    leafData[o + 5] = leaf.ny
    leafData[o + 6] = leaf.nz
    leafData[o + 7] = leaf.width
  })

  const fruitData = new Float32Array(Math.max(fruitCount, 1) * 4)
  model.fruits.forEach((fruit, i) => {
    const o = i * 4
    fruitData[o] = fruit.x
    fruitData[o + 1] = fruit.y
    fruitData[o + 2] = fruit.z
    fruitData[o + 3] = fruit.radius
  })

  const timeData = new Float32Array(timeCount * 8)
  let daylightMinutes = 0
  times.forEach((t, i) => {
    const o = i * 8
    timeData[o] = t.sunX
    timeData[o + 1] = t.sunY
    timeData[o + 2] = t.sunZ
    timeData[o + 3] = t.dtHours
    timeData[o + 4] = t.dniWm2
    timeData[o + 5] = t.dhiWm2
    timeData[o + 6] = t.hour
    timeData[o + 7] = t.airTempC
    daylightMinutes += t.dtHours * 60
  })

  const uniform = new ArrayBuffer(96)
  const u32 = new Uint32Array(uniform)
  const f32 = new Float32Array(uniform)
  u32.set([leafCount, timeCount, grid.nx, grid.ny], 0)
  u32.set([grid.nz, 6, args.occlusionEnabled ? 1 : 0, fruitCount], 4)
  f32.set([grid.minX, grid.minY, grid.minZ, grid.cell], 8)
  const maxDistance = Math.hypot(grid.maxX - grid.minX, grid.maxY - grid.minY, grid.maxZ - grid.minZ)
  f32.set([maxDistance, args.extinctionG, 0.2, 0], 12)
  f32.set([args.windSpeedMs, args.heatingK ?? 0.008, 0, 0], 16)
  f32.set([args.sunburnThresholdC, 12, daylightMinutes, 0], 20)

  const uniformBuffer = device.createBuffer({ size: 96, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  device.queue.writeBuffer(uniformBuffer, 0, uniform)

  const makeStorage = (data: BufferSource) => {
    const buffer = device.createBuffer({
      size: Math.max(data.byteLength, 16),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    })
    device.queue.writeBuffer(buffer, 0, data)
    return buffer
  }

  const leafBuffer = makeStorage(leafData)
  const voxelBuffer = makeStorage(grid.density)
  const timeBuffer = makeStorage(timeData)
  const fruitBuffer = makeStorage(fruitData)
  const dailyBuffer = device.createBuffer({ size: Math.max(leafCount * 8, 16), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
  const seriesBuffer = device.createBuffer({ size: Math.max(leafCount * timeCount * 4, 16), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })
  const fruitResultBuffer = device.createBuffer({ size: Math.max(fruitCount * 32, 32), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC })

  const layout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
      { binding: 6, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'read-only-storage' } },
      { binding: 7, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } }
    ]
  })
  const pipelineLayout = device.createPipelineLayout({ bindGroupLayouts: [layout] })
  const module = device.createShaderModule({ code: lightComputeShader })
  const leafPipeline = await device.createComputePipelineAsync({
    layout: pipelineLayout,
    compute: { module, entryPoint: 'leafMain' }
  })
  const fruitPipeline = await device.createComputePipelineAsync({
    layout: pipelineLayout,
    compute: { module, entryPoint: 'fruitMain' }
  })

  const bindGroup = device.createBindGroup({
    layout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: leafBuffer } },
      { binding: 2, resource: { buffer: voxelBuffer } },
      { binding: 3, resource: { buffer: timeBuffer } },
      { binding: 4, resource: { buffer: dailyBuffer } },
      { binding: 5, resource: { buffer: seriesBuffer } },
      { binding: 6, resource: { buffer: fruitBuffer } },
      { binding: 7, resource: { buffer: fruitResultBuffer } }
    ]
  })

  const readDaily = device.createBuffer({ size: dailyBuffer.size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
  const readSeries = device.createBuffer({ size: seriesBuffer.size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
  const readFruit = device.createBuffer({ size: fruitResultBuffer.size, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })

  const encoder = device.createCommandEncoder()
  const pass = encoder.beginComputePass()
  pass.setPipeline(leafPipeline)
  pass.setBindGroup(0, bindGroup)
  pass.dispatchWorkgroups(Math.ceil(leafCount / 64))
  pass.setPipeline(fruitPipeline)
  pass.dispatchWorkgroups(Math.max(1, Math.ceil(fruitCount / 64)))
  pass.end()
  encoder.copyBufferToBuffer(dailyBuffer, 0, readDaily, 0, dailyBuffer.size)
  encoder.copyBufferToBuffer(seriesBuffer, 0, readSeries, 0, seriesBuffer.size)
  encoder.copyBufferToBuffer(fruitResultBuffer, 0, readFruit, 0, fruitResultBuffer.size)
  device.queue.submit([encoder.finish()])

  const computeStart = performance.now()
  await device.queue.onSubmittedWorkDone()
  const computeMs = performance.now() - computeStart

  const readbackStart = performance.now()
  await Promise.all([
    readDaily.mapAsync(GPUMapMode.READ),
    readSeries.mapAsync(GPUMapMode.READ),
    readFruit.mapAsync(GPUMapMode.READ)
  ])
  const daily = new Float32Array(readDaily.getMappedRange()).slice()
  const series = new Float32Array(readSeries.getMappedRange()).slice()
  const fruit = new Float32Array(readFruit.getMappedRange()).slice()
  readDaily.unmap()
  readSeries.unmap()
  readFruit.unmap()
  const readbackMs = performance.now() - readbackStart

  for (const buffer of [
    uniformBuffer, leafBuffer, voxelBuffer, timeBuffer, fruitBuffer,
    dailyBuffer, seriesBuffer, fruitResultBuffer, readDaily, readSeries, readFruit
  ]) buffer.destroy()

  return { daily, series, fruit, computeMs, readbackMs }
}
