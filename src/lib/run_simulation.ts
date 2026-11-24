import type {
  AppSettings, FruitResult, Plot, RowStat, Scheme, SimulationResult
} from '../types'
import { buildCanopyModel } from './canopy'
import { buildVoxelGrid } from './voxel'
import { buildDayPoints } from './solar'
import { percentile } from './math'
import { runCpuSimulation } from './simulate_cpu'
import { runOnGpu } from './gpu/engine'
import { validatePrecision } from './validation'

interface RowAccumulator {
  rowId: number
  plantIds: Set<number>
  leafCount: number
  leafAreaM2: number
  directSum: number
  diffuseSum: number
  totalValues: number[]
  fruitCount: number
  riskFruitCount: number
  afternoonSum: number
}

export interface RunSimulationOptions {
  plot: Plot
  scheme: Scheme
  settings: AppSettings
}

export async function runSimulation(options: RunSimulationOptions): Promise<SimulationResult> {
  const started = performance.now()
  const { plot, scheme, settings } = options
  const buildStarted = performance.now()
  const model = buildCanopyModel(plot, scheme)
  const grid = buildVoxelGrid(model, settings.cellSizeM)
  const timePoints = buildDayPoints(plot, scheme.simulation)
  const buildMs = performance.now() - buildStarted

  let rawDaily: Float32Array
  let rawSeries: Float32Array
  let rawFruit: Float32Array
  let engine: SimulationResult['engine']
  let engineMessage: string
  let computeMs = 0
  let readbackMs = 0

  const common = {
    model,
    grid,
    times: timePoints,
    extinctionG: settings.extinctionG,
    windSpeedMs: scheme.simulation.windSpeedMs,
    sunburnThresholdC: scheme.simulation.sunburnThresholdC,
    occlusionEnabled: scheme.simulation.occlusionEnabled
  }

  if (settings.preferredEngine === 'cpu') {
    const t0 = performance.now()
    const output = runCpuSimulation(common)
    computeMs = performance.now() - t0
    rawDaily = output.daily
    rawSeries = output.series
    rawFruit = output.fruit
    engine = 'cpu'
    engineMessage = '已按设置使用 CPU 参考求解器'
  } else {
    try {
      const output = await runOnGpu(common)
      rawDaily = output.daily
      rawSeries = output.series
      rawFruit = output.fruit
      computeMs = output.computeMs
      readbackMs = output.readbackMs
      engine = 'webgpu'
      engineMessage = 'WGSL 计算着色器完成叶片与果穗推演'
    } catch (error) {
      const t0 = performance.now()
      const output = runCpuSimulation(common)
      computeMs = performance.now() - t0
      rawDaily = output.daily
      rawSeries = output.series
      rawFruit = output.fruit
      engine = 'cpu'
      engineMessage = `WebGPU 不可用，已切换 CPU 参考求解器：${error instanceof Error ? error.message : '未知错误'}`
    }
  }

  const leafCount = model.leafCount
  const leafDirectDaily = new Float32Array(leafCount)
  const leafDiffuseDaily = new Float32Array(leafCount)
  const leafDaily = new Float32Array(leafCount)
  const totalsForPercentile = new Float32Array(leafCount)
  const rows = new Map<number, RowAccumulator>()

  const ensureRow = (rowId: number): RowAccumulator => {
    let row = rows.get(rowId)
    if (!row) {
      row = {
        rowId, plantIds: new Set(), leafCount: 0, leafAreaM2: 0,
        directSum: 0, diffuseSum: 0, totalValues: [],
        fruitCount: 0, riskFruitCount: 0, afternoonSum: 0
      }
      rows.set(rowId, row)
    }
    return row
  }

  for (const leaf of model.leaves) {
    const direct = rawDaily[leaf.id * 2]
    const diffuse = rawDaily[leaf.id * 2 + 1]
    const total = direct + diffuse
    leafDirectDaily[leaf.id] = direct
    leafDiffuseDaily[leaf.id] = diffuse
    leafDaily[leaf.id] = total
    totalsForPercentile[leaf.id] = total
    const row = ensureRow(leaf.rowId)
    row.plantIds.add(leaf.plantId)
    row.leafCount++
    row.leafAreaM2 += leaf.area
    row.directSum += direct
    row.diffuseSum += diffuse
    row.totalValues.push(total)
  }

  const fruitResults: FruitResult[] = model.fruits.map((fruit) => {
    const o = fruit.id * 8
    const result: FruitResult = {
      fruitId: fruit.id,
      directMJ: rawFruit[o],
      diffuseMJ: rawFruit[o + 1],
      directMinutes: rawFruit[o + 2],
      afternoonMinutes: rawFruit[o + 3],
      peakTempC: rawFruit[o + 4],
      risk: rawFruit[o + 5] > 0.5,
      exposureRatio: rawFruit[o + 6]
    }
    const row = ensureRow(fruit.rowId)
    row.fruitCount++
    row.afternoonSum += result.afternoonMinutes
    if (result.risk) row.riskFruitCount++
    return result
  })

  const sorted = Float32Array.from(totalsForPercentile).sort()
  const meanDirect = leafDirectDaily.reduce((a, b) => a + b, 0) / Math.max(1, leafCount)
  const meanDiffuse = leafDiffuseDaily.reduce((a, b) => a + b, 0) / Math.max(1, leafCount)
  const meanTotal = leafDaily.reduce((a, b) => a + b, 0) / Math.max(1, leafCount)
  const p10 = percentile(sorted, 0.1)
  const p50 = percentile(sorted, 0.5)
  const p90 = percentile(sorted, 0.9)
  const sunlit = leafDaily.reduce((count, value) => count + (value >= 8 ? 1 : 0), 0)

  const rowStats: RowStat[] = [...rows.values()].map((row) => {
    const sortedRow = Float32Array.from(row.totalValues).sort()
    const count = Math.max(1, row.leafCount)
    return {
      rowId: row.rowId,
      plantCount: row.plantIds.size,
      leafCount: row.leafCount,
      leafAreaM2: row.leafAreaM2,
      meanDirectMJ: row.directSum / count,
      meanDiffuseMJ: row.diffuseSum / count,
      meanTotalMJ: (row.directSum + row.diffuseSum) / count,
      p10TotalMJ: percentile(sortedRow, 0.1),
      p90TotalMJ: percentile(sortedRow, 0.9),
      fruitCount: row.fruitCount,
      riskFruitCount: row.riskFruitCount,
      meanAfternoonSunMinutes: row.fruitCount ? row.afternoonSum / row.fruitCount : 0
    }
  }).sort((a, b) => a.rowId - b.rowId)

  const histogramMax = Math.max(12, percentile(sorted, 0.98))
  const binCount = 14
  const edges = Array.from({ length: binCount + 1 }, (_, i) => (histogramMax * i) / binCount)
  const counts = new Array<number>(binCount).fill(0)
  for (const value of leafDaily) {
    const bin = Math.min(binCount - 1, Math.floor((value / histogramMax) * binCount))
    counts[Math.max(0, bin)]++
  }

  const riskFruitCount = fruitResults.filter((f) => f.risk).length
  const validation = await validatePrecision(engine)
  const totalElapsedMs = performance.now() - started

  return {
    id: `run-${new Date().toISOString().replace(/[:.]/g, '-')}`,
    schemeId: scheme.id,
    plotId: plot.id,
    schemeName: scheme.name,
    plotName: plot.name,
    date: scheme.simulation.date,
    engine,
    engineMessage,
    totalElapsedMs,
    buildMs,
    computeMs,
    readbackMs,
    leafCount,
    fruitCount: model.fruitCount,
    rowCount: model.rowCount,
    timePoints,
    leafDaily,
    leafDirectDaily,
    leafDiffuseDaily,
    leafSeries: rawSeries,
    seriesStride: timePoints.length,
    fruitResults,
    rowStats,
    histogram: { edges, counts },
    validation,
    meanDirectMJ: meanDirect,
    meanDiffuseMJ: meanDiffuse,
    meanTotalMJ: meanTotal,
    p10TotalMJ: p10,
    p50TotalMJ: p50,
    p90TotalMJ: p90,
    sunlitLeafRatio: sunlit / Math.max(1, leafCount),
    riskFruitRatio: riskFruitCount / Math.max(1, model.fruitCount),
    riskFruitCount,
    createdAt: new Date().toISOString()
  }
}
