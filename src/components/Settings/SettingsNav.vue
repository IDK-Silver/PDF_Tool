<script setup lang="ts">
import { useRouter } from 'vue-router'
import { ref } from 'vue'
import { isAppStoreBuild } from '@/modules/updater/service'

const router = useRouter()

// App Store build detection (hide update nav for App Store)
const isAppStore = ref(true)
isAppStoreBuild().then(v => { isAppStore.value = v }).catch(() => { isAppStore.value = true })

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
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#language" @click.prevent="go('#language')">{{ $t('settings.nav.language') }}</a>
    <a v-if="!isAppStore" class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#update" @click.prevent="go('#update')">{{ $t('settings.nav.update') }}</a>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#appearance" @click.prevent="go('#appearance')">{{ $t('settings.nav.appearance') }}</a>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#high-res-rendering" @click.prevent="go('#high-res-rendering')">{{ $t('settings.nav.highResRendering') }}</a>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#performance" @click.prevent="go('#performance')">{{ $t('settings.nav.performance') }}</a>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#zoom-interaction" @click.prevent="go('#zoom-interaction')">{{ $t('settings.nav.zoomInteraction') }}</a>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#fileops" @click.prevent="go('#fileops')">{{ $t('settings.nav.fileOps') }}</a>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#compression-save" @click.prevent="go('#compression-save')">{{ $t('settings.nav.compressionSave') }}</a>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#insert-defaults" @click.prevent="go('#insert-defaults')">{{ $t('settings.nav.insertDefaults') }}</a>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#text-layer" @click.prevent="go('#text-layer')">{{ $t('settings.nav.textLayer') }}</a>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#export" @click.prevent="go('#export')">{{ $t('settings.nav.export') }}</a>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#encoding" @click.prevent="go('#encoding')">{{ $t('settings.nav.encoding') }}</a>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#debug" @click.prevent="go('#debug')">{{ $t('settings.nav.debug') }}</a>
  </nav>
</template>
