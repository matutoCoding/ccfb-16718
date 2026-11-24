import type { Plot, Scheme, TrellisKind } from '../types'
import { polygonArea, rectangleBoundary } from './math'
import { defaultCanopy, defaultSimulation, defaultTrellis } from './defaults'

function seedPlot(partial: Omit<Plot, 'boundary' | 'areaM2' | 'createdAt' | 'updatedAt'> & {
  width: number
  length: number
}): Plot {
  const boundary = rectangleBoundary(partial.width, partial.length)
  const now = '2026-11-25T00:00:00.000Z'
  const { width: _width, length: _length, ...rest } = partial
  return {
    ...rest,
    boundary,
    areaM2: polygonArea(boundary),
    createdAt: now,
    updatedAt: now
  }
}

export function buildSeedPlots(): Plot[] {
  return [
    seedPlot({
      id: 'plot-south',
      name: '南坡向阳园',
      region: '山东 · 烟台蓬莱',
      latitude: 37.78,
      longitude: 120.75,
      utcOffset: 8,
      aspectDeg: 182,
      slopeDeg: 11,
      rowAzimuthDeg: 0,
      notes: '坡向接近正南，昼夜温差明显，适合比较 V 形架与单篱架的午后果面暴露。',
      builtin: true,
      width: 20,
      length: 33.335
    }),
    seedPlot({
      id: 'plot-east',
      name: '东坡迎暾园',
      region: '山东 · 烟台蓬莱',
      latitude: 37.76,
      longitude: 120.82,
      utcOffset: 8,
      aspectDeg: 92,
      slopeDeg: 15,
      rowAzimuthDeg: 350,
      notes: '东坡上午受光早，下午有坡体和行间遮挡，重点观察果穗上午直射积累。',
      builtin: true,
      width: 20,
      length: 33.335
    }),
    seedPlot({
      id: 'plot-flat',
      name: '平地方正园',
      region: '山东 · 烟台蓬莱',
      latitude: 37.72,
      longitude: 120.68,
      utcOffset: 8,
      aspectDeg: 0,
      slopeDeg: 0,
      rowAzimuthDeg: 90,
      notes: '平地对照地块，用于隔离坡度效应，比较南北行向与东西行向。',
      builtin: true,
      width: 20,
      length: 33.335
    })
  ]
}

function seedScheme(
  plot: Plot,
  suffix: string,
  display: string,
  kind: TrellisKind,
  rowAzimuthDeg: number,
  patch?: Partial<Scheme['trellis']>
): Scheme {
  const now = '2026-11-25T00:00:00.000Z'
  return {
    id: `scheme-${plot.id.replace('plot-', '')}-${suffix}`,
    plotId: plot.id,
    name: display,
    rowAzimuthDeg,
    trellis: { ...defaultTrellis(kind), ...patch },
    canopy: defaultCanopy(),
    simulation: defaultSimulation(),
    builtin: true,
    createdAt: now,
    updatedAt: now
  }
}

export function buildSeedSchemes(plots: Plot[]): Scheme[] {
  const [south, east, flat] = plots
  return [
    seedScheme(south, 'single-ns', '单篱架 · 南北行', 'single', 0),
    seedScheme(south, 'v-contour', 'V形架 · 顺坡行', 'v', 182, { rowSpacingM: 2.5 }),
    seedScheme(south, 'pergola-ew', '棚架 · 东西行', 'pergola', 90),

    seedScheme(east, 'single-nne', '单篱架 · 北偏西', 'single', 350),
    seedScheme(east, 'v-nw', 'V形架 · 等高斜行', 'v', 10, { vOpenWidthM: 1.05 }),
    seedScheme(east, 'pergola-contour', '棚架 · 等高行', 'pergola', 92),

    seedScheme(flat, 'single-ns', '单篱架 · 南北行', 'single', 0),
    seedScheme(flat, 'v-ns', 'V形架 · 南北行', 'v', 0),
    seedScheme(flat, 'pergola-ew', '棚架 · 东西行', 'pergola', 90)
  ]
}
