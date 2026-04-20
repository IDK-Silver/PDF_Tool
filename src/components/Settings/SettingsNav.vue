<script setup lang="ts">
import { useRouter } from 'vue-router'
import { computed, ref } from 'vue'
import { isAppStoreBuild } from '@/modules/updater/service'
import { SETTINGS_SECTIONS } from '@/modules/settings/sections'

const router = useRouter()

// App Store build detection (hide update nav for App Store)
const isAppStore = ref(true)
isAppStoreBuild().then(v => { isAppStore.value = v }).catch(() => { isAppStore.value = true })

const sections = computed(() =>
  SETTINGS_SECTIONS.filter(section => !section.hiddenOnAppStore || !isAppStore.value),
)

function scrollToId(hash: string) {
  const target = hash.startsWith('#') ? hash : `#${hash}`
  const el = document.querySelector(target) as HTMLElement | null
  const root = document.querySelector('[data-settings-scroll-root]') as HTMLElement | null
  if (!el || !root) return
  const header = root.querySelector('header.sticky') as HTMLElement | null
  const offset = (header?.offsetHeight ?? 0) + 8
  const rRect = root.getBoundingClientRect()
  const eRect = el.getBoundingClientRect()
  const top = root.scrollTop + (eRect.top - rRect.top) - offset
  root.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

function go(hash: string) {
  const target = hash.startsWith('#') ? hash : `#${hash}`
  router.push({ name: 'settings', hash: target })
  // 等路由狀態更新後執行滾動（下一輪宏任務即可）
  setTimeout(() => scrollToId(target), 0)
}
</script>

<template>
  <nav class="p-3 text-sm space-y-2">
    <div class="text-xs text-[hsl(var(--muted-foreground))] mb-2">{{ $t('settings.nav.title') }}</div>
    <a
      v-for="section in sections"
      :key="section.key"
      class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]"
      :href="`#${section.id}`"
      @click.prevent="go(section.id)"
    >
      {{ $t(section.navLabelKey) }}
    </a>
  </nav>
</template>
