<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Plot, Scheme, SimulationResult } from '../types'
import { buildCanopyModel, type BuildOptions } from '../lib/canopy'
import { buildVoxelGrid } from '../lib/voxel'
import { CanopyViewer } from '../three/canopy_viewer'

const props = withDefaults(defineProps<{
  plot?: Plot
  scheme?: Scheme
  result?: SimulationResult | null
  preview?: boolean
  heat?: 'none' | 'daily' | 'instant' | 'fruit'
  timeIndex?: number
  showVoxel?: boolean
  voxelSize?: number
}>(), {
  result: null,
  preview: false,
  heat: 'none',
  timeIndex: 0,
  showVoxel: false,
  voxelSize: 0.4
})

const emit = defineEmits<{
  (e: 'model-built', payload: { leafCount: number; fruitCount: number; lai: number }): void
  (e: 'heat-domain', value: number): void
}>()

const canvasRef = ref<HTMLCanvasElement | null>(null)
const building = ref(false)
const renderError = ref('')
let viewer: CanopyViewer | null = null
let observer: ResizeObserver | null = null
let rebuildTimer: ReturnType<typeof setTimeout> | null = null
let lastModel: ReturnType<typeof buildCanopyModel> | null = null
let heatMax = 22

function applyHeat() {
  if (!viewer || !props.result) {
    viewer?.setLeafHeat(null)
    viewer?.setFruitResults(null)
    return
  }
  if (props.heat === 'daily') {
    heatMax = Math.max(10, props.result.p90TotalMJ * 1.08)
    viewer.setLeafHeat(props.result.leafDaily, heatMax)
    viewer.setFruitResults(null)
    emit('heat-domain', heatMax)
  } else if (props.heat === 'instant') {
    const stride = props.result.seriesStride
    const index = Math.min(props.timeIndex, stride - 1)
    const values = new Float32Array(props.result.leafCount)
    for (let i = 0; i < props.result.leafCount; i++) values[i] = props.result.leafSeries[i * stride + index]
    heatMax = 950
    viewer.setLeafHeat(values, heatMax)
    const tp = props.result.timePoints[index]
    if (tp) viewer.setSunDirection(tp.sunX, tp.sunY, tp.sunZ)
    viewer.setFruitResults(null)
    emit('heat-domain', heatMax)
  } else if (props.heat === 'fruit') {
    viewer.setLeafHeat(null)
    viewer.setFruitResults(props.result.fruitResults, props.scheme?.simulation.sunburnThresholdC ?? 40)
  } else {
    viewer.setLeafHeat(null)
    viewer.setFruitResults(props.result.fruitResults, props.scheme?.simulation.sunburnThresholdC ?? 40)
  }
}

function rebuild() {
  if (!props.plot || !props.scheme || !viewer) return
  building.value = true
  if (rebuildTimer) clearTimeout(rebuildTimer)
  rebuildTimer = setTimeout(() => {
    const options: BuildOptions = { preview: props.preview }
    lastModel = buildCanopyModel(props.plot as Plot, props.scheme as Scheme, options)
    viewer?.setModel(lastModel, props.plot)
    emit('model-built', {
      leafCount: lastModel.leafCount,
      fruitCount: lastModel.fruitCount,
      lai: lastModel.lai
    })
    applyHeat()
    if (props.showVoxel && lastModel) {
      viewer?.setVoxelGrid(buildVoxelGrid(lastModel, props.voxelSize))
    } else {
      viewer?.setVoxelGrid(null)
    }
    building.value = false
  }, props.preview ? 60 : 120)
}

const geometryKey = computed(() => {
  if (!props.plot || !props.scheme) return ''
  return JSON.stringify({
    boundary: props.plot.boundary,
    slope: props.plot.slopeDeg,
    aspect: props.plot.aspectDeg,
    row: props.scheme.rowAzimuthDeg,
    trellis: props.scheme.trellis,
    canopy: props.scheme.canopy,
    preview: props.preview
  })
})

function capture() {
  return viewer?.captureDataUrl() ?? ''
}

defineExpose({ capture, rebuild })

onMounted(() => {
  if (!canvasRef.value) return
  try {
    viewer = new CanopyViewer(canvasRef.value)
    observer = new ResizeObserver(() => viewer?.resize())
    if (canvasRef.value.parentElement) observer.observe(canvasRef.value.parentElement)
    rebuild()
  } catch (error) {
    renderError.value = error instanceof Error ? error.message : '当前浏览器无法初始化 WebGL 三维视图'
  }
})

onBeforeUnmount(() => {
  if (rebuildTimer) clearTimeout(rebuildTimer)
  observer?.disconnect()
  viewer?.dispose()
  viewer = null
})

watch(geometryKey, rebuild)
watch(() => [props.showVoxel, props.voxelSize], () => {
  if (!viewer || !lastModel) return
  viewer.setVoxelGrid(props.showVoxel ? buildVoxelGrid(lastModel, props.voxelSize) : null)
})
watch(
  () => [props.result, props.heat, props.timeIndex, props.scheme?.simulation.sunburnThresholdC],
  applyHeat
)
</script>

<template>
  <div class="viewport" :class="{ compact: preview }">
    <canvas ref="canvasRef" aria-label="葡萄冠层三维视图"></canvas>
    <div v-if="building" class="viewport-overlay">
      <span class="badge info">正在生成程序冠层…</span>
    </div>
    <div v-if="renderError" class="empty" style="position:absolute; inset:16px; background:var(--slate-50); border-radius:var(--radius)">
      <div class="empty-title">三维渲染不可用</div>
      <p class="empty-desc">{{ renderError }}。光照计算、表格和 CSV 导出仍可使用；可尝试开启浏览器硬件加速。</p>
    </div>
    <slot name="overlay" />
  </div>
</template>
