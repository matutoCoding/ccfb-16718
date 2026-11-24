import { reactive, markRaw } from 'vue'
import type { AppSettings, Plot, Scheme, SimulationResult, ToastMessage } from '../types'
import { db } from './db'
import { DEFAULT_SETTINGS, createScheme } from './defaults'
import { runSimulation } from './run_simulation'
import { uid } from './math'
import { clonePlain } from './clone_plain'

const PAGE_IDS = ['plots', 'trellis', 'canopy', 'light', 'fruit', 'compare', 'settings']

function initialPage() {
  const hash = window.location.hash.replace(/^#\/?/, '')
  return PAGE_IDS.includes(hash) ? hash : 'plots'
}

interface StoreState {
  ready: boolean
  page: string
  plots: Plot[]
  schemes: Scheme[]
  settings: AppSettings
  selectedPlotId: string
  selectedSchemeId: string
  running: boolean
  runLabel: string
  result: SimulationResult | null
  compareIds: string[]
  compareResults: SimulationResult[]
  comparing: boolean
  toasts: ToastMessage[]
  webgpuSupported: boolean | null
}

export const store = reactive<StoreState>({
  ready: false,
  page: initialPage(),
  plots: [],
  schemes: [],
  settings: DEFAULT_SETTINGS,
  selectedPlotId: '',
  selectedSchemeId: '',
  running: false,
  runLabel: '',
  result: null,
  compareIds: [],
  compareResults: [],
  comparing: false,
  toasts: [],
  webgpuSupported: null
})

let toastId = 0

export function toast(text: string, type: ToastMessage['type'] = 'info') {
  const id = ++toastId
  store.toasts.push({ id, text, type })
  setTimeout(() => {
    const index = store.toasts.findIndex((t) => t.id === id)
    if (index >= 0) store.toasts.splice(index, 1)
  }, 3600)
}

export async function initStore() {
  await db.seedIfNeeded()
  const [plots, schemes, settings] = await Promise.all([
    db.getAllPlots(),
    db.getAllSchemes(),
    db.getSettings()
  ])
  store.plots = plots.sort((a, b) => {
    const order: Record<string, number> = { 'plot-south': 0, 'plot-east': 1, 'plot-flat': 2 }
    return (order[a.id] ?? 99) - (order[b.id] ?? 99) || a.createdAt.localeCompare(b.createdAt)
  })
  store.schemes = schemes.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  store.settings = settings
  store.selectedPlotId = store.plots.find((p) => p.id === 'plot-south')?.id ?? store.plots[0]?.id ?? ''
  store.selectedSchemeId = store.schemes.find((s) => s.id === 'scheme-south-single-ns')?.id
    ?? store.schemes.find((s) => s.plotId === store.selectedPlotId)?.id
    ?? store.schemes[0]?.id
    ?? ''
  store.ready = true
  if (typeof navigator !== 'undefined' && navigator.gpu) {
    try {
      const adapter = await navigator.gpu.requestAdapter()
      store.webgpuSupported = Boolean(adapter)
    } catch {
      store.webgpuSupported = false
    }
  } else {
    store.webgpuSupported = false
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('hashchange', () => {
      const page = initialPage()
      if (page !== store.page) store.page = page
    })
    ;(window as unknown as Record<string, unknown>).__CANOPY_LAB__ = {
      store,
      runSelected: runSelectedSimulation,
      getResult: () => store.result
    }
  }
}

export function setPage(page: string) {
  store.page = page
  window.history.replaceState(null, '', `#${page}`)
}

export function selectedPlot(): Plot | undefined {
  return store.plots.find((p) => p.id === store.selectedPlotId)
}

export function selectedScheme(): Scheme | undefined {
  return store.schemes.find((s) => s.id === store.selectedSchemeId)
}

export function schemesForPlot(plotId: string) {
  return store.schemes.filter((s) => s.plotId === plotId)
}

export function selectPlot(plotId: string) {
  store.selectedPlotId = plotId
  const first = store.schemes.find((s) => s.plotId === plotId)
  if (first) store.selectedSchemeId = first.id
}

export function selectScheme(schemeId: string) {
  store.selectedSchemeId = schemeId
  const scheme = selectedScheme()
  if (scheme) store.selectedPlotId = scheme.plotId
}

export async function savePlot(plotInput: Plot) {
  const plot = clonePlain(plotInput)
  plot.updatedAt = new Date().toISOString()
  const index = store.plots.findIndex((p) => p.id === plot.id)
  if (index >= 0) store.plots[index] = plot
  else store.plots.push(plot)
  store.selectedPlotId = plot.id
  await db.putPlot(plot)
}

export async function removePlot(plotId: string) {
  await db.deleteSchemesByPlot(plotId)
  await db.deletePlot(plotId)
  store.plots = store.plots.filter((p) => p.id !== plotId)
  store.schemes = store.schemes.filter((s) => s.plotId !== plotId)
  if (store.selectedPlotId === plotId) {
    store.selectedPlotId = store.plots[0]?.id ?? ''
    store.selectedSchemeId = store.schemes.find((s) => s.plotId === store.selectedPlotId)?.id ?? ''
  }
  toast('地块及其方案已删除', 'success')
}

export async function saveScheme(schemeInput: Scheme) {
  const scheme = clonePlain(schemeInput)
  scheme.updatedAt = new Date().toISOString()
  const index = store.schemes.findIndex((s) => s.id === scheme.id)
  if (index >= 0) store.schemes[index] = scheme
  else store.schemes.push(scheme)
  store.selectedSchemeId = scheme.id
  store.selectedPlotId = scheme.plotId
  await db.putScheme(scheme)
}

export async function removeScheme(schemeId: string) {
  await db.deleteScheme(schemeId)
  store.schemes = store.schemes.filter((s) => s.id !== schemeId)
  if (store.selectedSchemeId === schemeId) {
    const next = store.schemes.find((s) => s.plotId === store.selectedPlotId) ?? store.schemes[0]
    store.selectedSchemeId = next?.id ?? ''
  }
  toast('方案已删除', 'success')
}

export async function duplicateScheme(scheme: Scheme) {
  const copy: Scheme = {
    ...clonePlain(scheme),
    id: uid('scheme'),
    name: `${scheme.name} 副本`,
    builtin: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  await saveScheme(copy)
  toast('方案已复制，可在表单中调整', 'success')
}

export function newSchemeForPlot(plot: Plot) {
  const scheme = createScheme(plot, { name: `${plot.name} · 新架式方案` })
  return scheme
}

export async function updateSettings(patch: Partial<AppSettings>) {
  Object.assign(store.settings, patch)
  if (patch.timeStepMinutes) {
    for (const scheme of store.schemes) scheme.simulation.timeStepMinutes = patch.timeStepMinutes
  }
  if (patch.sunburnThresholdC !== undefined) {
    for (const scheme of store.schemes) scheme.simulation.sunburnThresholdC = patch.sunburnThresholdC
  }
  await Promise.all(store.schemes.map((scheme) => db.putScheme(clonePlain(scheme))))
  await db.putSettings(clonePlain(store.settings))
}

export async function runSelectedSimulation() {
  const plot = selectedPlot()
  const scheme = selectedScheme()
  if (!plot || !scheme) {
    toast('请先选择地块和方案', 'warning')
    return null
  }
  store.running = true
  store.runLabel = '正在生成冠层、写入体素并提交 WebGPU 计算…'
  try {
    const result = markRaw(await runSimulation({ plot, scheme, settings: store.settings }))
    store.result = result
    toast(`推演完成：${result.leafCount.toLocaleString()} 片叶，耗时 ${result.totalElapsedMs.toFixed(0)} ms`, 'success')
    return result
  } catch (error) {
    console.error(error)
    toast(`推演失败：${error instanceof Error ? error.message : '未知错误'}`, 'error')
    return null
  } finally {
    store.running = false
    store.runLabel = ''
  }
}

export async function runCompare(ids: string[]) {
  const schemes = ids.map((id) => store.schemes.find((s) => s.id === id)).filter((s): s is Scheme => Boolean(s))
  if (schemes.length < 2) {
    toast('请至少选择两个方案', 'warning')
    return
  }
  store.comparing = true
  store.compareResults = []
  try {
    const results: SimulationResult[] = []
    for (const scheme of schemes) {
      const plot = store.plots.find((p) => p.id === scheme.plotId)
      if (!plot) continue
      store.runLabel = `正在推演：${scheme.name}`
      const result = markRaw(await runSimulation({ plot, scheme, settings: store.settings }))
      results.push(result)
      store.compareResults = [...results]
    }
    toast(`已完成 ${results.length} 个方案对比推演`, 'success')
  } finally {
    store.comparing = false
    store.runLabel = ''
  }
}

export async function resetAllData() {
  await db.resetSeedData()
  const [plots, schemes, settings] = await Promise.all([
    db.getAllPlots(), db.getAllSchemes(), db.getSettings()
  ])
  store.plots = plots
  store.schemes = schemes
  store.settings = settings
  store.selectedPlotId = plots.find((p) => p.id === 'plot-south')?.id ?? plots[0].id
  store.selectedSchemeId = schemes.find((s) => s.id === 'scheme-south-single-ns')?.id ?? schemes[0].id
  store.result = null
  store.compareResults = []
  toast('已恢复三块测试地块和默认方案', 'success')
}
