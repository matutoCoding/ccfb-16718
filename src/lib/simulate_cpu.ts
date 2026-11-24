import type { CanopyModel, SolarPoint } from '../types'
import { cpuTransmittance, type VoxelGrid } from './voxel'

export interface CpuSimulationArgs {
  model: CanopyModel
  grid: VoxelGrid
  times: SolarPoint[]
  extinctionG: number
  windSpeedMs: number
  sunburnThresholdC: number
  occlusionEnabled: boolean
  heatingK?: number
}

export interface RawSimulationOutput {
  daily: Float32Array
  series: Float32Array
  fruit: Float32Array
  engine: 'cpu'
}

const DIFFUSE_DIRS = [
  [0, 0, 1],
  [0.819, 0, 0.574],
  [-0.819, 0, 0.574],
  [0, 0.819, 0.574],
  [0, -0.819, 0.574]
] as const

export function runCpuSimulation(args: CpuSimulationArgs): RawSimulationOutput {
  const { model, grid, times } = args
  const daily = new Float32Array(model.leaves.length * 2)
  const series = new Float32Array(model.leaves.length * times.length)
  const fruit = new Float32Array(model.fruits.length * 8)
  const heatingK = args.heatingK ?? 0.008

  for (const leaf of model.leaves) {
    let diffuseOcc = 1
    if (args.occlusionEnabled) {
      let sum = 0
      for (const d of DIFFUSE_DIRS) {
        sum += cpuTransmittance(grid, leaf.x, leaf.y, leaf.z, d[0], d[1], d[2], args.extinctionG)
      }
      diffuseOcc = sum / DIFFUSE_DIRS.length
    }
    const skyView = 0.5 + 0.5 * Math.abs(leaf.nz)
    let directMJ = 0
    let diffuseMJ = 0

    times.forEach((tp, t) => {
      const cosine = Math.abs(leaf.nx * tp.sunX + leaf.ny * tp.sunY + leaf.nz * tp.sunZ)
      const shadow = args.occlusionEnabled
        ? cpuTransmittance(grid, leaf.x, leaf.y, leaf.z, tp.sunX, tp.sunY, tp.sunZ, args.extinctionG)
        : 1
      const directWm2 = tp.dniWm2 * cosine * shadow
      const groundWm2 = tp.ghiWm2 * 0.2 * (1 - skyView)
      const diffuseWm2 = tp.dhiWm2 * skyView * diffuseOcc + groundWm2
      series[leaf.id * times.length + t] = directWm2 + diffuseWm2
      directMJ += directWm2 * tp.dtHours * 0.0036
      diffuseMJ += diffuseWm2 * tp.dtHours * 0.0036
    })

    daily[leaf.id * 2] = directMJ
    daily[leaf.id * 2 + 1] = diffuseMJ
  }

  let daylightMinutes = 0
  for (const tp of times) daylightMinutes += tp.dtHours * 60

  for (const f of model.fruits) {
    let directMJ = 0
    let diffuseMJ = 0
    let directMinutes = 0
    let afternoonMinutes = 0
    let peakTempC = -100

    for (const tp of times) {
      const shadow = args.occlusionEnabled
        ? cpuTransmittance(grid, f.x, f.y, f.z, tp.sunX, tp.sunY, tp.sunZ, args.extinctionG)
        : 1
      const exposed = shadow > 0.45 && tp.dniWm2 > 120 && tp.sunZ > 0.08
      const minutes = tp.dtHours * 60
      if (exposed) {
        directMinutes += minutes
        if (tp.hour >= 12) afternoonMinutes += minutes
      }
      directMJ += tp.dniWm2 * shadow * tp.dtHours * 0.0036
      diffuseMJ += tp.dhiWm2 * (0.55 + 0.45 * shadow) * tp.dtHours * 0.0036
      const windCooling = 1 / (1 + 0.12 * args.windSpeedMs)
      const absorbed = tp.dniWm2 * shadow * 0.62 + tp.dhiWm2 * (0.55 + 0.45 * shadow)
      const temperature = tp.airTempC + 1.4 * shadow * windCooling + absorbed * heatingK * windCooling
      peakTempC = Math.max(peakTempC, temperature)
    }

    const o = f.id * 8
    fruit[o] = directMJ
    fruit[o + 1] = diffuseMJ
    fruit[o + 2] = directMinutes
    fruit[o + 3] = afternoonMinutes
    fruit[o + 4] = peakTempC
    fruit[o + 5] = peakTempC >= args.sunburnThresholdC ? 1 : 0
    fruit[o + 6] = directMinutes / Math.max(daylightMinutes, 1)
    fruit[o + 7] = 0
  }

  return { daily, series, fruit, engine: 'cpu' }
}
