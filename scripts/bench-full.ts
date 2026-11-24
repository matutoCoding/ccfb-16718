import { buildSeedPlots, buildSeedSchemes } from '../src/lib/seed'
import { runSimulation } from '../src/lib/run_simulation'

const plots = buildSeedPlots()
const schemes = buildSeedSchemes(plots)
const scheme = schemes[0]
const result = await runSimulation({
  plot: plots[0],
  scheme,
  settings: {
    preferredEngine: 'cpu',
    cellSizeM: 0.4,
    timeStepMinutes: 30,
    extinctionG: 0.5,
    sunburnThresholdC: 40,
    showVoxel: false,
    reduceMotion: true
  }
})

console.log({
  engine: result.engine,
  leaves: result.leafCount,
  fruits: result.fruitCount,
  timePoints: result.timePoints.length,
  totalMs: Number(result.totalElapsedMs.toFixed(0)),
  buildMs: Number(result.buildMs.toFixed(0)),
  computeMs: Number(result.computeMs.toFixed(0)),
  mean: Number(result.meanTotalMJ.toFixed(2)),
  maxFruitTemp: Number(Math.max(...result.fruitResults.map((f) => f.peakTempC)).toFixed(1)),
  meanAfternoonMin: Number((result.fruitResults.reduce((s, f) => s + f.afternoonMinutes, 0) / result.fruitResults.length).toFixed(0)),
  risk: result.riskFruitCount,
  precisionErrorPct: Number((result.validation.relativeError * 100).toFixed(4))
})
