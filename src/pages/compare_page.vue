<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Icon from '../components/icon.vue'
import { compareToCsv, exportResultCsv } from '../lib/exporter'
import { runCompare, selectScheme, setPage, store } from '../lib/store'

const plotId = ref(store.plots[0]?.id ?? '')
const selectedIds = ref<string[]>([])

const plotSchemes = computed(() => store.schemes.filter((s) => s.plotId === plotId.value))
const results = computed(() => store.compareResults)

watch(plotId, () => {
  selectedIds.value = plotSchemes.value.slice(0, 3).map((s) => s.id)
  store.compareResults = []
}, { immediate: true })

function toggle(id: string) {
  if (selectedIds.value.includes(id)) selectedIds.value = selectedIds.value.filter((x) => x !== id)
  else if (selectedIds.value.length < 4) selectedIds.value.push(id)
}

async function run() {
  await runCompare(selectedIds.value)
}

function openInLight(schemeId: string) {
  selectScheme(schemeId)
  setPage('light')
}

const maxMean = computed(() => Math.max(1, ...results.value.map((r) => r.meanTotalMJ)))
const maxRisk = computed(() => Math.max(0.05, ...results.value.map((r) => r.riskFruitRatio)))
const maxMinutes = computed(() => Math.max(1, ...results.value.flatMap((r) => r.rowStats.map((x) => x.meanAfternoonSunMinutes))))
</script>

<template>
  <div>
    <header class="topbar">
      <div>
        <h1 class="page-title">方案对比</h1>
        <p class="page-desc">同一地块并排比较不同架式、行向和修剪方案的冠层受光分布、行间遮挡、果穗午后直射与晒伤风险。</p>
      </div>
      <div class="top-actions">
        <button class="btn" :disabled="results.length < 2" @click="compareToCsv(results)"><Icon name="download" :size="17" />导出对比 CSV</button>
        <button class="btn primary" :disabled="store.comparing || selectedIds.length < 2" @click="run"><Icon name="play" :size="17" />{{ store.comparing ? '对比推演中…' : `并排推演 ${selectedIds.length} 个方案` }}</button>
      </div>
    </header>

    <section class="card card-pad mb-4">
      <div class="grid" style="grid-template-columns:280px 1fr; gap:var(--sp-5); align-items:start">
        <div class="field" style="margin:0">
          <label>对比地块</label>
          <select v-model="plotId" class="input">
            <option v-for="plot in store.plots" :key="plot.id" :value="plot.id">{{ plot.name }}</option>
          </select>
        </div>
        <div>
          <label class="muted small">选择 2–4 个方案</label>
          <div class="scheme-list mt-2" style="grid-template-columns:repeat(3,minmax(0,1fr)); display:grid">
            <button
              v-for="scheme in plotSchemes"
              :key="scheme.id"
              class="scheme-item"
              :class="{ active: selectedIds.includes(scheme.id) }"
              @click="toggle(scheme.id)"
            >
              <strong>{{ scheme.name }}</strong>
              <span>{{ scheme.trellis.kind === 'single' ? '单篱架' : scheme.trellis.kind === 'v' ? 'V形架' : '棚架' }} · 行向 {{ scheme.rowAzimuthDeg }}°</span>
            </button>
          </div>
        </div>
      </div>
      <div v-if="store.comparing" class="mt-4">
        <div class="progress"><i style="width:66%"></i></div>
        <p class="help mt-2">{{ store.runLabel }}；为保证计时准确，方案按顺序使用同一 WebGPU 设备推演。</p>
      </div>
    </section>

    <div v-if="results.length === 0" class="empty card">
      <div class="empty-icon"><Icon name="compare" :size="28" /></div>
      <div class="empty-title">选择方案后开始并排推演</div>
      <p class="empty-desc">内置三块地均提供单篱架、V 形架和棚架对照方案。推演结果只保存在当前页面会话，统计表可导出为 CSV。</p>
    </div>

    <div v-else class="grid" :style="`grid-template-columns:repeat(${Math.min(results.length, 3)},minmax(0,1fr)); align-items:start`">
      <section v-for="result in results" :key="result.id" class="card compare-col">
        <div class="card-head">
          <div>
            <div class="card-title">{{ result.schemeName }}</div>
            <div class="card-sub">{{ result.plotName }} · {{ result.date }} · {{ result.engine.toUpperCase() }} · {{ result.totalElapsedMs.toFixed(0) }} ms</div>
          </div>
          <div class="btn-row">
            <button class="btn sm" @click="exportResultCsv(result)"><Icon name="download" :size="15" />统计表</button>
            <button class="btn sm primary" @click="openInLight(result.schemeId)">三维查看</button>
          </div>
        </div>
        <div class="card-body" style="padding-top:var(--sp-4)">
          <div class="grid grid-2">
            <div class="kpi"><div class="kpi-label">平均日受光</div><div class="kpi-value">{{ result.meanTotalMJ.toFixed(1) }}</div><div class="kpi-foot">MJ/m² · 直 {{ result.meanDirectMJ.toFixed(1) }} / 散 {{ result.meanDiffuseMJ.toFixed(1) }}</div></div>
            <div class="kpi"><div class="kpi-label">晒伤果穗</div><div class="kpi-value" :style="{color: result.riskFruitCount ? 'var(--danger)' : 'var(--success)'}">{{ (result.riskFruitRatio * 100).toFixed(0) }}%</div><div class="kpi-foot">{{ result.riskFruitCount }} / {{ result.fruitCount }} 穗</div></div>
          </div>

          <div class="section-title">受光水平</div>
          <div class="bar-row"><span class="muted">平均总量</span><div class="bar-track"><div class="bar-fill" :style="`width:${result.meanTotalMJ / maxMean * 100}%`"></div></div><strong>{{ result.meanTotalMJ.toFixed(1) }}</strong></div>
          <div class="bar-row"><span class="muted">P10 弱光</span><div class="bar-track"><div class="bar-fill warn" :style="`width:${result.p10TotalMJ / maxMean * 100}%`"></div></div><strong>{{ result.p10TotalMJ.toFixed(1) }}</strong></div>
          <div class="bar-row"><span class="muted">P90 强光</span><div class="bar-track"><div class="bar-fill good" :style="`width:${result.p90TotalMJ / maxMean * 100}%`"></div></div><strong>{{ result.p90TotalMJ.toFixed(1) }}</strong></div>
          <div class="bar-row"><span class="muted">良好叶占比</span><div class="bar-track"><div class="bar-fill good" :style="`width:${result.sunlitLeafRatio * 100}%`"></div></div><strong>{{ (result.sunlitLeafRatio * 100).toFixed(0) }}%</strong></div>

          <div class="section-title">果穗风险</div>
          <div class="bar-row"><span class="muted">风险比例</span><div class="bar-track"><div class="bar-fill bad" :style="`width:${result.riskFruitRatio / maxRisk * 100}%`"></div></div><strong>{{ (result.riskFruitRatio * 100).toFixed(1) }}%</strong></div>
          <div class="bar-row">
            <span class="muted">午后直射</span>
            <div class="bar-track"><div class="bar-fill warn" :style="`width:${(result.rowStats.reduce((s, r) => s + r.meanAfternoonSunMinutes, 0) / Math.max(1, result.rowStats.length)) / maxMinutes * 100}%`"></div></div>
            <strong>{{ (result.rowStats.reduce((s, r) => s + r.meanAfternoonSunMinutes, 0) / Math.max(1, result.rowStats.length)).toFixed(0) }}′</strong>
          </div>

          <div class="section-title">日受光分布</div>
          <svg viewBox="0 0 260 90" style="width:100%; height:90px" role="img" aria-label="受光分布直方图">
            <rect v-for="(count, i) in result.histogram.counts" :key="i"
              :x="8 + i * 17.2"
              :y="80 - Math.min(70, count / Math.max(...result.histogram.counts) * 70)"
              width="13"
              :height="Math.max(2, Math.min(70, count / Math.max(...result.histogram.counts) * 70))"
              rx="3"
              :fill="i < 3 ? '#94a3b8' : i > 10 ? '#ef4444' : '#5b4bb7'"
            />
            <line x1="6" y1="80" x2="254" y2="80" stroke="#cbd5e1" />
          </svg>

          <div class="table-wrap mt-3">
            <table class="data">
              <thead><tr><th>行</th><th class="num">平均受光</th><th class="num">风险穗</th></tr></thead>
              <tbody>
                <tr v-for="row in result.rowStats.slice(0, 8)" :key="row.rowId">
                  <td>第 {{ row.rowId + 1 }} 行</td>
                  <td class="num">{{ row.meanTotalMJ.toFixed(1) }}</td>
                  <td class="num"><span class="badge" :class="row.riskFruitCount ? 'danger' : 'success'">{{ row.riskFruitCount }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  </div>
</template>
