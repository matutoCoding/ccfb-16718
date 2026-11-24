import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { CanopyModel, FruitResult, Plot } from '../types'
import { groundZAt } from '../lib/canopy'
import type { VoxelGrid } from '../lib/voxel'
import { createLeafTexture, heatColor } from './leaf_texture'

export class CanopyViewer {
  private canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private controls: OrbitControls
  private content = new THREE.Group()
  private leafTexture: THREE.CanvasTexture
  private leafMesh: THREE.InstancedMesh | null = null
  private fruitMesh: THREE.InstancedMesh | null = null
  private voxelPoints: THREE.Points | null = null
  private sunLight: THREE.DirectionalLight
  private ambient: THREE.HemisphereLight
  private raf = 0
  private disposed = false
  private tempObject = new THREE.Object3D()
  private tempColor = new THREE.Color()

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance'
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.scene.background = new THREE.Color('#eef2f7')
    this.scene.fog = new THREE.Fog('#eef2f7', 55, 120)

    this.camera = new THREE.PerspectiveCamera(43, 1, 0.05, 260)
    this.camera.up.set(0, 0, 1)
    this.camera.position.set(24, -28, 18)

    this.controls = new OrbitControls(this.camera, canvas)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.08
    this.controls.maxDistance = 95
    this.controls.minDistance = 2.5
    this.controls.maxPolarAngle = Math.PI * 0.49

    this.ambient = new THREE.HemisphereLight('#ffffff', '#b7c4a8', 1.65)
    this.scene.add(this.ambient)
    this.sunLight = new THREE.DirectionalLight('#fff3d6', 2.2)
    this.sunLight.position.set(18, -22, 32)
    this.scene.add(this.sunLight)
    this.scene.add(this.sunLight.target)
    this.scene.add(this.content)

    this.leafTexture = createLeafTexture()
    this.resize()
    this.loop()
  }

  resize() {
    const parent = this.canvas.parentElement
    const width = parent?.clientWidth ?? this.canvas.clientWidth
    const height = parent?.clientHeight ?? this.canvas.clientHeight
    if (!width || !height) return
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  setModel(model: CanopyModel, plot?: Plot) {
    this.clearContent()

    if (plot) this.addGround(plot)
    this.addTrellis(model)
    this.addLeaves(model)
    this.addFruits(model)
    this.fitCamera(model)
  }

  private clearContent() {
    for (const child of [...this.content.children]) {
      child.traverse((object) => {
        const mesh = object as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(material)) material.forEach((m) => m.dispose())
        else material?.dispose()
      })
      this.content.remove(child)
    }
    this.leafMesh = null
    this.fruitMesh = null
    this.voxelPoints = null
  }

  setVoxelGrid(grid: VoxelGrid | null) {
    if (this.voxelPoints) {
      this.voxelPoints.removeFromParent()
      this.voxelPoints.geometry.dispose()
      ;(this.voxelPoints.material as THREE.Material).dispose()
      this.voxelPoints = null
    }
    if (!grid) return
    const positions: number[] = []
    for (let iz = 0; iz < grid.nz; iz++) {
      for (let iy = 0; iy < grid.ny; iy++) {
        for (let ix = 0; ix < grid.nx; ix++) {
          const density = grid.density[ix + grid.nx * (iy + grid.ny * iz)]
          if (density <= 0.05) continue
          positions.push(
            grid.minX + (ix + 0.5) * grid.cell,
            grid.minY + (iy + 0.5) * grid.cell,
            grid.minZ + (iz + 0.5) * grid.cell
          )
        }
      }
    }
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    const material = new THREE.PointsMaterial({
      color: '#5b4bb7', size: 0.09, transparent: true, opacity: 0.42, depthWrite: false
    })
    this.voxelPoints = new THREE.Points(geometry, material)
    this.content.add(this.voxelPoints)
  }

  private addGround(plot: Plot) {
    const shape = new THREE.Shape()
    plot.boundary.forEach((p, i) => {
      if (i === 0) shape.moveTo(p.x, p.y)
      else shape.lineTo(p.x, p.y)
    })
    shape.closePath()
    const geometry = new THREE.ShapeGeometry(shape)
    const pos = geometry.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      pos.setZ(i, groundZAt(plot, x, y) - 0.03)
    }
    pos.needsUpdate = true
    geometry.computeVertexNormals()
    geometry.computeBoundingSphere()
    const ground = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: '#e6dfcf', roughness: 1, side: THREE.DoubleSide })
    )
    this.content.add(ground)

    const points = plot.boundary.map((p) => new THREE.Vector3(p.x, p.y, groundZAt(plot, p.x, p.y) + 0.04))
    points.push(points[0].clone())
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(points)
    const line = new THREE.Line(
      lineGeometry,
      new THREE.LineBasicMaterial({ color: '#7c6f57', linewidth: 2 })
    )
    this.content.add(line)
  }

  private addTrellis(model: CanopyModel) {
    for (const lineData of model.lines) {
      if (lineData.points.length < 6) continue
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(lineData.points, 3))
      const material = new THREE.LineBasicMaterial({
        color: lineData.kind === 'wire' ? '#64748b' : '#475569',
        transparent: true,
        opacity: lineData.kind === 'wire' ? 0.72 : 0.95
      })
      this.content.add(new THREE.LineSegments(geometry, material))
    }

    const postGeometry = new THREE.BoxGeometry(0.09, 0.09, 1)
    const postMaterial = new THREE.MeshStandardMaterial({ color: '#6b5d48', roughness: 0.86 })
    const posts = new THREE.InstancedMesh(postGeometry, postMaterial, model.posts.length)
    model.posts.forEach((post, i) => {
      this.tempObject.position.set(post.x, post.y, post.z + post.height / 2)
      this.tempObject.quaternion.identity()
      this.tempObject.scale.set(1, 1, post.height)
      this.tempObject.updateMatrix()
      posts.setMatrixAt(i, this.tempObject.matrix)
    })
    posts.instanceMatrix.needsUpdate = true
    posts.frustumCulled = false
    this.content.add(posts)
  }

  private addLeaves(model: CanopyModel) {
    const geometry = new THREE.PlaneGeometry(1, 1)
    const material = new THREE.MeshStandardMaterial({
      map: this.leafTexture,
      alphaTest: 0.34,
      side: THREE.DoubleSide,
      roughness: 0.82,
      metalness: 0,
      color: '#ffffff'
    })
    const mesh = new THREE.InstancedMesh(geometry, material, model.leaves.length)
    const base = new THREE.Color('#4f9147')
    model.leaves.forEach((leaf, i) => {
      this.tempObject.position.set(leaf.x, leaf.y, leaf.z)
      this.tempObject.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(leaf.nx, leaf.ny, leaf.nz).normalize()
      )
      this.tempObject.scale.set(leaf.width, leaf.height, 1)
      this.tempObject.updateMatrix()
      mesh.setMatrixAt(i, this.tempObject.matrix)
      const shade = 0.86 + 0.18 * Math.sin(i * 12.9898)
      this.tempColor.copy(base).multiplyScalar(shade)
      mesh.setColorAt(i, this.tempColor)
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.frustumCulled = false
    this.leafMesh = mesh
    this.content.add(mesh)
  }

  private addFruits(model: CanopyModel) {
    if (model.fruits.length === 0) return
    const geometry = new THREE.SphereGeometry(1, 8, 6)
    const material = new THREE.MeshStandardMaterial({ color: '#7c3aed', roughness: 0.58 })
    const mesh = new THREE.InstancedMesh(geometry, material, model.fruits.length)
    model.fruits.forEach((fruit, i) => {
      this.tempObject.position.set(fruit.x, fruit.y, fruit.z)
      this.tempObject.quaternion.identity()
      this.tempObject.scale.set(fruit.radius * 0.82, fruit.radius * 0.82, fruit.radius * 1.55)
      this.tempObject.updateMatrix()
      mesh.setMatrixAt(i, this.tempObject.matrix)
      mesh.setColorAt(i, new THREE.Color('#6d28d9'))
    })
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    mesh.frustumCulled = false
    this.fruitMesh = mesh
    this.content.add(mesh)
  }

  setLeafHeat(values: Float32Array | number[] | null, max = 22) {
    if (!this.leafMesh) return
    const count = this.leafMesh.count
    const color = new THREE.Color()
    for (let i = 0; i < count; i++) {
      if (!values) {
        const shade = 0.86 + 0.18 * Math.sin(i * 12.9898)
        color.set('#4f9147').multiplyScalar(shade)
      } else {
        heatColor(values[i] ?? 0, max, color)
      }
      this.leafMesh.setColorAt(i, color)
    }
    if (this.leafMesh.instanceColor) this.leafMesh.instanceColor.needsUpdate = true
  }

  setFruitResults(results: FruitResult[] | null, threshold = 40) {
    if (!this.fruitMesh) return
    const safe = results ?? []
    for (let i = 0; i < this.fruitMesh.count; i++) {
      const result = safe[i]
      if (!result) {
        this.tempColor.set('#6d28d9')
      } else if (result.risk) {
        this.tempColor.set('#dc2626')
      } else if (result.peakTempC >= threshold - 3) {
        this.tempColor.set('#f59e0b')
      } else {
        this.tempColor.set('#16a34a')
      }
      this.fruitMesh.setColorAt(i, this.tempColor)
    }
    if (this.fruitMesh.instanceColor) this.fruitMesh.instanceColor.needsUpdate = true
  }

  setSunDirection(x: number, y: number, z: number) {
    const center = this.controls.target
    this.sunLight.position.set(center.x + x * 35, center.y + y * 35, center.z + Math.max(8, z * 35))
    this.sunLight.target.position.copy(center)
    this.sunLight.intensity = z > 0 ? 1.2 + z * 1.4 : 0.45
  }

  private fitCamera(model: CanopyModel) {
    const b = model.bounds
    const center = new THREE.Vector3((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, (b.minZ + b.maxZ) / 2 + 0.6)
    const size = Math.max(b.maxX - b.minX, b.maxY - b.minY, b.maxZ - b.minZ)
    this.controls.target.copy(center)
    this.camera.position.set(center.x + size * 0.72, center.y - size * 0.86, center.z + size * 0.58)
    this.camera.near = 0.05
    this.camera.far = size * 8
    this.camera.updateProjectionMatrix()
    this.controls.minDistance = 2
    this.controls.maxDistance = size * 3.2
    this.controls.update()
  }

  private loop = () => {
    if (this.disposed) return
    this.raf = requestAnimationFrame(this.loop)
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  captureDataUrl() {
    this.renderer.render(this.scene, this.camera)
    return this.canvas.toDataURL('image/png')
  }

  dispose() {
    this.disposed = true
    cancelAnimationFrame(this.raf)
    this.controls.dispose()
    this.clearContent()
    this.leafTexture.dispose()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
  }
}
