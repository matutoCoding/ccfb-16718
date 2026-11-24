import type { Plot, SolarPoint } from '../types'
import { clamp, deg2rad, rad2deg } from './math'

export const SOLAR_CONSTANT_WM2 = 1361

export function dayOfYear(dateText: string) {
  const [year, month, day] = dateText.split('-').map(Number)
  const date = Date.UTC(year, month - 1, day)
  const start = Date.UTC(year, 0, 0)
  return Math.floor((date - start) / 86400000)
}

export interface SolarPosition {
  elevationRad: number
  elevationDeg: number
  azimuthDeg: number
  x: number
  y: number
  z: number
  equationOfTimeMin: number
  hourAngleDeg: number
}

export function getSolarPosition(
  dateText: string,
  hourLocal: number,
  latitude: number,
  longitude: number,
  utcOffset: number
): SolarPosition {
  const n = dayOfYear(dateText)
  const gamma = (2 * Math.PI) / 365 * (n - 1 + (hourLocal - 12) / 24)
  const eq = 229.18 * (
    0.000075
    + 0.001868 * Math.cos(gamma)
    - 0.032077 * Math.sin(gamma)
    - 0.014615 * Math.cos(2 * gamma)
    - 0.040849 * Math.sin(2 * gamma)
  )
  const decl = (
    0.006918
    - 0.399912 * Math.cos(gamma)
    + 0.070257 * Math.sin(gamma)
    - 0.006758 * Math.cos(2 * gamma)
    + 0.000907 * Math.sin(2 * gamma)
    - 0.002697 * Math.cos(3 * gamma)
    + 0.00148 * Math.sin(3 * gamma)
  )
  const timeOffsetMin = eq + 4 * longitude - 60 * utcOffset
  const trueSolarTimeMin = hourLocal * 60 + timeOffsetMin
  const hourAngleDeg = trueSolarTimeMin / 4 - 180
  const H = deg2rad(hourAngleDeg)
  const phi = deg2rad(latitude)

  const sinElevation = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H)
  const elevationRad = Math.asin(clamp(sinElevation, -1, 1))
  const east = -Math.cos(decl) * Math.sin(H)
  const north = Math.cos(phi) * Math.sin(decl) - Math.sin(phi) * Math.cos(decl) * Math.cos(H)
  const up = sinElevation
  const length = Math.hypot(east, north, up) || 1
  const x = east / length
  const y = north / length
  const z = up / length
  const azimuthDeg = (rad2deg(Math.atan2(x, y)) + 360) % 360

  return {
    elevationRad,
    elevationDeg: rad2deg(elevationRad),
    azimuthDeg,
    x,
    y,
    z,
    equationOfTimeMin: eq,
    hourAngleDeg
  }
}

export function airmassKastenYoung(elevationDeg: number) {
  const h = Math.max(elevationDeg, 0.05)
  return 1 / (Math.sin(deg2rad(h)) + 0.50572 * Math.pow(h + 6.07995, -1.6364))
}

export function directNormalIrradiance(elevationDeg: number) {
  if (elevationDeg <= 0) return 0
  const am = airmassKastenYoung(elevationDeg)
  const transmission = Math.pow(0.7, Math.pow(am, 0.678))
  return SOLAR_CONSTANT_WM2 * transmission
}

export function diffuseHorizontalIrradiance(elevationRad: number) {
  const sinH = Math.max(0, Math.sin(elevationRad))
  return 0.12 * SOLAR_CONSTANT_WM2 * sinH
}

export function airTemperatureAt(hour: number, minC: number, maxC: number) {
  const mean = (minC + maxC) / 2
  const amplitude = (maxC - minC) / 2
  return mean + amplitude * Math.cos((2 * Math.PI * (hour - 15)) / 24)
}

export function buildDayPoints(plot: Plot, simulation: {
  date: string
  timeStepMinutes: number
  ambientMinC: number
  ambientMaxC: number
}): SolarPoint[] {
  const points: SolarPoint[] = []
  const stepHours = simulation.timeStepMinutes / 60
  for (let hour = 0; hour < 24 - 1e-6; hour += stepHours) {
    const solar = getSolarPosition(
      simulation.date,
      hour,
      plot.latitude,
      plot.longitude,
      plot.utcOffset
    )
    if (solar.elevationDeg <= 0.2) continue
    const dni = directNormalIrradiance(solar.elevationDeg)
    const dhi = diffuseHorizontalIrradiance(solar.elevationRad)
    const ghi = dni * Math.max(0, solar.z) + dhi
    const totalMinutes = Math.round(hour * 60)
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0')
    const mm = String(totalMinutes % 60).padStart(2, '0')
    points.push({
      hour,
      label: `${hh}:${mm}`,
      elevationRad: solar.elevationRad,
      elevationDeg: solar.elevationDeg,
      azimuthDeg: solar.azimuthDeg,
      sunX: solar.x,
      sunY: solar.y,
      sunZ: solar.z,
      dniWm2: dni,
      dhiWm2: dhi,
      ghiWm2: ghi,
      airTempC: airTemperatureAt(hour, simulation.ambientMinC, simulation.ambientMaxC),
      dtHours: stepHours
    })
  }
  return points
}

export function horizontalLeafFormulaWm2(elevationDeg: number) {
  const h = deg2rad(elevationDeg)
  return directNormalIrradiance(elevationDeg) * Math.max(0, Math.sin(h))
}

export function sunFacingLeafFormulaWm2(elevationDeg: number) {
  return directNormalIrradiance(elevationDeg)
}
