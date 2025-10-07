import './assets/tailwind.css'
import { createApp } from "vue";
import { createPinia } from 'pinia'
import App from "./App.vue"
import router from "./router";

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')

// Desktop-app feel: disable context menu and unwanted selections globally,
// while preserving text selection inside form fields or elements marked .selectable
function allowTextSelection(el: Element | null): boolean {
  let node: Element | null = el
  let depth = 0
  while (node && depth < 6) {
    const he = node as HTMLElement
    const tag = he.tagName
    if (he.isContentEditable) return true
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
    if (he.classList && he.classList.contains('selectable')) return true
    node = he.parentElement
    depth++
  }
  return false
}

window.addEventListener('contextmenu', (e) => {
  e.preventDefault()
})

document.addEventListener('dragstart', (e) => {
  if (!allowTextSelection(e.target as Element)) e.preventDefault()
})

document.addEventListener('selectstart', (e) => {
  if (!allowTextSelection(e.target as Element)) e.preventDefault()
})

document.addEventListener('selectionchange', () => {
  const sel = window.getSelection()
  if (!sel) return
  if (sel.rangeCount === 0) return
  const anchorNode = sel.anchorNode as (Node & { parentElement?: HTMLElement }) | null
  const anchorEl = anchorNode?.parentElement || null
  if (!allowTextSelection(anchorEl)) {
    try { sel.removeAllRanges() } catch {}
  }
})
