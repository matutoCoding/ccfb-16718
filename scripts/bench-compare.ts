import { buildSeedPlots, buildSeedSchemes } from '../src/lib/seed'
import { runSimulation } from '../src/lib/run_simulation'

const plots = buildSeedPlots()
const schemes = buildSeedSchemes(plots)
for (const plot of plots) {
  for (const scheme of schemes.filter((s) => s.plotId === plot.id)) {
    const r = await runSimulation({
      plot,
      scheme,
      settings: {
        preferredEngine: 'cpu', cellSizeM: 0.4, timeStepMinutes: 30,
        extinctionG: 0.5, sunburnThresholdC: 40, showVoxel: false, reduceMotion: true
      }
    })
    const maxT = Math.max(...r.fruitResults.map((f) => f.peakTempC))
    console.log(plot.name, scheme.name, {
      ms: Math.round(r.totalElapsedMs),
      mean: Number(r.meanTotalMJ.toFixed(1)),
      p10: Number(r.p10TotalMJ.toFixed(1)),
      riskPct: Number((r.riskFruitRatio * 100).toFixed(0)),
      maxT: Number(maxT.toFixed(1))
    })
  }
}
