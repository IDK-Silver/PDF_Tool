<script setup lang="ts">
import { useRouter } from 'vue-router'
const router = useRouter()

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
    <div class="text-xs text-[hsl(var(--muted-foreground))] mb-2">設定導覽</div>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#high-res-rendering" @click.prevent="go('#high-res-rendering')">高清渲染</a>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#performance" @click.prevent="go('#performance')">效能控制</a>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#fileops" @click.prevent="go('#fileops')">檔案操作</a>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#encoding" @click.prevent="go('#encoding')">編碼品質</a>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#insert-defaults" @click.prevent="go('#insert-defaults')">插入預設</a>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#export" @click.prevent="go('#export')">匯出設定</a>
    <a class="block px-2 py-1 rounded hover:bg-[hsl(var(--accent))]" href="#debug" @click.prevent="go('#debug')">除錯與輔助</a>
  </nav>
</template>
