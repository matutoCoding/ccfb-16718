<script setup lang="ts">
import { ref } from 'vue'
import Icon from '../components/icon.vue'
import { db } from '../lib/db'
import { downloadText } from '../lib/math'
import { validatePrecision } from '../lib/validation'
import { resetAllData, store, toast, updateSettings } from '../lib/store'
import type { ValidationReport } from '../types'

const precision = ref<ValidationReport | null>(null)
const checking = ref(false)
const importInput = ref<HTMLInputElement | null>(null)

async function checkPrecision() {
  checking.value = true
  try {
    precision.value = await validatePrecision(store.settings.preferredEngine === 'cpu' ? 'cpu' : 'webgpu')
  } finally {
    checking.value = false
  }
}

async function exportDatabase() {
  const [plots, schemes] = await Promise.all([db.getAllPlots(), db.getAllSchemes()])
  downloadText('grape-canopy-lab-backup.json', JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    plots,
    schemes,
    settings: store.settings
  }, null, 2), 'application/json;charset=utf-8')
}

async function importDatabase(file: File) {
  try {
    const data = JSON.parse(await file.text()) as {
      plots?: Parameters<typeof db.putPlot>[0][]
      schemes?: Parameters<typeof db.putScheme>[0][]
    }
    if (!Array.isArray(data.plots) || !Array.isArray(data.schemes)) throw new Error('备份文件缺少 plots 或 schemes 数组')
    for (const plot of data.plots) await db.putPlot(plot)
    for (const scheme of data.schemes) await db.putScheme(scheme)
    toast('数据已导入，页面即将刷新', 'success')
    setTimeout(() => window.location.reload(), 700)
  } catch (error) {
    toast(error instanceof Error ? error.message : '导入失败', 'error')
  }
}

function onFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (file) importDatabase(file)
}
</script>

<template>
  <div>
    <header class="topbar">
      <div>
        <h1 class="page-title">设置与验收工具</h1>
        <p class="page-desc">配置计算引擎、辐射模型参数和晒伤阈值；管理 IndexedDB 数据，运行单片叶公式精度自检。</p>
      </div>
    </header>

    <div class="grid grid-2" style="align-items:start">
      <section class="card card-pad">
        <div class="section-title">计算引擎</div>
        <div class="field">
          <label>首选引擎</label>
          <select class="input" :value="store.settings.preferredEngine" @change="updateSettings({ preferredEngine: ($event.target as HTMLSelectElement).value as 'auto' | 'webgpu' | 'cpu' })">
            <option value="auto">自动：优先 WebGPU，失败时 CPU 兜底</option>
            <option value="webgpu">强制 WebGPU</option>
            <option value="cpu">CPU 参考求解器</option>
          </select>
        </div>
        <div class="field-grid">
          <div class="field">
            <label>默认时间步长</label>
            <select class="input" :value="store.settings.timeStepMinutes" @change="updateSettings({ timeStepMinutes: Number(($event.target as HTMLSelectElement).value) as 15 | 20 | 30 | 60 })">
              <option :value="15">15 分钟</option>
              <option :value="20">20 分钟</option>
              <option :value="30">30 分钟（推荐）</option>
              <option :value="60">60 分钟</option>
            </select>
          </div>
          <div class="field">
            <label>遮挡体素尺寸 <span class="value">{{ store.settings.cellSizeM.toFixed(2) }} m</span></label>
            <input type="range" min="0.25" max="0.7" step="0.05" :value="store.settings.cellSizeM" @input="updateSettings({ cellSizeM: Number(($event.target as HTMLInputElement).value) })" />
          </div>
          <div class="field">
            <label>冠层消光系数 G <span class="value">{{ store.settings.extinctionG.toFixed(2) }}</span></label>
            <input type="range" min="0.3" max="0.8" step="0.02" :value="store.settings.extinctionG" @input="updateSettings({ extinctionG: Number(($event.target as HTMLInputElement).value) })" />
          </div>
          <div class="field">
            <label>全局晒伤阈值 <span class="value">{{ store.settings.sunburnThresholdC }} °C</span></label>
            <input type="range" min="34" max="46" step="0.5" :value="store.settings.sunburnThresholdC" @input="updateSettings({ sunburnThresholdC: Number(($event.target as HTMLInputElement).value) })" />
          </div>
        </div>
        <label class="check-row mb-3"><input type="checkbox" :checked="store.settings.showVoxel" @change="updateSettings({ showVoxel: ($event.target as HTMLInputElement).checked })" />在三维视图中显示非空遮挡体素</label>
        <label class="check-row"><input type="checkbox" :checked="store.settings.reduceMotion" @change="updateSettings({ reduceMotion: ($event.target as HTMLInputElement).checked })" />减少动画与时间轴自动播放动效</label>

        <div class="section-title">WebGPU 状态</div>
        <div class="flex wrap">
          <span class="badge" :class="store.webgpuSupported ? 'success' : 'warning'">{{ store.webgpuSupported ? 'navigator.gpu 可用' : '未检测到 WebGPU adapter' }}</span>
          <span class="badge info">WGSL leafMain / fruitMain</span>
          <span class="badge">IndexedDB: grape-canopy-light-lab</span>
        </div>
      </section>

      <section class="card card-pad">
        <div class="section-title">验收：单片叶公式误差</div>
        <p class="help mb-3">构造水平、无遮挡叶片，只运行一个直接辐射时刻。WGSL 输出的 MJ 积分会还原为 W/m²，并与 <code>DNI × sin(太阳高度角)</code> 比较，阈值为 1%。</p>
        <button class="btn primary" :disabled="checking" @click="checkPrecision"><Icon name="refresh" :size="17" />{{ checking ? '正在提交计算…' : '运行精度自检' }}</button>
        <div v-if="precision" class="mt-4">
          <div class="flex-between mb-3">
            <strong>相对误差 {{ (precision.relativeError * 100).toFixed(4) }}%</strong>
            <span class="badge" :class="precision.passed ? 'success' : 'danger'">{{ precision.passed ? 'PASS (<1%)' : 'FAIL' }}</span>
          </div>
          <div class="table-wrap">
            <table class="data">
              <tbody>
                <tr><td>公式期望</td><td class="num">{{ precision.expectedWm2.toFixed(4) }} W/m²</td></tr>
                <tr><td>计算着色器实际</td><td class="num">{{ precision.actualWm2.toFixed(4) }} W/m²</td></tr>
                <tr><td>绝对偏差</td><td class="num">{{ Math.abs(precision.actualWm2 - precision.expectedWm2).toFixed(4) }} W/m²</td></tr>
              </tbody>
            </table>
          </div>
          <p class="small muted mt-3">{{ precision.formula }}</p>
        </div>

        <div class="section-title">数据管理</div>
        <div class="btn-row">
          <button class="btn" @click="exportDatabase"><Icon name="database" :size="17" />导出全部地块 / 方案</button>
          <button class="btn" @click="importInput?.click()"><Icon name="download" :size="17" />导入备份</button>
          <input ref="importInput" type="file" accept=".json,application/json" hidden @change="onFile" />
          <button class="btn danger" @click="resetAllData"><Icon name="refresh" :size="17" />恢复三块测试地</button>
        </div>
        <p class="help mt-3">测试地块：南坡向阳园（坡向 182°、坡度 11°）、东坡迎暾园（92°、15°）、平地方正园（0°、0°），每块约 666.7 m²，并内置三种架式 / 行向方案。</p>
      </section>
    </div>
  </div>
</template>
