import type { BoundaryPoint } from '../types'
import { polygonArea } from './math'

function asPointArray(data: unknown): unknown[] | null {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>
    if (Array.isArray(record.points)) return record.points
    if (record.type === 'Feature' && record.geometry) return asPointArray(record.geometry)
    if (record.type === 'FeatureCollection' && Array.isArray(record.features) && record.features[0]) {
      return asPointArray(record.features[0])
    }
    if (record.type === 'Polygon' && Array.isArray(record.coordinates)) {
      const rings = record.coordinates as unknown[]
      return Array.isArray(rings[0]) ? (rings[0] as unknown[]) : null
    }
  }
  return null
}

export function parseBoundaryText(
  text: string,
  latitude: number,
  longitude: number,
  options: { forceLngLat?: boolean } = {}
): BoundaryPoint[] {
  const data = JSON.parse(text) as unknown
  const rawPoints = asPointArray(data)
  if (!rawPoints || rawPoints.length < 3) throw new Error('边界至少需要 3 个点')

  const isGeoJson = text.includes('"coordinates"') || (data as Record<string, unknown>)?.type === 'Feature'
  const first = rawPoints[0]
  const hasLngLatKeys = Boolean(first && typeof first === 'object' && ('lng' in first || 'longitude' in first))
  const looksLngLat = isGeoJson || hasLngLatKeys || options.forceLngLat === true

  const points: BoundaryPoint[] = rawPoints.map((item) => {
    if (Array.isArray(item)) {
      const a = Number(item[0])
      const b = Number(item[1])
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error('边界坐标包含非数字')
      return looksLngLat ? lngLatToLocal(a, b, latitude, longitude) : { x: a, y: b }
    }
    const record = item as Record<string, unknown>
    if (looksLngLat) {
      const lng = Number(record.lng ?? record.longitude)
      const lat = Number(record.lat ?? record.latitude)
      return lngLatToLocal(lng, lat, latitude, longitude)
    }
    const x = Number(record.x)
    const y = Number(record.y)
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('边界点需要 x/y 或 lng/lat')
    return { x, y }
  })

  const firstPoint = points[0]
  const lastPoint = points[points.length - 1]
  if (firstPoint.x === lastPoint.x && firstPoint.y === lastPoint.y) points.pop()
  if (polygonArea(points) <= 1) throw new Error('边界面积过小或多边形无效')
  return points
}

export function lngLatToLocal(lng: number, lat: number, originLat: number, originLng: number): BoundaryPoint {
  const latM = 110540
  const lngM = 111320 * Math.cos((originLat * Math.PI) / 180)
  return {
    x: (lng - originLng) * lngM,
    y: (lat - originLat) * latM
  }
}
