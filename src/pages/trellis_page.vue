<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Icon from '../components/icon.vue'
import Viewport3D from '../components/viewport_3d.vue'
import {
  duplicateScheme, newSchemeForPlot, removeScheme, saveScheme,
  selectScheme, selectedPlot, selectedScheme, schemesForPlot, store, toast
} from '../lib/store'
import type { Scheme, TrellisKind } from '../types'
import { clonePlain } from '../lib/clone_plain'

const fallbackPlot = selectedPlot() ?? store.plots[0]
const draft = ref<Scheme>(clonePlain(selectedScheme() ?? (fallbackPlot ? newSchemeForPlot(fallbackPlot) : null) as Scheme))
const modelInfo = ref({ leafCount: 0, fruitCount: 0, lai: 0 })

function resetDraft() {
  const scheme = selectedScheme()
  if (scheme) draft.value = clonePlain(scheme)
}
watch(() => store.selectedSchemeId, resetDraft)

const plot = computed(() => store.plots.find((p) => p.id === draft.value.plotId) ?? selectedPlot())
const plotSchemes = computed(() => schemesForPlot(draft.value.plotId))

async function persist() {
  await saveScheme(clonePlain(draft.value))
  resetDraft()
  toast('架式方案已保存', 'success')
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
watch(draft, () => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  autoSaveTimer = setTimeout(() => {
    if (store.schemes.some((s) => s.id === draft.value.id)) void saveScheme(clonePlain(draft.value))
  }, 450)
}, { deep: true })
onBeforeUnmount(() => {
  if (autoSaveTimer) clearTimeout(autoSaveTimer)
  if (store.schemes.some((s) => s.id === draft.value.id)) void saveScheme(clonePlain(draft.value))
})

async function createScheme() {
  const currentPlot = selectedPlot() ?? store.plots[0]
  if (!currentPlot) return
  const scheme = newSchemeForPlot(currentPlot)
  scheme.name = `${currentPlot.name} · 方案 ${plotSchemes.value.length + 1}`
  await saveScheme(scheme)
  draft.value = clonePlain(scheme)
}

const kindOptions: Array<{ value: TrellisKind; label: string; desc: string }> = [
  { value: 'single', label: '单篱架', desc: '窄墙直立，适合密植和南北行' },
  { value: 'v', label: 'V形架', desc: '双壁开张，增加受光面积' },
  { value: 'pergola', label: '棚架', desc: '顶部水平叶幕，缓和强光日灼' }
]

function changePlot(event: Event) {
  const plotId = (event.target as HTMLSelectElement).value
  draft.value.plotId = plotId
  store.selectedPlotId = plotId
}
</script>

<template>
  <div>
    <header class="topbar">
      <div>
        <h1 class="page-title">架式设计</h1>
        <p class="page-desc">调整行距、株距、架高与铁丝层数，右侧三维预览即时重建。预览只生成中心三行，完整推演按整块一亩地生成。</p>
      </div>
      <div class="top-actions">
        <button class="btn" @click="createScheme"><Icon name="plus" :size="17" />新方案</button>
        <button class="btn primary" @click="persist"><Icon name="check" :size="17" />保存方案</button>
      </div>
    </header>

    <div class="grid layout-form">
      <section class="card card-pad">
        <div class="field">
          <label>所属地块</label>
          <select
            class="input"
            :value="draft.plotId"
            @change="changePlot"
          >
            <option v-for="p in store.plots" :key="p.id" :value="p.id">{{ p.name }}</option>
          </select>
        </div>
        <div class="field">
          <label>方案名称</label>
          <input v-model="draft.name" class="input" />
        </div>

        <div class="section-title">架式类型</div>
        <div class="grid grid-3 mb-4">
          <button
            v-for="kind in kindOptions"
            :key="kind.value"
            class="scheme-item"
            :class="{ active: draft.trellis.kind === kind.value }"
            @click="draft.trellis.kind = kind.value"
          >
            <strong>{{ kind.label }}</strong>
            <span>{{ kind.desc }}</span>
          </button>
        </div>

        <div class="section-title">结构参数</div>
        <div class="field-grid">
          <div class="field">
            <label>行距 <span class="value">{{ draft.trellis.rowSpacingM.toFixed(1) }} m</span></label>
            <input v-model.number="draft.trellis.rowSpacingM" type="range" min="1.6" max="4" step="0.1" />
          </div>
          <div class="field">
            <label>株距 <span class="value">{{ draft.trellis.plantSpacingM.toFixed(2) }} m</span></label>
            <input v-model.number="draft.trellis.plantSpacingM" type="range" min="0.8" max="2.4" step="0.05" />
          </div>
          <div class="field">
            <label>架高 <span class="value">{{ draft.trellis.trellisHeightM.toFixed(2) }} m</span></label>
            <input v-model.number="draft.trellis.trellisHeightM" type="range" min="1.5" max="3" step="0.05" />
          </div>
          <div class="field">
            <label>铁丝层数 <span class="value">{{ draft.trellis.wireLayers }}</span></label>
            <input v-model.number="draft.trellis.wireLayers" type="range" min="2" max="6" step="1" />
          </div>
          <div class="field">
            <label>立柱间距 <span class="value">{{ draft.trellis.postSpacingM.toFixed(1) }} m</span></label>
            <input v-model.number="draft.trellis.postSpacingM" type="range" min="2.5" max="8" step="0.5" />
          </div>
          <div class="field">
            <label>结果带高度 <span class="value">{{ draft.trellis.cordonHeightM.toFixed(2) }} m</span></label>
            <input v-model.number="draft.trellis.cordonHeightM" type="range" min="0.5" max="1.7" step="0.05" />
          </div>
          <div v-if="draft.trellis.kind === 'v'" class="field" style="grid-column:1/-1">
            <label>V 形顶部开张宽度 <span class="value">{{ draft.trellis.vOpenWidthM.toFixed(2) }} m</span></label>
            <input v-model.number="draft.trellis.vOpenWidthM" type="range" min="0.5" max="1.8" step="0.05" />
          </div>
          <div class="field" style="grid-column:1/-1">
            <label>方案行向覆盖 <span class="value">{{ draft.rowAzimuthDeg }}°</span></label>
            <input v-model.number="draft.rowAzimuthDeg" type="range" min="0" max="179" step="1" />
            <span class="help">行向是无方向轴线，0° 与 180° 等价；对比南北行、东西行时使用。</span>
          </div>
        </div>

        <div class="section-title">该地块下的方案</div>
        <div class="scheme-list">
          <div v-for="scheme in plotSchemes" :key="scheme.id" class="flex" style="gap:var(--sp-2)">
            <button class="scheme-item" :class="{ active: scheme.id === draft.id }" @click="selectScheme(scheme.id)" style="flex:1">
              <strong>{{ scheme.name }}</strong>
              <span>{{ scheme.trellis.kind === 'single' ? '单篱架' : scheme.trellis.kind === 'v' ? 'V形架' : '棚架' }} · {{ scheme.rowAzimuthDeg }}° · {{ scheme.trellis.rowSpacingM }}m 行距</span>
            </button>
            <button class="btn sm" title="复制方案" @click="duplicateScheme(scheme)"><Icon name="copy" :size="15" /></button>
            <button class="btn sm danger" title="删除方案" @click="removeScheme(scheme.id)"><Icon name="trash" :size="15" /></button>
          </div>
        </div>
      </section>

      <div class="grid" style="align-content:start">
        <Viewport3D :plot="plot" :scheme="draft" preview heat="none" @model-built="modelInfo = $event" />
        <div class="grid grid-4">
          <div class="kpi"><div class="kpi-label">预览叶片</div><div class="kpi-value">{{ modelInfo.leafCount.toLocaleString() }}</div></div>
          <div class="kpi"><div class="kpi-label">预览果穗</div><div class="kpi-value">{{ modelInfo.fruitCount.toLocaleString() }}</div></div>
          <div class="kpi"><div class="kpi-label">模型 LAI</div><div class="kpi-value">{{ modelInfo.lai.toFixed(2) }}</div></div>
          <div class="kpi"><div class="kpi-label">铁丝层</div><div class="kpi-value">{{ draft.trellis.wireLayers }}<span class="kpi-unit">层</span></div></div>
        </div>
      </div>
    </div>
  </div>
</template>
