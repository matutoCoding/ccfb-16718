import { buildSeedPlots, buildSeedSchemes } from '../src/lib/seed'
import { buildCanopyModel } from '../src/lib/canopy'
import { buildVoxelGrid } from '../src/lib/voxel'
import { buildDayPoints } from '../src/lib/solar'
import { runCpuSimulation } from '../src/lib/simulate_cpu'
import { runSimulation } from '../src/lib/run_simulation'
import { validatePrecision } from '../src/lib/validation'
import { resultToCsv } from '../src/lib/exporter'
import { clonePlain } from '../src/lib/clone_plain'

const plots = buildSeedPlots()
const schemes = buildSeedSchemes(plots)
const plot = plots[0]
const scheme = schemes[0]

const buildStart = performance.now()
const full = buildCanopyModel(plot, scheme)
console.log('full model', {
  plants: full.plantCount,
  leaves: full.leafCount,
  fruits: full.fruitCount,
  lai: Number(full.lai.toFixed(2)),
  buildMs: Number((performance.now() - buildStart).toFixed(1))
})

const preview = buildCanopyModel(plot, {
  ...scheme,
  simulation: { ...scheme.simulation, timeStepMinutes: 60 }
}, { preview: true })
const grid = buildVoxelGrid(preview, 0.5)
const times = buildDayPoints(plot, { ...scheme.simulation, timeStepMinutes: 60 })
const output = runCpuSimulation({
  model: preview,
  grid,
  times,
  extinctionG: 0.5,
  windSpeedMs: 2,
  sunburnThresholdC: 40,
  occlusionEnabled: true
})
console.log('cpu preview', {
  leaves: preview.leafCount,
  times: times.length,
  daily: output.daily.length,
  series: output.series.length,
  fruit: output.fruit.length
})

const validation = await validatePrecision('cpu')
console.log('precision', {
  expected: Number(validation.expectedWm2.toFixed(4)),
  actual: Number(validation.actualWm2.toFixed(4)),
  errorPct: Number((validation.relativeError * 100).toFixed(5)),
  passed: validation.passed
})

const aggregated = await runSimulation({
  plot,
  scheme: {
    ...scheme,
    canopy: { ...scheme.canopy, shootsPerVine: 2, leavesPerShoot: 10 },
    simulation: { ...scheme.simulation, timeStepMinutes: 60 }
  },
  settings: {
    preferredEngine: 'cpu',
    cellSizeM: 0.5,
    timeStepMinutes: 60,
    extinctionG: 0.5,
    sunburnThresholdC: 40,
    showVoxel: false,
    reduceMotion: true
  }
})
console.log('aggregated', {
  leaves: aggregated.leafCount,
  rows: aggregated.rowStats.length,
  mean: Number(aggregated.meanTotalMJ.toFixed(2)),
  risk: aggregated.riskFruitCount,
  elapsedMs: Number(aggregated.totalElapsedMs.toFixed(0))
})

const csv = resultToCsv(aggregated)
if (!csv.includes('# 行级统计') || !csv.includes('row_id')) throw new Error('CSV export is invalid')
const cloned = clonePlain({ value: 1 })
if (cloned.value !== 1) throw new Error('clonePlain failed')

if (full.leafCount < 50000) throw new Error('full leaf count is too low')
if (!validation.passed) throw new Error('precision validation failed')
if (output.daily.some((v) => !Number.isFinite(v))) throw new Error('non-finite CPU output')
console.log('core verification passed')
