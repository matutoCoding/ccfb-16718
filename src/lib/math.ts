import type { BoundaryPoint } from '../types'

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const deg2rad = (d: number) => (d * Math.PI) / 180
export const rad2deg = (r: number) => (r * 180) / Math.PI

export function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hash01(...values: number[]) {
  let h = 2166136261
  for (const value of values) {
    h ^= Math.floor(value * 9973 + 17)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 13
  h = Math.imul(h, 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

export function polygonArea(points: BoundaryPoint[]) {
  let twice = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    twice += a.x * b.y - b.x * a.y
  }
  return Math.abs(twice) / 2
}

export function pointInPolygon(x: number, y: number, polygon: BoundaryPoint[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x
    const yi = polygon[i].y
    const xj = polygon[j].x
    const yj = polygon[j].y
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi + 1e-12) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export function rectangleBoundary(widthEastM: number, lengthNorthM: number): BoundaryPoint[] {
  const x = widthEastM / 2
  const y = lengthNorthM / 2
  return [
    { x: -x, y: -y },
    { x, y: -y },
    { x, y },
    { x: -x, y }
  ]
}

export function percentile(sorted: Float32Array | number[], q: number) {
  if (!sorted.length) return 0
  const pos = (sorted.length - 1) * clamp(q, 0, 1)
  const base = Math.floor(pos)
  const rest = pos - base
  const next = Math.min(base + 1, sorted.length - 1)
  return sorted[base] + (sorted[next] - sorted[base]) * rest
}

export function formatNumber(value: number, digits = 1) {
  if (!Number.isFinite(value)) return '—'
  return value.toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

export function downloadText(filename: string, text: string, type = 'text/plain;charset=utf-8') {
  const blob = new Blob(['﻿' + text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadCanvas(canvas: HTMLCanvasElement, filename: string) {
  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }, 'image/png')
}
