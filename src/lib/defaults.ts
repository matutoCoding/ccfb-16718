import type { AppSettings, CanopyConfig, Plot, Scheme, SimulationConfig, TrellisConfig, TrellisKind } from '../types'
import { rectangleBoundary, uid } from './math'

export const DEFAULT_SETTINGS: AppSettings = {
  preferredEngine: 'auto',
  cellSizeM: 0.4,
  timeStepMinutes: 30,
  extinctionG: 0.5,
  sunburnThresholdC: 40,
  showVoxel: false,
  reduceMotion: false
}

export function defaultTrellis(kind: TrellisKind): TrellisConfig {
  if (kind === 'single') {
    return {
      kind,
      rowSpacingM: 2.2,
      plantSpacingM: 1.2,
      trellisHeightM: 2.05,
      wireLayers: 3,
      postSpacingM: 4,
      cordonHeightM: 0.82,
      vOpenWidthM: 0.55
    }
  }
  if (kind === 'v') {
    return {
      kind,
      rowSpacingM: 2.4,
      plantSpacingM: 1.35,
      trellisHeightM: 2.25,
      wireLayers: 4,
      postSpacingM: 4.5,
      cordonHeightM: 0.85,
      vOpenWidthM: 1.15
    }
  }
  return {
    kind,
    rowSpacingM: 3,
    plantSpacingM: 1.6,
    trellisHeightM: 2.55,
    wireLayers: 3,
    postSpacingM: 4,
    cordonHeightM: 1.55,
    vOpenWidthM: 1.4
  }
}

export function defaultCanopy(): CanopyConfig {
  return {
    stage: 5,
    laiTarget: 2.5,
    leafAreaCm2: 150,
    shootsPerVine: 24,
    leavesPerShoot: 20,
    clustersPerVine: 4,
    defoliationPercent: 0,
    shootThinningPercent: 0,
    seed: 20261125
  }
}

export function defaultSimulation(overrides?: Partial<SimulationConfig>): SimulationConfig {
  return {
    date: '2026-07-18',
    timeStepMinutes: 30,
    cellSizeM: 0.4,
    ambientMinC: 22,
    ambientMaxC: 35,
    windSpeedMs: 2.2,
    sunburnThresholdC: 40,
    occlusionEnabled: true,
    ...overrides
  }
}

export function createPlot(input?: Partial<Plot>): Plot {
  const now = new Date().toISOString()
  return {
    id: uid('plot'),
    name: '新地块',
    region: '山东 · 烟台',
    latitude: 37.78,
    longitude: 120.75,
    utcOffset: 8,
    aspectDeg: 180,
    slopeDeg: 8,
    rowAzimuthDeg: 0,
    areaM2: 666.7,
    boundary: rectangleBoundary(18.4, 36.24),
    notes: '',
    createdAt: now,
    updatedAt: now,
    ...input
  }
}

export function createScheme(plot: Plot, input?: Partial<Scheme>): Scheme {
  const now = new Date().toISOString()
  const kind = input?.trellis?.kind ?? 'single'
  return {
    id: uid('scheme'),
    plotId: plot.id,
    name: `${plot.name} · 新方案`,
    rowAzimuthDeg: plot.rowAzimuthDeg,
    trellis: defaultTrellis(kind),
    canopy: defaultCanopy(),
    simulation: defaultSimulation({ sunburnThresholdC: 40 }),
    createdAt: now,
    updatedAt: now,
    ...input
  }
}
