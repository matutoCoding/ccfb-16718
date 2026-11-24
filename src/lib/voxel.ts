import type { CanopyModel, CanopyBounds } from '../types'

export interface VoxelGrid {
  nx: number
  ny: number
  nz: number
  cell: number
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
  density: Float32Array
}

export function buildVoxelGrid(model: CanopyModel, cell = 0.4): VoxelGrid {
  const b: CanopyBounds = model.bounds
  const pad = cell * 2
  const minX = Math.floor((b.minX - pad) / cell) * cell
  const minY = Math.floor((b.minY - pad) / cell) * cell
  const minZ = Math.floor((b.minZ - pad) / cell) * cell
  const maxX = b.maxX + pad
  const maxY = b.maxY + pad
  const maxZ = b.maxZ + pad
  const nx = Math.max(1, Math.ceil((maxX - minX) / cell))
  const ny = Math.max(1, Math.ceil((maxY - minY) / cell))
  const nz = Math.max(1, Math.ceil((maxZ - minZ) / cell))
  const density = new Float32Array(nx * ny * nz)
  const cellVolume = cell * cell * cell

  for (const leaf of model.leaves) {
    const ix = Math.floor((leaf.x - minX) / cell)
    const iy = Math.floor((leaf.y - minY) / cell)
    const iz = Math.floor((leaf.z - minZ) / cell)
    if (ix < 0 || iy < 0 || iz < 0 || ix >= nx || iy >= ny || iz >= nz) continue
    density[ix + nx * (iy + ny * iz)] += leaf.area / cellVolume
  }

  return { nx, ny, nz, cell, minX, minY, minZ, maxX, maxY, maxZ, density }
}

export function sampleVoxel(grid: VoxelGrid, x: number, y: number, z: number) {
  const ix = Math.floor((x - grid.minX) / grid.cell)
  const iy = Math.floor((y - grid.minY) / grid.cell)
  const iz = Math.floor((z - grid.minZ) / grid.cell)
  if (ix < 0 || iy < 0 || iz < 0 || ix >= grid.nx || iy >= grid.ny || iz >= grid.nz) return 0
  return grid.density[ix + grid.nx * (iy + grid.ny * iz)]
}

export function cpuTransmittance(
  grid: VoxelGrid,
  ox: number, oy: number, oz: number,
  dx: number, dy: number, dz: number,
  extinctionG = 0.5,
  maxDistance = 90
) {
  const length = Math.hypot(dx, dy, dz)
  if (length < 0.5) return 1

  let x = ox + dx * grid.cell * 0.55
  let y = oy + dy * grid.cell * 0.55
  let z = oz + dz * grid.cell * 0.55
  const step = grid.cell * 0.82
  const steps = Math.ceil(maxDistance / step)
  let transmission = 1

  for (let i = 0; i < steps; i++) {
    x += dx * step
    y += dy * step
    z += dz * step
    const inside = x >= grid.minX && x <= grid.maxX
      && y >= grid.minY && y <= grid.maxY
      && z >= grid.minZ && z <= grid.maxZ
    if (!inside) break

    const density = sampleVoxel(grid, x, y, z)
    if (density > 0) transmission *= Math.exp(-extinctionG * density * step)
    if (transmission < 0.03) return 0.03
  }
  return transmission
}
