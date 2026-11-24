<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import Icon from '../components/icon.vue'
import Viewport3D from '../components/viewport_3d.vue'
import { buildCanopyModel } from '../lib/canopy'
import { exportDetailedLeafCsv, exportResultCsv } from '../lib/exporter'
import { validatePrecision } from '../lib/validation'
import { downloadText } from '../lib/math'
import {
  runSelectedSimulation, saveScheme, selectedPlot, selectedScheme, store, toast
} from '../lib/store'
import type { ValidationReport } from '../types'

const viewportRef = ref<InstanceType<typeof Viewport3D> | null>(null)
const colorMode = ref<'daily' | 'instant'>('daily')
const timeIndex = ref(0)
const playing = ref(false)
const heatDomain = ref(20)
const precision = ref<ValidationReport | null>(null)
let playTimer: ReturnType<typeof setInterval> | null = null

const plot = computed(() => selectedPlot())
const scheme = computed(() => selectedScheme())
const result = computed(() => store.result)
const timePoint = computed(() => {
  const points = result.value?.timePoints
  if (!points || points.length === 0) return undefined
  return points[Math.min(timeIndex.value, points.length - 1)]
})

watch(result, (value) => {
  if (!value) return
  const noonIndex = value.timePoints.findIndex((t) => t.hour >= 12.2)
  timeIndex.value = Math.max(0, noonIndex)
  colorMode.value = 'daily'
  precision.value = value.validation
}, { immediate: true })

async function onRun() {
  const value = await runSelectedSimulation()
  if (value) precision.value = value.validation
}

function changeScheme(event: Event) {
  store.selectedSchemeId = (event.target as HTMLSelectElement).value
}

async function rerunPrecision() {
  precision.value = await validatePrecision(store.settings.preferredEngine === 'auto' ? 'webgpu' : store.settings.preferredEngine)
  toast(precision.value.passed ? `精度自检通过，误差 ${(precision.value.relativeError * 100).toFixed(3)}%` : '精度误差超过 1%', precision.value.passed ? 'success' : 'error')
}

function stopPlay() {
  playing.value = false
  if (playTimer) clearInterval(playTimer)
  playTimer = null
}
function togglePlay() {
  if (playing.value) return stopPlay()
  if (!result.value) return
  playing.value = true
  colorMode.value = 'instant'
  playTimer = setInterval(() => {
    const length = result.value?.timePoints.length ?? 1
    timeIndex.value = (timeIndex.value + 1) % length
  }, 420)
}
onBeforeUnmount(() => {
  stopPlay()
  saveSimulation()
})

function captureCurrent() {
  const url = viewportRef.value?.capture()
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = `${result.value?.schemeName ?? '方案'}-${timePoint.value?.label ?? '日累计'}.png`
  a.click()
  toast('关键时刻截图已导出', 'success')
}

function captureAtHour(targetHour: number) {
  if (!result.value) return
  const index = result.value.timePoints.reduce((best, tp, i) => (
    Math.abs(tp.hour - targetHour) < Math.abs(result.value!.timePoints[best].hour - targetHour) ? i : best
  ), 0)
  timeIndex.value = index
  colorMode.value = 'instant'
  setTimeout(captureCurrent, 180)
}

function exportCsv() {
  if (result.value) exportResultCsv(result.value)
}

function exportDetailed() {
  if (!result.value || !plot.value || !scheme.value) return
  const model = buildCanopyModel(plot.value, scheme.value)
  exportDetailedLeafCsv(result.value, model.leaves)
}

function saveSimulation() {
  if (scheme.value) saveScheme(scheme.value)
}

function downloadFormulaReport() {
  if (!precision.value) return
  const text = [
    '单片叶无遮挡直射精度自检',
    `公式: ${precision.value.formula}`,
    `期望 W/m2: ${precision.value.expectedWm2.toFixed(4)}`,
    `WebGPU/CPU 实际 W/m2: ${precision.value.actualWm2.toFixed(4)}`,
    `相对误差: ${(precision.value.relativeError * 100).toFixed(4)}%`,
    `验收阈值: <1%`,
    `结论: ${precision.value.passed ? 'PASS' : 'FAIL'}`
  ].join('\n')
  downloadText('单片叶精度自检.txt', text, 'text/plain;charset=utf-8')
}
</script>

<template>
  <div v-if="plot && scheme">
    <header class="topbar">
      <div>
        <h1 class="page-title">受光推演</h1>
        <p class="page-desc">太阳位置按经纬度、日期和真太阳时计算；WGSL 计算着色器逐叶累计直射、散射和行间体素遮挡。拖动时间轴可查看阴影移动。</p>
      </div>
      <div class="top-actions">
        <span class="badge" :class="store.webgpuSupported ? 'success' : 'warning'">
          {{ store.webgpuSupported ? 'WebGPU 设备可用' : 'WebGPU 不可用，将 CPU 兜底' }}
        </span>
        <button class="btn primary" data-testid="run-simulation" :disabled="store.running" @click="onRun">
          <Icon name="play" :size="17" />{{ store.running ? '推演中…' : '开始全天推演' }}
        </button>
      </div>
    </header>

    <div class="grid layout-sim">
      <div class="grid" style="gap:var(--sp-4); align-content:start">
        <section class="card card-pad">
          <div class="field">
            <label>推演方案</label>
            <select class="input" :value="scheme.id" @change="changeScheme">
              <option v-for="s in store.schemes.filter((x) => x.plotId === plot.id)" :key="s.id" :value="s.id">{{ s.name }}</option>
            </select>
          </div>
          <div class="field-grid">
            <div class="field">
              <label>日期</label>
              <input v-model="scheme.simulation.date" type="date" class="input" @change="saveSimulation" />
            </div>
            <div class="field">
              <label>时间步长</label>
              <select v-model.number="scheme.simulation.timeStepMinutes" class="input" @change="saveSimulation">
                <option :value="15">15 分钟</option>
                <option :value="20">20 分钟</option>
                <option :value="30">30 分钟</option>
                <option :value="60">60 分钟</option>
              </select>
            </div>
            <div class="field">
              <label>最低气温 °C</label>
              <input v-model.number="scheme.simulation.ambientMinC" type="number" class="input" @change="saveSimulation" />
            </div>
            <div class="field">
              <label>最高气温 °C</label>
              <input v-model.number="scheme.simulation.ambientMaxC" type="number" class="input" @change="saveSimulation" />
            </div>
            <div class="field">
              <label>风速 m/s</label>
              <input v-model.number="scheme.simulation.windSpeedMs" type="number" step="0.1" class="input" @change="saveSimulation" />
            </div>
            <div class="field">
              <label>晒伤阈值 °C</label>
              <input v-model.number="scheme.simulation.sunburnThresholdC" type="number" class="input" @change="saveSimulation" />
            </div>
          </div>
          <label class="check-row"><input v-model="scheme.simulation.occlusionEnabled" type="checkbox" @change="saveSimulation" />启用行间 / 株间遮挡计算</label>
          <div v-if="store.running" class="mt-4">
            <div class="progress"><i style="width:72%"></i></div>
            <p class="help mt-2">{{ store.runLabel }}</p>
          </div>
          <div v-if="result" class="grid grid-3 mt-4">
            <div class="kpi" style="padding:var(--sp-3)">
              <div class="kpi-label">总耗时</div>
              <div class="kpi-value" data-testid="elapsed-ms" :style="{color: result.totalElapsedMs < 5000 ? 'var(--success)' : 'var(--danger)'}">
                {{ result.totalElapsedMs.toFixed(0) }}<span class="kpi-unit">ms</span>
              </div>
              <div class="kpi-foot">
                <span class="badge" :class="result.totalElapsedMs < 5000 ? 'success' : 'danger'" data-testid="performance-badge">
                  {{ result.totalElapsedMs < 5000 ? '5 秒验收通过' : '超过 5 秒目标' }}
                </span>
              </div>
            </div>
            <div class="kpi" style="padding:var(--sp-3)"><div class="kpi-label">GPU 计算</div><div class="kpi-value">{{ result.computeMs.toFixed(0) }}<span class="kpi-unit">ms</span></div></div>
            <div class="kpi" style="padding:var(--sp-3)"><div class="kpi-label">叶片数</div><div class="kpi-value">{{ (result.leafCount / 10000).toFixed(1) }}<span class="kpi-unit">万</span></div></div>
          </div>
        </section>

        <section class="card card-pad">
          <div class="flex-between mb-3">
            <div class="card-title" style="font-size:var(--fs-md)">单片叶精度自检</div>
            <span class="badge" :class="precision?.passed ? 'success' : 'danger'">{{ precision?.passed ? '误差 < 1%' : '未通过' }}</span>
          </div>
          <template v-if="precision">
            <p class="small muted mono">{{ precision.formula }}</p>
            <div class="bar-row" style="grid-template-columns:88px 1fr 70px">
              <span class="muted">公式值</span><div class="bar-track"><div class="bar-fill good" style="width:100%"></div></div><strong>{{ precision.expectedWm2.toFixed(1) }}</strong>
            </div>
            <div class="bar-row" style="grid-template-columns:88px 1fr 70px">
              <span class="muted">计算值</span><div class="bar-track"><div class="bar-fill" :class="precision.passed ? 'good' : 'bad'" :style="`width:${Math.min(100, precision.actualWm2 / precision.expectedWm2 * 100)}%`"></div></div><strong>{{ precision.actualWm2.toFixed(1) }}</strong>
            </div>
            <div class="btn-row mt-3">
              <button class="btn sm" @click="rerunPrecision"><Icon name="refresh" :size="15" />重新自检</button>
              <button class="btn sm" @click="downloadFormulaReport"><Icon name="download" :size="15" />导出报告</button>
            </div>
          </template>
        </section>
      </div>

      <div class="grid" style="gap:var(--sp-4); align-content:start">
        <Viewport3D
          ref="viewportRef"
          :plot="plot"
          :scheme="scheme"
          :result="result"
          :heat="colorMode"
          :time-index="timeIndex"
          :show-voxel="store.settings.showVoxel"
          :voxel-size="store.settings.cellSizeM"
          @heat-domain="heatDomain = $event"
        >
          <template #overlay>
            <button class="btn sm" :class="{ primary: colorMode === 'daily' }" @click="colorMode = 'daily'">日累计上色</button>
            <button class="btn sm" :class="{ primary: colorMode === 'instant' }" @click="colorMode = 'instant'">当前时刻</button>
            <button class="btn sm" @click="captureCurrent"><Icon name="camera" :size="15" />截图</button>
            <button class="btn sm" @click="captureAtHour(12.2)">正午截图</button>
            <button class="btn sm" @click="captureAtHour(15)">15点截图</button>
          </template>
        </Viewport3D>

        <section class="card card-body tight">
          <div class="timeline">
            <button class="btn sm primary" @click="togglePlay"><Icon name="play" :size="15" />{{ playing ? '暂停' : '播放' }}</button>
            <input
              v-if="result"
              v-model.number="timeIndex"
              type="range"
              min="0"
              :max="Math.max(0, result.timePoints.length - 1)"
              step="1"
              data-testid="time-slider"
              @input="colorMode = 'instant'"
            />
            <input v-else type="range" disabled />
            <div class="time-label">{{ timePoint?.label ?? '--:--' }}</div>
          </div>
          <div class="flex-between mt-3 wrap">
            <div class="legend">
              <span>低</span><span class="legend-bar"></span><span>高 {{ colorMode === 'daily' ? heatDomain.toFixed(1) + ' MJ/m²' : '950 W/m²' }}</span>
            </div>
            <div class="btn-row">
              <button class="btn sm" :disabled="!result" @click="exportCsv"><Icon name="download" :size="15" />行级统计表</button>
              <button class="btn sm" :disabled="!result" @click="exportDetailed"><Icon name="download" :size="15" />叶片明细</button>
            </div>
          </div>
          <div v-if="timePoint" class="flex wrap mt-3">
            <span class="badge info">太阳高度 {{ timePoint.elevationDeg.toFixed(1) }}°</span>
            <span class="badge info">方位 {{ timePoint.azimuthDeg.toFixed(1) }}°</span>
            <span class="badge">直射 DNI {{ timePoint.dniWm2.toFixed(0) }} W/m²</span>
            <span class="badge">散射 DHI {{ timePoint.dhiWm2.toFixed(0) }} W/m²</span>
            <span class="badge warning">气温 {{ timePoint.airTempC.toFixed(1) }}°C</span>
          </div>
        </section>

        <section v-if="result" class="grid grid-4">
          <div class="kpi"><div class="kpi-label">平均日直射</div><div class="kpi-value">{{ result.meanDirectMJ.toFixed(2) }}<span class="kpi-unit">MJ/m²</span></div></div>
          <div class="kpi"><div class="kpi-label">平均日散射</div><div class="kpi-value">{{ result.meanDiffuseMJ.toFixed(2) }}<span class="kpi-unit">MJ/m²</span></div></div>
          <div class="kpi"><div class="kpi-label">P10 / P50 / P90</div><div class="kpi-value" style="font-size:var(--fs-lg)">{{ result.p10TotalMJ.toFixed(1) }} / {{ result.p50TotalMJ.toFixed(1) }} / {{ result.p90TotalMJ.toFixed(1) }}</div></div>
          <div class="kpi"><div class="kpi-label">受光良好叶片</div><div class="kpi-value">{{ (result.sunlitLeafRatio * 100).toFixed(1) }}<span class="kpi-unit">%</span></div></div>
        </section>
      </div>
    </div>
  </div>

  <div v-else class="empty card">
    <div class="empty-icon"><Icon name="sun" :size="28" /></div>
    <div class="empty-title">还没有可推演的地块或方案</div>
    <p class="empty-desc">系统初始化后会自动创建南坡、东坡和平地三块测试地。请先到地块档案或架式设计中新建方案。</p>
  </div>
</template>
