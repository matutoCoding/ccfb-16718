import type {
  CanopyModel, BoundaryPoint, FruitInstance, LeafInstance, Plot, Scheme, TrellisLine
} from '../types'
import { clamp, deg2rad, hash01, pointInPolygon } from './math'

export const PHENOLOGY_STAGES = [
  { label: '萌芽期', countFactor: 0.18, sizeFactor: 0.24, description: '嫩芽和初展小叶' },
  { label: '展叶期', countFactor: 0.46, sizeFactor: 0.55, description: '叶片数量快速增加' },
  { label: '开花期', countFactor: 0.72, sizeFactor: 0.86, description: '叶幕初步成形' },
  { label: '坐果期', countFactor: 0.86, sizeFactor: 1, description: '果穗开始发育' },
  { label: '膨大期', countFactor: 0.96, sizeFactor: 1, description: '叶幕达到盛期' },
  { label: '转色期', countFactor: 1, sizeFactor: 0.98, description: '枝条停止生长，果粒转色' },
  { label: '成熟期', countFactor: 1, sizeFactor: 0.92, description: '老叶比例增加' },
  { label: '采后期', countFactor: 0.72, sizeFactor: 0.72, description: '下部叶片衰老脱落' }
] as const

export interface BuildOptions {
  preview?: boolean
}

export function rowAxes(rowAzimuthDeg: number) {
  const r = deg2rad(rowAzimuthDeg)
  return {
    along: { x: Math.sin(r), y: Math.cos(r) },
    across: { x: Math.cos(r), y: -Math.sin(r) }
  }
}

export function groundZAt(plot: Plot, x: number, y: number) {
  const aspect = deg2rad(plot.aspectDeg)
  const slope = deg2rad(plot.slopeDeg)
  const downX = Math.sin(aspect)
  const downY = Math.cos(aspect)
  return -Math.tan(slope) * (x * downX + y * downY)
}

interface PlantPlacement {
  plantId: number
  rowId: number
  u: number
  v: number
  x: number
  y: number
  z: number
}

function boundaryExtents(points: BoundaryPoint[]) {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x)
    maxY = Math.max(maxY, p.y)
  }
  return { minX, minY, maxX, maxY }
}

function addSegment(out: number[], ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  out.push(ax, ay, az, bx, by, bz)
}

export function buildCanopyModel(plot: Plot, scheme: Scheme, options: BuildOptions = {}): CanopyModel {
  const preview = options.preview ?? false
  const { trellis: tr, canopy: ca } = scheme
  const axes = rowAxes(scheme.rowAzimuthDeg)
  const boundary = plot.boundary.length >= 3 ? plot.boundary : [
    { x: -10, y: -16 }, { x: 10, y: -16 }, { x: 10, y: 16 }, { x: -10, y: 16 }
  ]

  let uMin = Infinity
  let uMax = -Infinity
  let vMin = Infinity
  let vMax = -Infinity
  for (const p of boundary) {
    const u = p.x * axes.along.x + p.y * axes.along.y
    const v = p.x * axes.across.x + p.y * axes.across.y
    uMin = Math.min(uMin, u)
    uMax = Math.max(uMax, u)
    vMin = Math.min(vMin, v)
    vMax = Math.max(vMax, v)
  }

  const allRowV: number[] = []
  for (let v = vMin + tr.rowSpacingM / 2; v <= vMax - tr.rowSpacingM / 2 + 1e-6; v += tr.rowSpacingM) {
    allRowV.push(v)
  }
  if (allRowV.length === 0) allRowV.push((vMin + vMax) / 2)
  const rowIndexes = preview
    ? allRowV.map((_, i) => i).filter((i) => Math.abs(i - (allRowV.length - 1) / 2) <= 1)
    : allRowV.map((_, i) => i)
  if (preview && rowIndexes.length === 0) rowIndexes.push(0)

  const plants: PlantPlacement[] = []
  const posts: CanopyModel['posts'] = []
  const wirePoints: number[] = []
  const framePoints: number[] = []
  let plantId = 0

  for (const rowId of rowIndexes) {
    const v = allRowV[rowId]
    const candidates: number[] = []
    for (let u = uMin + tr.plantSpacingM / 2; u <= uMax - tr.plantSpacingM / 2 + 1e-6; u += tr.plantSpacingM) {
      const x = u * axes.along.x + v * axes.across.x
      const y = u * axes.along.y + v * axes.across.y
      if (pointInPolygon(x, y, boundary)) candidates.push(u)
    }
    const chosen = preview ? candidates.slice(Math.max(0, Math.floor(candidates.length / 2) - 3), Math.floor(candidates.length / 2) + 4) : candidates
    for (const u of chosen) {
      const x = u * axes.along.x + v * axes.across.x
      const y = u * axes.along.y + v * axes.across.y
      plants.push({ plantId, rowId, u, v, x, y, z: groundZAt(plot, x, y) })
      plantId++
    }
    if (chosen.length === 0) continue

    const uStart = chosen[0] - tr.plantSpacingM * 0.42
    const uEnd = chosen[chosen.length - 1] + tr.plantSpacingM * 0.42
    for (let u = uStart; u <= uEnd + 0.01; u += tr.postSpacingM) {
      const x = u * axes.along.x + v * axes.across.x
      const y = u * axes.along.y + v * axes.across.y
      const z = groundZAt(plot, x, y)
      posts.push({ x, y, z, height: tr.trellisHeightM + 0.12 })
      addSegment(framePoints, x, y, z, x, y, z + tr.trellisHeightM + 0.12)
    }

    const wireCount = Math.max(1, Math.floor(tr.wireLayers))
    if (tr.kind === 'pergola') {
      const topZ = tr.trellisHeightM
      for (let k = -2; k <= 2; k++) {
        const vv = v + k * (tr.rowSpacingM / 5)
        const p1 = rowPoint(axes, uStart, vv)
        const p2 = rowPoint(axes, uEnd, vv)
        addSegment(wirePoints, p1.x, p1.y, groundZAt(plot, p1.x, p1.y) + topZ, p2.x, p2.y, groundZAt(plot, p2.x, p2.y) + topZ)
      }
      for (let u = uStart; u <= uEnd + 0.01; u += tr.postSpacingM) {
        const p1 = rowPoint(axes, u, v - tr.rowSpacingM / 2)
        const p2 = rowPoint(axes, u, v + tr.rowSpacingM / 2)
        addSegment(wirePoints, p1.x, p1.y, groundZAt(plot, p1.x, p1.y) + topZ, p2.x, p2.y, groundZAt(plot, p2.x, p2.y) + topZ)
      }
    } else {
      for (let layer = 0; layer < wireCount; layer++) {
        const t = wireCount === 1 ? 0 : layer / (wireCount - 1)
        const h = tr.cordonHeightM + (tr.trellisHeightM - tr.cordonHeightM) * t
        const offsets = tr.kind === 'v' ? [-tr.vOpenWidthM * 0.5 * t, tr.vOpenWidthM * 0.5 * t] : [0]
        for (const dv of offsets) {
          const p1 = rowPoint(axes, uStart, v + dv)
          const p2 = rowPoint(axes, uEnd, v + dv)
          addSegment(wirePoints, p1.x, p1.y, groundZAt(plot, p1.x, p1.y) + h, p2.x, p2.y, groundZAt(plot, p2.x, p2.y) + h)
        }
      }
    }
  }

  const stage = PHENOLOGY_STAGES[clamp(Math.round(ca.stage), 0, PHENOLOGY_STAGES.length - 1)]
  const matureLeafArea = ca.leafAreaCm2 / 10000
  const areaPerVine = tr.rowSpacingM * tr.plantSpacingM
  const laiDrivenLeaves = (ca.laiTarget * areaPerVine) / Math.max(matureLeafArea, 0.001) / Math.max(1, ca.shootsPerVine)
  const maxNodesPerShoot = clamp(Math.round(Math.min(ca.leavesPerShoot, laiDrivenLeaves)), 5, 24)

  const leaves: LeafInstance[] = []
  const fruits: FruitInstance[] = []
  let leafId = 0
  let fruitId = 0

  for (const plant of plants) {
    for (let s = 0; s < ca.shootsPerVine; s++) {
      if (hash01(ca.seed, plant.plantId * 17, s, 91) < ca.shootThinningPercent / 100) continue
      const cordonSide = s % 2 === 0 ? -1 : 1
      const cordonU = cordonSide * tr.plantSpacingM * 0.38 * hash01(ca.seed, plant.plantId, s, 7)
      const trainingSide = hash01(ca.seed, plant.plantId, s, 11) > 0.5 ? 1 : -1
      const nodeCount = Math.max(3, Math.round(maxNodesPerShoot * stage.countFactor))

      for (let k = 0; k < nodeCount; k++) {
        const nodeT = (k + 1) / (nodeCount + 1)
        const random = hash01(ca.seed, plant.plantId * 101 + s * 17, k, 3)
        const removeBasal = nodeT < 0.48 && hash01(ca.seed, leafId + 19, k, 29) < ca.defoliationPercent / 100
        if (removeBasal) continue

        let u = cordonU
        let v = 0
        let z = tr.cordonHeightM
        let nu = (random - 0.5) * 0.55
        let nv = (k % 2 === 0 ? 1 : -1) * (0.25 + random * 0.35)
        let nz = 0.62 + random * 0.28

        if (tr.kind === 'single') {
          u += Math.sin(nodeT * 5.2 + s) * 0.08
          v = (hash01(ca.seed, s, k, 41) - 0.5) * 0.28 + (k % 2 === 0 ? 0.05 : -0.05)
          z = tr.cordonHeightM + nodeT * (tr.trellisHeightM - tr.cordonHeightM + 0.12)
        } else if (tr.kind === 'v') {
          u += Math.sin(nodeT * 4.1 + s) * 0.1
          v = trainingSide * (0.08 + tr.vOpenWidthM * 0.52 * Math.pow(nodeT, 0.82))
          z = tr.cordonHeightM + nodeT * (tr.trellisHeightM - tr.cordonHeightM)
          nv += trainingSide * 0.42
          nz = 0.58 + random * 0.25
        } else {
          const spread = nodeT
          u += cordonSide * spread * (0.75 + random * 0.55)
          v = (hash01(ca.seed, plant.plantId, k, s + 53) - 0.5) * tr.rowSpacingM * 0.72 * spread
          z = tr.trellisHeightM + 0.05 + (hash01(ca.seed, k, s, 67) - 0.5) * 0.18
          nu = (random - 0.5) * 0.42
          nv = (hash01(ca.seed, k, s, 71) - 0.5) * 0.42
          nz = 0.82 + random * 0.25
        }

        const world = rowPoint(axes, plant.u + u, plant.v + v)
        const x = world.x
        const y = world.y
        const ground = groundZAt(plot, x, y)
        const normal = normalToWorld(axes, nu, nv, nz)
        const sizeFactor = stage.sizeFactor * (0.78 + random * 0.44)
        const area = matureLeafArea * sizeFactor
        const sqrtArea = Math.sqrt(Math.max(area, 0.0001))
        leaves.push({
          id: leafId++, plantId: plant.plantId, rowId: plant.rowId,
          x, y, z: ground + z,
          nx: normal.x, ny: normal.y, nz: normal.z,
          area, width: sqrtArea * 1.18, height: sqrtArea * 1.02
        })
      }
    }

    if (ca.stage >= 2) {
      for (let c = 0; c < ca.clustersPerVine; c++) {
        const u = (hash01(ca.seed, plant.plantId, c, 101) - 0.5) * tr.plantSpacingM * 0.72
        const v = (hash01(ca.seed, plant.plantId, c, 103) - 0.5) * 0.34
        const p = rowPoint(axes, plant.u + u, plant.v + v)
        fruits.push({
          id: fruitId++, plantId: plant.plantId, rowId: plant.rowId,
          x: p.x, y: p.y,
          z: groundZAt(plot, p.x, p.y) + tr.cordonHeightM - 0.16 - hash01(ca.seed, c, plant.plantId, 107) * 0.18,
          radius: 0.055 + hash01(ca.seed, c, plant.plantId, 109) * 0.025
        })
      }
    }
  }

  const ext = boundaryExtents(boundary)
  const bounds = {
    minX: ext.minX - 1, minY: ext.minY - 1,
    minZ: Math.min(...plants.map((p) => p.z), 0) - 0.35,
    maxX: ext.maxX + 1, maxY: ext.maxY + 1,
    maxZ: Math.max(tr.trellisHeightM + 1.2, ...plants.map((p) => p.z + tr.trellisHeightM + 0.5))
  }
  const leafAreaM2 = leaves.reduce((sum, leaf) => sum + leaf.area, 0)
  const laiAreaM2 = preview
    ? Math.max(1, plants.length) * tr.rowSpacingM * tr.plantSpacingM
    : plot.areaM2
  const lines: TrellisLine[] = [
    { kind: 'wire', points: wirePoints },
    { kind: 'frame', points: framePoints }
  ]

  return {
    schemeId: scheme.id, plotId: plot.id, preview,
    leaves, fruits, lines, posts,
    rowCount: rowIndexes.length,
    plantCount: plants.length,
    leafCount: leaves.length,
    fruitCount: fruits.length,
    leafAreaM2,
    lai: leafAreaM2 / laiAreaM2,
    bounds,
    rowOrigins: rowIndexes.map((rowId) => ({ rowId, u: 0, v: allRowV[rowId] }))
  }
}

function rowPoint(axes: ReturnType<typeof rowAxes>, u: number, v: number) {
  return {
    x: u * axes.along.x + v * axes.across.x,
    y: u * axes.along.y + v * axes.across.y
  }
}

function normalToWorld(axes: ReturnType<typeof rowAxes>, nu: number, nv: number, nz: number) {
  const x = nu * axes.along.x + nv * axes.across.x
  const y = nu * axes.along.y + nv * axes.across.y
  const length = Math.hypot(x, y, nz) || 1
  return { x: x / length, y: y / length, z: nz / length }
}
