import type { CanopyModel, SimulationResult, SolarPoint, ValidationReport } from '../types'
import { buildVoxelGrid } from './voxel'
import { getSolarPosition, directNormalIrradiance } from './solar'
import { runCpuSimulation } from './simulate_cpu'
import { runOnGpu } from './gpu/engine'

function precisionModel(): CanopyModel {
  return {
    schemeId: 'precision',
    plotId: 'precision',
    preview: false,
    leaves: [{
      id: 0, plantId: 0, rowId: 0,
      x: 0, y: 0, z: 1.2,
      nx: 0, ny: 0, nz: 1,
      area: 0.01, width: 0.12, height: 0.1
    }],
    fruits: [],
    lines: [],
    posts: [],
    rowCount: 1,
    plantCount: 1,
    leafCount: 1,
    fruitCount: 0,
    leafAreaM2: 0.01,
    lai: 0,
    bounds: { minX: -1, minY: -1, minZ: 0, maxX: 1, maxY: 1, maxZ: 3 },
    rowOrigins: [{ rowId: 0, u: 0, v: 0 }]
  }
}

export async function validatePrecision(engine: SimulationResult['engine'] | 'auto' = 'auto'): Promise<ValidationReport> {
  const solar = getSolarPosition('2026-06-21', 12.4, 37.78, 120.75, 8)
  const dni = directNormalIrradiance(solar.elevationDeg)
  const expected = dni * Math.max(0, solar.z)
  const point: SolarPoint = {
    hour: 12.4,
    label: '12:24',
    elevationRad: solar.elevationRad,
    elevationDeg: solar.elevationDeg,
    azimuthDeg: solar.azimuthDeg,
    sunX: solar.x,
    sunY: solar.y,
    sunZ: solar.z,
    dniWm2: dni,
    dhiWm2: 0,
    ghiWm2: expected,
    airTempC: 30,
    dtHours: 1
  }
  const model = precisionModel()
  const grid = buildVoxelGrid(model, 0.4)
  const args = {
    model,
    grid,
    times: [point],
    extinctionG: 0.5,
    windSpeedMs: 2,
    sunburnThresholdC: 40,
    occlusionEnabled: false
  }

  let directMJ: number
  if (engine === 'cpu') {
    directMJ = runCpuSimulation(args).daily[0]
  } else {
    try {
      directMJ = (await runOnGpu(args)).daily[0]
    } catch {
      directMJ = runCpuSimulation(args).daily[0]
    }
  }
  const actual = directMJ / 0.0036
  const relativeError = Math.abs(actual - expected) / expected
  return {
    expectedWm2: expected,
    actualWm2: actual,
    relativeError,
    passed: relativeError < 0.01,
    formula: 'I_leaf = S0 · 0.7^(AM^0.678) · max(0, |n·s|)；水平叶 |n·s| = sin(h)'
  }
}
