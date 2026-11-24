<script setup lang="ts">
import { computed } from 'vue'
import Icon from './components/icon.vue'
import PlotPage from './pages/plot_page.vue'
import TrellisPage from './pages/trellis_page.vue'
import CanopyPage from './pages/canopy_page.vue'
import LightPage from './pages/light_page.vue'
import FruitPage from './pages/fruit_page.vue'
import ComparePage from './pages/compare_page.vue'
import SettingsPage from './pages/settings_page.vue'
import { setPage, store } from './lib/store'

const nav = [
  { id: 'plots', label: '地块档案', icon: 'plot' },
  { id: 'trellis', label: '架式设计', icon: 'trellis' },
  { id: 'canopy', label: '冠层生长', icon: 'leaf' },
  { id: 'light', label: '受光推演', icon: 'sun' },
  { id: 'fruit', label: '果穗评估', icon: 'grape' },
  { id: 'compare', label: '方案对比', icon: 'compare' },
  { id: 'settings', label: '设置', icon: 'settings' }
]

const engineBadge = computed(() => {
  if (store.webgpuSupported === null) return '检测 WebGPU…'
  return store.webgpuSupported ? 'WebGPU 可用' : 'WebGPU 不可用 · CPU 兜底'
})
</script>

<template>
  <div v-if="!store.ready" class="empty" style="height:100vh">
    <div class="empty-icon"><Icon name="leaf" :size="26" /></div>
    <div class="empty-title">正在打开地块数据库…</div>
  </div>
  <div v-else class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark"><Icon name="grape" :size="24" /></div>
        <div>
          <div class="brand-title">葡光冠层推演</div>
          <div class="brand-sub">Vineyard Light Lab</div>
        </div>
      </div>
      <nav class="nav">
        <button
          v-for="(item, index) in nav"
          :key="item.id"
          class="nav-item"
          :class="{ active: store.page === item.id }"
          @click="setPage(item.id)"
        >
          <Icon :name="item.icon" :size="19" />
          <span>{{ item.label }}</span>
          <span class="nav-index">0{{ index + 1 }}</span>
        </button>
      </nav>
      <div class="sidebar-foot">
        <div class="flex" style="color:white; margin-bottom:6px">
          <span class="badge" :class="store.webgpuSupported ? 'success' : 'warning'">{{ engineBadge }}</span>
        </div>
        直射 / 散射分离 · WGSL Compute · IndexedDB 本地存储
      </div>
    </aside>

    <main class="main">
      <PlotPage v-if="store.page === 'plots'" />
      <TrellisPage v-else-if="store.page === 'trellis'" />
      <CanopyPage v-else-if="store.page === 'canopy'" />
      <LightPage v-else-if="store.page === 'light'" />
      <FruitPage v-else-if="store.page === 'fruit'" />
      <ComparePage v-else-if="store.page === 'compare'" />
      <SettingsPage v-else />
    </main>

    <div class="toast-wrap" aria-live="polite">
      <div v-for="message in store.toasts" :key="message.id" class="toast" :class="message.type">
        <Icon :name="message.type === 'success' ? 'check' : message.type === 'error' ? 'warning' : 'sun'" :size="18" />
        <span>{{ message.text }}</span>
      </div>
    </div>
  </div>
</template>
