import type { SimulationResult } from '../types'
import { downloadText } from './math'

function csvCell(value: string | number) {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function resultToCsv(result: SimulationResult) {
  const summary = [
    ['scheme', result.schemeName],
    ['plot', result.plotName],
    ['date', result.date],
    ['engine', result.engine],
    ['leaf_count', result.leafCount],
    ['fruit_count', result.fruitCount],
    ['elapsed_ms', result.totalElapsedMs.toFixed(0)],
    ['mean_direct_MJ', result.meanDirectMJ.toFixed(3)],
    ['mean_diffuse_MJ', result.meanDiffuseMJ.toFixed(3)],
    ['p10_total_MJ', result.p10TotalMJ.toFixed(3)],
    ['p50_total_MJ', result.p50TotalMJ.toFixed(3)],
    ['p90_total_MJ', result.p90TotalMJ.toFixed(3)],
    ['sunlit_leaf_ratio', result.sunlitLeafRatio.toFixed(4)],
    ['risk_fruit_count', result.riskFruitCount],
    ['risk_fruit_ratio', result.riskFruitRatio.toFixed(4)]
  ]
  const lines = [
    '# 受光推演汇总',
    ...summary.map(([k, v]) => [csvCell(k), csvCell(v)].join(',')),
    '',
    '# 行级统计',
    ['row_id', 'plants', 'leaves', 'leaf_area_m2', 'mean_direct', 'mean_diffuse', 'mean_total', 'p10_total', 'p90_total', 'fruits', 'risk_fruits', 'mean_afternoon_sun_min'].join(','),
    ...result.rowStats.map((r) => [
      r.rowId, r.plantCount, r.leafCount, r.leafAreaM2.toFixed(2),
      r.meanDirectMJ.toFixed(3), r.meanDiffuseMJ.toFixed(3), r.meanTotalMJ.toFixed(3),
      r.p10TotalMJ.toFixed(3), r.p90TotalMJ.toFixed(3), r.fruitCount, r.riskFruitCount,
      r.meanAfternoonSunMinutes.toFixed(1)
    ].map(csvCell).join(',')),
    '',
    '# 说明',
    '叶片级明细请在受光推演或果穗评估页点击“导出叶片明细 CSV”。'
  ]
  return lines.join('\n')
}

export function exportResultCsv(result: SimulationResult) {
  const csv = resultToCsv(result)
  downloadText(`${result.schemeName}-受光统计-${result.date}.csv`, csv, 'text/csv;charset=utf-8')
}

export function exportDetailedLeafCsv(
  result: SimulationResult,
  leaves: Array<{ id: number; rowId: number; plantId: number; x: number; y: number; z: number }>
) {
  const lines = [
    ['leaf_id', 'row_id', 'plant_id', 'x_m', 'y_m', 'z_m', 'direct_MJ', 'diffuse_MJ', 'total_MJ'].join(','),
    ...leaves.map((leaf) => {
      const direct = result.leafDirectDaily[leaf.id]
      const diffuse = result.leafDiffuseDaily[leaf.id]
      return [
        leaf.id, leaf.rowId, leaf.plantId, leaf.x.toFixed(3), leaf.y.toFixed(3), leaf.z.toFixed(3),
        direct.toFixed(4), diffuse.toFixed(4), (direct + diffuse).toFixed(4)
      ].join(',')
    })
  ]
  downloadText(`${result.schemeName}-叶片明细-${result.date}.csv`, lines.join('\n'), 'text/csv;charset=utf-8')
}

export function compareToCsv(results: SimulationResult[]) {
  const header = [
    'plot', 'scheme', 'date', 'engine', 'elapsed_ms', 'leaf_count',
    'mean_total_MJ', 'p10_MJ', 'p50_MJ', 'p90_MJ', 'sunlit_ratio',
    'fruit_count', 'risk_count', 'risk_ratio'
  ]
  const lines = [
    header.join(','),
    ...results.map((r) => [
      r.plotName, r.schemeName, r.date, r.engine, r.totalElapsedMs.toFixed(0), r.leafCount,
      r.meanTotalMJ.toFixed(3), r.p10TotalMJ.toFixed(3), r.p50TotalMJ.toFixed(3), r.p90TotalMJ.toFixed(3),
      r.sunlitLeafRatio.toFixed(4), r.fruitCount, r.riskFruitCount, r.riskFruitRatio.toFixed(4)
    ].map(csvCell).join(','))
  ]
  downloadText(`方案对比-${results[0]?.date ?? 'result'}.csv`, lines.join('\n'), 'text/csv;charset=utf-8')
}
