<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from '../components/icon.vue'
import { createPlot } from '../lib/defaults'
import { parseBoundaryText } from '../lib/boundary_io'
import { polygonArea } from '../lib/math'
import { clonePlain } from '../lib/clone_plain'
import {
  removePlot, savePlot, selectPlot, selectedPlot, store, toast
} from '../lib/store'
import type { Plot } from '../types'

const draft = ref<Plot>(clonePlain(selectedPlot() as Plot))
const importText = ref('')
const importAsLngLat = ref(true)
const fileInput = ref<HTMLInputElement | null>(null)

function resetDraft() {
  const plot = selectedPlot()
  if (plot) draft.value = clonePlain(plot)
}
watch(() => store.selectedPlotId, resetDraft)

async function handleSave() {
  draft.value.areaM2 = polygonArea(draft.value.boundary)
  await savePlot(clonePlain(draft.value))
  resetDraft()
  toast('地块档案已保存到 IndexedDB', 'success')
}

async function handleNew() {
  const plot = createPlot({ name: `新地块 ${store.plots.length + 1}` })
  await savePlot(plot)
  resetDraft()
}

async function handleDelete() {
  if (store.plots.length <= 1) {
    toast('至少保留一块地；可在设置页恢复内置测试地块', 'warning')
    return
  }
  if (!draft.value.builtin && !window.confirm(`确定删除「${draft.value.name}」及其全部方案吗？`)) return
  if (draft.value.builtin && !window.confirm('这是内置测试地块，删除后可在设置页恢复。确定删除吗？')) return
  await removePlot(draft.value.id)
}

function applyBoundaryText() {
  try {
    const points = parseBoundaryText(importText.value, draft.value.latitude, draft.value.longitude, {
      forceLngLat: importAsLngLat.value
    })
    draft.value.boundary = points
    draft.value.areaM2 = polygonArea(points)
    toast(`边界已解析：${points.length} 个点，面积 ${draft.value.areaM2.toFixed(1)} m²`, 'success')
  } catch (error) {
    toast(error instanceof Error ? error.message : '边界解析失败', 'error')
  }
}

async function onFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  importText.value = await file.text()
  applyBoundaryText()
  event.target && ((event.target as HTMLInputElement).value = '')
}

const boundarySvg = computed(() => {
  const points = draft.value.boundary
  if (points.length < 3) return { polygon: '', arrows: [] as Array<{ x1: number; y1: number; x2: number; y2: number; color: string; label: string }> }
  const xs = points.map((p) => p.x)
  const ys = points.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const width = Math.max(maxX - minX, 1)
  const height = Math.max(maxY - minY, 1)
  const scale = Math.min(250 / width, 210 / height)
  const mx = (x: number) => 35 + (x - minX) * scale + (250 - width * scale) / 2
  const my = (y: number) => 250 - (35 + (y - minY) * scale + (210 - height * scale) / 2)
  const polygon = points.map((p) => `${mx(p.x)},${my(p.y)}`).join(' ')
  const cx = mx((minX + maxX) / 2)
  const cy = my((minY + maxY) / 2)
  const arrow = (az: number, length: number, color: string, label: string) => {
    const r = (az * Math.PI) / 180
    return { x1: cx, y1: cy, x2: cx + Math.sin(r) * length, y2: cy - Math.cos(r) * length, color, label }
  }
  return {
    polygon,
    arrows: [
      arrow(draft.value.aspectDeg, 58, '#dc2626', '坡向'),
      arrow(draft.value.rowAzimuthDeg, 76, '#5b4bb7', '行向')
    ]
  }
})
</script>

<template>
  <div>
    <header class="topbar">
      <div>
        <h1 class="page-title">地块档案</h1>
        <p class="page-desc">记录坡向、坡度、行向和经纬度，导入 GeoJSON 或本地米制边界。三块内置测试地块均约一亩。</p>
      </div>
      <div class="top-actions">
        <button class="btn" @click="handleNew"><Icon name="plus" :size="17" />新建地块</button>
        <button class="btn primary" @click="handleSave"><Icon name="check" :size="17" />保存档案</button>
      </div>
    </header>

    <div class="grid layout-form">
      <section class="card card-pad">
        <div class="section-title">基础信息</div>
        <div class="field">
          <label>地块名称</label>
          <input v-model="draft.name" class="input" data-testid="plot-name" />
        </div>
        <div class="field">
          <label>产区 / 位置</label>
          <input v-model="draft.region" class="input" />
        </div>
        <div class="field-grid">
          <div class="field">
            <label>纬度 °N</label>
            <input v-model.number="draft.latitude" type="number" step="0.0001" class="input" />
          </div>
          <div class="field">
            <label>经度 °E</label>
            <input v-model.number="draft.longitude" type="number" step="0.0001" class="input" />
          </div>
          <div class="field">
            <label>时区偏移 h</label>
            <input v-model.number="draft.utcOffset" type="number" step="1" class="input" />
          </div>
          <div class="field">
            <label>面积 m²</label>
            <input :value="draft.areaM2.toFixed(1)" class="input" disabled />
          </div>
          <div class="field">
            <label>坡向 <span class="value">{{ draft.aspectDeg }}°</span></label>
            <input v-model.number="draft.aspectDeg" type="range" min="0" max="359" />
          </div>
          <div class="field">
            <label>坡度 <span class="value">{{ draft.slopeDeg }}°</span></label>
            <input v-model.number="draft.slopeDeg" type="range" min="0" max="35" />
          </div>
          <div class="field" style="grid-column:1/-1">
            <label>默认行向（正北 0°，顺时针）<span class="value">{{ draft.rowAzimuthDeg }}°</span></label>
            <input v-model.number="draft.rowAzimuthDeg" type="range" min="0" max="179" />
          </div>
        </div>
        <div class="field">
          <label>农艺备注</label>
          <textarea v-model="draft.notes" class="input" style="min-height:84px"></textarea>
        </div>
        <button class="btn danger" @click="handleDelete"><Icon name="trash" :size="16" />删除当前地块</button>
      </section>

      <div class="grid" style="gap:var(--sp-4)">
        <section class="card">
          <div class="card-head">
            <div><div class="card-title">地块列表</div><div class="card-sub">切换后架式、冠层和推演均归属该地块</div></div>
            <span class="badge primary">{{ store.plots.length }} 块</span>
          </div>
          <div class="card-body">
            <div class="scheme-list">
              <button
                v-for="plot in store.plots"
                :key="plot.id"
                class="scheme-item"
                :class="{ active: plot.id === draft.id }"
                @click="selectPlot(plot.id)"
              >
                <div class="flex-between">
                  <strong>{{ plot.name }}</strong>
                  <span class="badge" :class="plot.slopeDeg === 0 ? 'info' : plot.aspectDeg > 135 && plot.aspectDeg < 225 ? 'warning' : ''">
                    {{ plot.slopeDeg === 0 ? '平地' : `${plot.aspectDeg}°坡向 · ${plot.slopeDeg}°` }}
                  </span>
                </div>
                <span>{{ plot.region }} · {{ plot.areaM2.toFixed(0) }} m² · 默认行向 {{ plot.rowAzimuthDeg }}°</span>
              </button>
            </div>
          </div>
        </section>

        <section class="card">
          <div class="card-head"><div><div class="card-title">边界与方向</div><div class="card-sub">红色为下坡方向，紫色为行向</div></div></div>
          <div class="card-body grid grid-2" style="align-items:center">
            <svg viewBox="0 0 320 280" style="width:100%; height:280px; background:var(--slate-50); border:1px solid var(--line); border-radius:var(--radius)">
              <polygon :points="boundarySvg.polygon" fill="#e9e3d2" stroke="#8a7a5c" stroke-width="2" />
              <line v-for="(arrow, i) in boundarySvg.arrows" :key="i" :x1="arrow.x1" :y1="arrow.y1" :x2="arrow.x2" :y2="arrow.y2" :stroke="arrow.color" stroke-width="3" stroke-linecap="round" />
              <circle :cx="boundarySvg.arrows[0]?.x1" :cy="boundarySvg.arrows[0]?.y1" r="4" fill="#0f172a" />
            </svg>
            <div>
              <div class="section-title">导入边界</div>
              <p class="help mb-3">支持 GeoJSON Polygon/Feature，或 <code>[[x,y]]</code> 米制坐标。经纬度边界会按当前地块原点转换。</p>
              <textarea v-model="importText" class="input" placeholder='{"type":"Polygon","coordinates":[[[120.75,37.78],...]]}'></textarea>
              <label class="check-row mt-2"><input v-model="importAsLngLat" type="checkbox" />数组坐标按经纬度解释；取消后按本地 x/y 米制坐标解释</label>
              <div class="btn-row mt-3">
                <button class="btn primary sm" @click="applyBoundaryText"><Icon name="check" :size="15" />解析文本</button>
                <button class="btn sm" @click="fileInput?.click()"><Icon name="download" :size="15" />选择文件</button>
                <input ref="fileInput" type="file" accept=".json,.geojson,.txt" hidden @change="onFileSelected" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>
