export type ID = string
export type TrellisKind = 'single' | 'v' | 'pergola'
export type EngineKind = 'webgpu' | 'cpu'

export interface BoundaryPoint {
  x: number
  y: number
}

export interface Plot {
  id: ID
  name: string
  region: string
  latitude: number
  longitude: number
  utcOffset: number
  aspectDeg: number
  slopeDeg: number
  rowAzimuthDeg: number
  areaM2: number
  boundary: BoundaryPoint[]
  notes: string
  builtin?: boolean
  createdAt: string
  updatedAt: string
}

export interface TrellisConfig {
  kind: TrellisKind
  rowSpacingM: number
  plantSpacingM: number
  trellisHeightM: number
  wireLayers: number
  postSpacingM: number
  cordonHeightM: number
  vOpenWidthM: number
}

export interface CanopyConfig {
  stage: number
  laiTarget: number
  leafAreaCm2: number
  shootsPerVine: number
  leavesPerShoot: number
  clustersPerVine: number
  defoliationPercent: number
  shootThinningPercent: number
  seed: number
}

export interface SimulationConfig {
  date: string
  timeStepMinutes: 15 | 20 | 30 | 60
  cellSizeM: number
  ambientMinC: number
  ambientMaxC: number
  windSpeedMs: number
  sunburnThresholdC: number
  occlusionEnabled: boolean
}

export interface Scheme {
  id: ID
  plotId: ID
  name: string
  rowAzimuthDeg: number
  trellis: TrellisConfig
  canopy: CanopyConfig
  simulation: SimulationConfig
  builtin?: boolean
  createdAt: string
  updatedAt: string
}

export interface AppSettings {
  preferredEngine: 'auto' | 'webgpu' | 'cpu'
  cellSizeM: number
  timeStepMinutes: 15 | 20 | 30 | 60
  extinctionG: number
  sunburnThresholdC: number
  showVoxel: boolean
  reduceMotion: boolean
}

export interface LeafInstance {
  id: number
  plantId: number
  rowId: number
  x: number
  y: number
  z: number
  nx: number
  ny: number
  nz: number
  area: number
  width: number
  height: number
}

export interface FruitInstance {
  id: number
  plantId: number
  rowId: number
  x: number
  y: number
  z: number
  radius: number
}

export interface TrellisLine {
  points: number[]
  kind: 'wire' | 'post' | 'frame'
}

export interface CanopyBounds {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
}

export interface RowStat {
  rowId: number
  plantCount: number
  leafCount: number
  leafAreaM2: number
  meanDirectMJ: number
  meanDiffuseMJ: number
  meanTotalMJ: number
  p10TotalMJ: number
  p90TotalMJ: number
  fruitCount: number
  riskFruitCount: number
  meanAfternoonSunMinutes: number
}

export interface CanopyModel {
  schemeId: ID
  plotId: ID
  preview: boolean
  leaves: LeafInstance[]
  fruits: FruitInstance[]
  lines: TrellisLine[]
  posts: Array<{ x: number; y: number; z: number; height: number }>
  rowCount: number
  plantCount: number
  leafCount: number
  fruitCount: number
  leafAreaM2: number
  lai: number
  bounds: CanopyBounds
  rowOrigins: Array<{ rowId: number; u: number; v: number }>
}

export interface SolarPoint {
  hour: number
  label: string
  elevationRad: number
  elevationDeg: number
  azimuthDeg: number
  sunX: number
  sunY: number
  sunZ: number
  dniWm2: number
  dhiWm2: number
  ghiWm2: number
  airTempC: number
  dtHours: number
}

export interface FruitResult {
  fruitId: number
  directMJ: number
  diffuseMJ: number
  directMinutes: number
  afternoonMinutes: number
  peakTempC: number
  risk: boolean
  exposureRatio: number
}

export interface LightHistogram {
  edges: number[]
  counts: number[]
}

export interface ValidationReport {
  expectedWm2: number
  actualWm2: number
  relativeError: number
  passed: boolean
  formula: string
}

export interface SimulationResult {
  id: ID
  schemeId: ID
  plotId: ID
  schemeName: string
  plotName: string
  date: string
  engine: EngineKind
  engineMessage: string
  totalElapsedMs: number
  buildMs: number
  computeMs: number
  readbackMs: number
  leafCount: number
  fruitCount: number
  rowCount: number
  timePoints: SolarPoint[]
  leafDaily: Float32Array
  leafDirectDaily: Float32Array
  leafDiffuseDaily: Float32Array
  leafSeries: Float32Array
  seriesStride: number
  fruitResults: FruitResult[]
  rowStats: RowStat[]
  histogram: LightHistogram
  validation: ValidationReport
  meanDirectMJ: number
  meanDiffuseMJ: number
  meanTotalMJ: number
  p10TotalMJ: number
  p50TotalMJ: number
  p90TotalMJ: number
  sunlitLeafRatio: number
  riskFruitRatio: number
  riskFruitCount: number
  createdAt: string
}

export interface ToastMessage {
  id: number
  type: 'success' | 'error' | 'warning' | 'info'
  text: string
}
