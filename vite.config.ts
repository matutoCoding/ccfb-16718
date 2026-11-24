import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1600
  },
  server: {
    host: '127.0.0.1',
    port: 5173
  }
})
