import * as THREE from 'three'

export function createLeafTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 128
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  if (!ctx) return new THREE.Texture()

  ctx.clearRect(0, 0, 128, 128)
  ctx.translate(64, 64)
  ctx.fillStyle = 'white'
  ctx.beginPath()
  const points = 14
  for (let i = 0; i <= points; i++) {
    const angle = -Math.PI / 2 + (i / points) * Math.PI * 2
    const lobe = i % 2 === 0 ? 52 : 30
    const radius = lobe * (0.9 + 0.1 * Math.sin(i * 2.1))
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = 'rgba(70, 92, 55, 0.42)'
  ctx.lineWidth = 3
  ctx.lineCap = 'round'
  for (let i = -2; i <= 2; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / 5
    ctx.beginPath()
    ctx.moveTo(0, 18)
    ctx.quadraticCurveTo(Math.cos(angle) * 16, Math.sin(angle) * 18, Math.cos(angle) * 42, Math.sin(angle) * 42)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.moveTo(0, 20)
  ctx.lineTo(0, 54)
  ctx.lineWidth = 5
  ctx.strokeStyle = 'rgba(92, 82, 45, 0.7)'
  ctx.stroke()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 4
  return texture
}

export function heatColor(value: number, max: number, target: THREE.Color) {
  const t = Math.max(0, Math.min(1, max > 0 ? value / max : 0))
  const stops = [
    [51, 65, 85],
    [37, 99, 235],
    [34, 197, 94],
    [250, 204, 21],
    [239, 68, 68]
  ]
  const scaled = t * (stops.length - 1)
  const index = Math.min(stops.length - 2, Math.floor(scaled))
  const f = scaled - index
  const a = stops[index]
  const b = stops[index + 1]
  target.setRGB(
    ((a[0] + (b[0] - a[0]) * f) / 255),
    ((a[1] + (b[1] - a[1]) * f) / 255),
    ((a[2] + (b[2] - a[2]) * f) / 255)
  )
  return target
}
