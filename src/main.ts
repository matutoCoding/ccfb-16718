import { createApp } from 'vue'
import App from './app.vue'
import './style.css'
import { initStore } from './lib/store'

initStore()
  .then(() => createApp(App).mount('#app'))
  .catch((error) => {
    console.error(error)
    const root = document.querySelector('#app')
    if (root) {
      root.innerHTML = '<div style="padding:48px;font-family:sans-serif"><h1>本地数据库初始化失败</h1><p>请使用支持 IndexedDB 的现代浏览器，并允许本站点保存本地数据。</p></div>'
    }
  })
