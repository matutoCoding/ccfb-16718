import { describe, expect, it } from 'vitest'
import { buildSeedPlots, buildSeedSchemes } from '../src/lib/seed'
import { buildCanopyModel } from '../src/lib/canopy'
import { validatePrecision } from '../src/lib/validation'
import { directNormalIrradiance, getSolarPosition } from '../src/lib/solar'

describe('太阳位置和单片叶受光', () => {
  it('夏至正午太阳高度符合纬度与赤纬估算', () => {
    const solar = getSolarPosition('2026-06-21', 12.4, 37.78, 120.75, 8)
    expect(solar.elevationDeg).toBeGreaterThan(70)
    expect(solar.z).toBeGreaterThan(0.94)
  })

  it('无遮挡水平叶的直射受光与太阳高度角公式误差小于 1%', async () => {
    const report = await validatePrecision('cpu')
    expect(report.relativeError).toBeLessThan(0.01)
    expect(report.passed).toBe(true)
  })

  it('水平叶直射等于 DNI 乘以太阳高度正弦', () => {
    const solar = getSolarPosition('2026-07-18', 13, 37.78, 120.75, 8)
    const dni = directNormalIrradiance(solar.elevationDeg)
    const expected = dni * Math.max(0, solar.z)
    const normal = { x: 0, y: 0, z: 1 }
    const actual = dni * Math.abs(normal.x * solar.x + normal.y * solar.y + normal.z * solar.z)
    expect(Math.abs(actual - expected) / expected).toBeLessThan(0.01)
  })
})

describe('一亩测试地块和冠层生成', () => {
  it('创建南坡、东坡和平地三块约一亩地', () => {
    const plots = buildSeedPlots()
    expect(plots).toHaveLength(3)
    for (const plot of plots) {
      expect(plot.areaM2).toBeGreaterThan(650)
      expect(plot.areaM2).toBeLessThan(680)
      expect(plot.boundary.length).toBeGreaterThanOrEqual(4)
    }
    expect(plots[0].aspectDeg).toBeGreaterThan(150)
    expect(plots[1].aspectDeg).toBeGreaterThan(60)
    expect(plots[2].slopeDeg).toBe(0)
  })

  it('三块地均有三种架式方案，完整冠层达到推演规模', () => {
    const plots = buildSeedPlots()
    const schemes = buildSeedSchemes(plots)
    expect(schemes.length).toBeGreaterThanOrEqual(9)
    const southSingle = schemes.find((s) => s.id === 'scheme-south-single-ns')
    expect(southSingle).toBeTruthy()
    const model = buildCanopyModel(plots[0], southSingle!)
    expect(model.plantCount).toBeGreaterThan(150)
    expect(model.leafCount).toBeGreaterThan(50000)
    expect(model.lai).toBeGreaterThan(1.4)
    expect(model.fruitCount).toBeGreaterThan(300)
  })
})
