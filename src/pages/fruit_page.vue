<script setup lang="ts">
import { computed, ref } from 'vue'
import Icon from '../components/icon.vue'
import Viewport3D from '../components/viewport_3d.vue'
import { buildCanopyModel } from '../lib/canopy'
import { exportDetailedLeafCsv } from '../lib/exporter'
import { runSelectedSimulation, saveScheme, selectedPlot, selectedScheme, store } from '../lib/store'

const plot = computed(() => selectedPlot())
const scheme = computed(() => selectedScheme())
const result = computed(() => store.result)
const riskOnly = ref(false)

const model = computed(() => {
  if (!plot.value || !scheme.value || !result.value) return null
  if (result.value.schemeId !== scheme.value.id) return null
  return buildCanopyModel(plot.value, scheme.value)
})

const rows = computed(() => {
  if (!result.value || !model.value) return []
  const threshold = scheme.value?.simulation.sunburnThresholdC ?? 40
  return result.value.fruitResults.map((fr) => {
    const fruit = model.value?.fruits[fr.fruitId]
    return {
      ...fr,
      rowId: fruit?.rowId ?? -1,
      plantId: fruit?.plantId ?? -1,
      x: fruit?.x ?? 0,
      y: fruit?.y ?? 0,
      z: fruit?.z ?? 0,
      dynamicRisk: fr.peakTempC >= threshold
    }
  }).filter((row) => !riskOnly.value || row.dynamicRisk)
    .sort((a, b) => b.peakTempC - a.peakTempC)
})

const riskCount = computed(() => rows.value.filter((r) => r.dynamicRisk).length)
const maxTemp = computed(() => result.value ? Math.max(...result.value.fruitResults.map((f) => f.peakTempC)) : 0)
const meanAfternoon = computed(() => {
  if (!result.value || !result.value.fruitResults.length) return 0
  return result.value.fruitResults.reduce((s, f) => s + f.afternoonMinutes, 0) / result.value.fruitResults.length
})

function exportFruitCsv() {
  if (!result.value) return
  const header = 'fruit_id,row_id,plant_id,afternoon_minutes,direct_minutes,peak_temp_c,risk,x,y,z'
  const lines = rows.value.map((r) => [
    r.fruitId, r.rowId, r.plantId, r.afternoonMinutes.toFixed(1), r.directMinutes.toFixed(1),
    r.peakTempC.toFixed(2), r.dynamicRisk ? 'risk' : 'safe', r.x.toFixed(2), r.y.toFixed(2), r.z.toFixed(2)
  ].join(','))
  const blob = new Blob(['﻿' + [header, ...lines].join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${result.value.schemeName}-果穗晒伤评估.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function exportLeaves() {
  if (result.value && model.value) exportDetailedLeafCsv(result.value, model.value.leaves)
}
</script>

<template>
  <div v-if="plot && scheme">
    <header class="topbar">
      <div>
        <h1 class="page-title">果穗评估</h1>
        <p class="page-desc">逐果穗计算午后直射时长、暴露比例和最高果温。红色为超过温度阈值的晒伤风险果穗，橙色为接近阈值。</p>
      </div>
      <div class="top-actions">
        <button class="btn" :disabled="!result" @click="exportFruitCsv"><Icon name="download" :size="17" />果穗 CSV</button>
        <button class="btn primary" :disabled="store.running" @click="runSelectedSimulation"><Icon name="play" :size="17" />重新推演并评估</button>
      </div>
    </header>

    <div v-if="!result" class="empty card">
      <div class="empty-icon"><Icon name="grape" :size="28" /></div>
      <div class="empty-title">尚未生成本地方案的推演结果</div>
      <p class="empty-desc">果穗午后直射和温度来自 WebGPU 逐时刻遮挡计算。点击按钮后会按当前日期、天气和修剪状态完整推演。</p>
      <button class="btn primary" :disabled="store.running" @click="runSelectedSimulation"><Icon name="play" :size="17" />开始推演</button>
    </div>

    <template v-else>
      <section class="grid grid-4 mb-4">
        <div class="kpi"><div class="kpi-label">果穗总数</div><div class="kpi-value">{{ result.fruitCount }}</div><div class="kpi-foot">{{ result.rowCount }} 行</div></div>
        <div class="kpi"><div class="kpi-label">晒伤风险</div><div class="kpi-value" :style="{color: riskCount ? 'var(--danger)' : 'var(--success)'}">{{ riskCount }}<span class="kpi-unit">穗</span></div><div class="kpi-foot">{{ (riskCount / Math.max(1, result.fruitCount) * 100).toFixed(1) }}%</div></div>
        <div class="kpi"><div class="kpi-label">平均午后直射</div><div class="kpi-value">{{ meanAfternoon.toFixed(0) }}<span class="kpi-unit">分钟</span></div></div>
        <div class="kpi"><div class="kpi-label">最高果温</div><div class="kpi-value" :style="{color: maxTemp >= scheme.simulation.sunburnThresholdC ? 'var(--danger)' : 'var(--text)'}">{{ maxTemp.toFixed(1) }}<span class="kpi-unit">°C</span></div></div>
      </section>

      <div class="grid layout-sim">
        <div class="grid" style="gap:var(--sp-4); align-content:start">
          <Viewport3D :plot="plot" :scheme="scheme" :result="result" heat="fruit" :show-voxel="store.settings.showVoxel" :voxel-size="store.settings.cellSizeM" class="compact" />
          <section class="card card-pad">
            <div class="field">
              <label>晒伤温度阈值 <span class="value">{{ scheme.simulation.sunburnThresholdC }} °C</span></label>
              <input v-model.number="scheme.simulation.sunburnThresholdC" type="range" min="34" max="46" step="0.5" data-testid="sunburn-threshold" @change="saveScheme(scheme)" />
            </div>
            <label class="check-row"><input type="checkbox" v-model="riskOnly" />只看风险 / 超阈值果穗</label>
            <div class="btn-row mt-4">
              <button class="btn sm" @click="exportFruitCsv"><Icon name="download" :size="15" />导出当前表</button>
              <button class="btn sm" @click="exportLeaves"><Icon name="download" :size="15" />导出叶片明细</button>
            </div>
          </section>
        </div>

        <section class="card">
          <div class="card-head">
            <div><div class="card-title">逐果穗评估表</div><div class="card-sub">按峰值果温降序；温度模型包含气温、直射辐射、散射和风速冷却</div></div>
            <span class="badge danger" v-if="riskCount">{{ riskCount }} 个风险</span>
          </div>
          <div class="table-wrap" style="max-height:calc(100vh - 250px); overflow:auto">
            <table class="data">
              <thead>
                <tr>
                  <th>果穗</th><th>行 / 株</th><th class="num">午后直射</th><th class="num">全天直射</th>
                  <th class="num">暴露率</th><th class="num">峰值温度</th><th>风险</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in rows.slice(0, 500)" :key="row.fruitId">
                  <td><strong>#{{ row.fruitId + 1 }}</strong></td>
                  <td>第 {{ row.rowId + 1 }} 行 / #{{ row.plantId + 1 }}</td>
                  <td class="num">{{ row.afternoonMinutes.toFixed(0) }} min</td>
                  <td class="num">{{ row.directMinutes.toFixed(0) }} min</td>
                  <td class="num">{{ (row.exposureRatio * 100).toFixed(0) }}%</td>
                  <td class="num"><strong :style="{color: row.dynamicRisk ? 'var(--danger)' : 'var(--success)'}">{{ row.peakTempC.toFixed(1) }}°C</strong></td>
                  <td><span class="badge" :class="row.dynamicRisk ? 'danger' : row.peakTempC >= scheme.simulation.sunburnThresholdC - 3 ? 'warning' : 'success'">{{ row.dynamicRisk ? '晒伤风险' : row.peakTempC >= scheme.simulation.sunburnThresholdC - 3 ? '接近阈值' : '安全' }}</span></td>
                </tr>
              </tbody>
            </table>
            <p v-if="rows.length > 500" class="help" style="padding:var(--sp-3)">页面仅渲染前 500 条，完整结果请导出 CSV。</p>
            <div v-if="rows.length === 0" class="empty"><div class="empty-title">当前筛选下没有果穗</div></div>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
