import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import ViewMode from './views/ViewMode.vue'
import ConvertMode from './views/ConvertMode.vue'
import ComposeMode from './views/ComposeMode.vue'
import SettingsView from './views/SettingsView.vue'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/view' },
  { path: '/view', name: 'view', component: ViewMode },
  { path: '/convert', name: 'convert', component: ConvertMode },
  { path: '/compose', name: 'compose', component: ComposeMode },
  { path: '/settings', name: 'settings', component: SettingsView },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
