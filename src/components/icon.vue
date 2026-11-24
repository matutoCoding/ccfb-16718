<script setup lang="ts">
const props = defineProps<{ name: string; size?: number }>()
const size = props.size ?? 18
const paths: Record<string, string> = {
  plot: 'M3 20l6-16 4 9 3-5 5 12H3z',
  trellis: 'M4 21V8m16 13V5M4 12h16M4 17h16M8 8l4-4 4 4',
  leaf: 'M5 19c0-9 6-14 15-14 0 10-5 16-14 15m-1 0c3-5 6-8 11-10',
  sun: 'M12 17a5 5 0 100-10 5 5 0 000 10zm0-15v2m0 16v2M4.2 4.2l1.4 1.4m12.8 12.8l1.4 1.4M1 12h2m18 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  grape: 'M12 8c3 0 5-2 5-5-3 0-5 2-5 5zm0 0C9 8 7 6 7 3c3 0 5 2 5 5zm0 0v4m-4 1a2 2 0 100 4 2 2 0 000-4zm8 0a2 2 0 100 4 2 2 0 000-4zm-4 3a2 2 0 100 4 2 2 0 000-4zm-4 3a2 2 0 100 4 2 2 0 000-4zm4 0a2 2 0 100 4 2 2 0 000-4z',
  compare: 'M9 4v16M15 4v16M3 8h6m-6 8h6m6-8h6m-6 8h6',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zm8-3a8 8 0 00-.1-1.3l2-1.6-2-3.4-2.4 1a8 8 0 00-2.2-1.3L15 2H9l-.3 2.4a8 8 0 00-2.2 1.3l-2.4-1-2 3.4 2 1.6a8 8 0 000 2.6l-2 1.6 2 3.4 2.4-1a8 8 0 002.2 1.3L9 22h6l.3-2.4a8 8 0 002.2-1.3l2.4 1 2-3.4-2-1.6c.07-.43.1-.86.1-1.3z',
  plus: 'M12 5v14M5 12h14',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  trash: 'M4 7h16M9 7V4h6v3m-8 0l1 13h8l1-13',
  download: 'M12 3v12m0 0l-5-5m5 5l5-5M4 21h16',
  camera: 'M4 8h3l2-3h6l2 3h3v12H4V8zm8 9a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  play: 'M7 5l12 7-12 7V5z',
  check: 'M5 13l4 4L19 7',
  warning: 'M12 3l10 18H2L12 3zm0 7v4m0 4h.01',
  database: 'M12 7c5 0 9-1.8 9-4s-4-3-9-3-9 .8-9 3 4 4 9 4zm9-4v6c0 2.2-4 4-9 4s-9-1.8-9-4V3m18 6v6c0 2.2-4 4-9 4s-9-1.8-9-4V9',
  refresh: 'M20 11a8 8 0 10-2.3 6.3M20 5v6h-6'
}
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] ?? paths.leaf" />
  </svg>
</template>
