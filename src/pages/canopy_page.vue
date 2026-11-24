<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Icon from '../components/icon.vue'
import Viewport3D from '../components/viewport_3d.vue'
import { PHENOLOGY_STAGES } from '../lib/canopy'
import { saveScheme, selectedPlot, selectedScheme, store, toast, newSchemeForPlot } from '../lib/store'
import type { Scheme } from '../types'
import { clonePlain } from '../lib/clone_plain'

const fallbackPlot = selectedPlot() ?? store.plots[0]
const draft = ref<Scheme>(clonePlain(selectedScheme() ?? (fallbackPlot ? newSchemeForPlot(fallbackPlot) : null) as Scheme))
const modelInfo = ref({ leafCount: 0, fruitCount: 0, lai: 0 })
const highQuality = ref(true)

function resetDraft() {
  const scheme = selectedScheme()
  if (scheme) draft.value = clonePlain(scheme)
}
watch(() => store.selectedSchemeId, resetDraft)

const plot = computed(() => store.plots.find((p) => p.id === draft.value.plotId) ?? selectedPlot())
const stageInfo = computed(() => PHENOLOGY_STAGES[draft.value.canopy.stage])

async function persist() {
  await saveScheme(clonePlain(draft.value))
  toast('冠层参数和修剪记录已保存', 'success')
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

function quickDefoliation(value: number) {
  draft.value.canopy.defoliationPercent = value
}
function quickThinning(value: number) {
  draft.value.canopy.shootThinningPercent = value
}
function changeScheme(event: Event) {
  store.selectedSchemeId = (event.target as HTMLSelectElement).value
  resetDraft()
}
</script>

<template>
  <div>
    <header class="topbar">
      <div>
        <h1 class="page-title">冠层生长</h1>
        <p class="page-desc">按物候期生成程序化叶片，LAI、叶面积和新梢密度共同决定叶幕规模；摘叶与疏梢会确定性移除结果带老叶和过密新梢。</p>
      </div>
      <div class="top-actions">
        <label class="check-row"><input v-model="highQuality" type="checkbox" />完整一亩冠层</label>
        <button class="btn primary" @click="persist"><Icon name="check" :size="17" />保存冠层</button>
      </div>
    </header>

    <div class="grid layout-sim">
      <section class="card card-pad">
        <div class="field">
          <label>推演方案</label>
          <select class="input" :value="draft.id" @change="changeScheme">
            <option v-for="s in store.schemes.filter((x) => x.plotId === draft.plotId)" :key="s.id" :value="s.id">{{ s.name }}</option>
          </select>
        </div>

        <div class="section-title">物候期</div>
        <div class="grid grid-4" style="gap:var(--sp-2)">
          <button
            v-for="(stage, index) in PHENOLOGY_STAGES"
            :key="stage.label"
            class="btn sm"
            :class="{ primary: draft.canopy.stage === index }"
            @click="draft.canopy.stage = index"
          >{{ stage.label }}</button>
        </div>
        <p class="help mt-2">{{ stageInfo.description }}；当前展叶数量系数 {{ (stageInfo.countFactor * 100).toFixed(0) }}%，叶面积系数 {{ (stageInfo.sizeFactor * 100).toFixed(0) }}%。</p>

        <div class="section-title">生长参数</div>
        <div class="field">
          <label>成熟 LAI 目标 <span class="value">{{ draft.canopy.laiTarget.toFixed(1) }}</span></label>
          <input v-model.number="draft.canopy.laiTarget" type="range" min="0.8" max="4.2" step="0.1" />
        </div>
        <div class="field-grid">
          <div class="field">
            <label>单叶面积 <span class="value">{{ draft.canopy.leafAreaCm2 }} cm²</span></label>
            <input v-model.number="draft.canopy.leafAreaCm2" type="range" min="45" max="260" step="1" />
          </div>
          <div class="field">
            <label>每株新梢 <span class="value">{{ draft.canopy.shootsPerVine }}</span></label>
            <input v-model.number="draft.canopy.shootsPerVine" type="range" min="8" max="42" step="1" />
          </div>
          <div class="field">
            <label>每梢叶数上限 <span class="value">{{ draft.canopy.leavesPerShoot }}</span></label>
            <input v-model.number="draft.canopy.leavesPerShoot" type="range" min="8" max="26" step="1" />
          </div>
          <div class="field">
            <label>每株果穗 <span class="value">{{ draft.canopy.clustersPerVine }}</span></label>
            <input v-model.number="draft.canopy.clustersPerVine" type="range" min="0" max="12" step="1" />
          </div>
        </div>

        <div class="section-title">夏季修剪</div>
        <div class="field">
          <label>果穗带摘叶 <span class="value">{{ draft.canopy.defoliationPercent }}%</span></label>
          <input v-model.number="draft.canopy.defoliationPercent" type="range" min="0" max="80" step="5" data-testid="defoliation" />
          <div class="btn-row mt-2">
            <button class="btn sm" @click="quickDefoliation(0)">未摘叶</button>
            <button class="btn sm" @click="quickDefoliation(30)">轻摘 30%</button>
            <button class="btn sm" @click="quickDefoliation(60)">重摘 60%</button>
          </div>
        </div>
        <div class="field">
          <label>疏梢比例 <span class="value">{{ draft.canopy.shootThinningPercent }}%</span></label>
          <input v-model.number="draft.canopy.shootThinningPercent" type="range" min="0" max="65" step="5" />
          <div class="btn-row mt-2">
            <button class="btn sm" @click="quickThinning(0)">不疏梢</button>
            <button class="btn sm" @click="quickThinning(20)">疏 20%</button>
            <button class="btn sm" @click="quickThinning(40)">疏 40%</button>
          </div>
        </div>
        <div class="kpi mt-3">
          <div class="kpi-label">三维模型实时规模</div>
          <div class="kpi-value">{{ modelInfo.leafCount.toLocaleString() }}<span class="kpi-unit">片叶</span></div>
          <div class="kpi-foot">果穗 {{ modelInfo.fruitCount.toLocaleString() }} 个 · 折算 LAI {{ modelInfo.lai.toFixed(2) }}</div>
        </div>
      </section>

      <Viewport3D
        :plot="plot"
        :scheme="draft"
        :preview="!highQuality"
        heat="none"
        @model-built="modelInfo = $event"
      >
        <template #overlay>
          <span class="badge info">程序化掌状叶纹理 · 实例化渲染</span>
          <span class="badge">拖动旋转 / 滚轮缩放</span>
        </template>
      </Viewport3D>
    </div>
  </div>
</template>
