import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useUiStore = defineStore('ui', () => {
  const sidebarCollapsed = ref(false)

  function setSidebarCollapsed(v: boolean) {
    sidebarCollapsed.value = !!v
  }

  function toggleSidebar() {
    sidebarCollapsed.value = !sidebarCollapsed.value
  }

  return {
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebar,
  }
})

