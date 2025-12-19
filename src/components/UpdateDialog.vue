<script setup lang="ts">
import { computed } from 'vue'
import { useUpdaterStore } from '@/modules/updater/store'
import { XMarkIcon } from '@heroicons/vue/24/outline'

const updater = useUpdaterStore()
const visible = computed(() => updater.state.dialogVisible)
const result = computed(() => updater.state.result)
const checking = computed(() => updater.state.checking)

const hasUpdate = computed(() => result.value?.hasUpdate ?? false)
const currentVersion = computed(() => result.value?.currentVersion ?? '')
const latestVersion = computed(() => result.value?.latestVersion ?? '')
const changelog = computed(() => result.value?.releaseInfo?.body ?? '')

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    updater.closeDialog()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="visible"
        class="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
        @click="onBackdropClick"
      >
        <div
          class="bg-background border border-border rounded-lg shadow-xl w-full max-w-lg max-h-[80vh] flex flex-col"
          @click.stop
        >
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 class="text-base font-medium">
              {{ hasUpdate ? '發現新版本' : '檢查更新' }}
            </h2>
            <button
              @click="updater.closeDialog"
              class="w-7 h-7 flex items-center justify-center rounded hover:bg-[hsl(var(--selection))] transition"
              aria-label="關閉"
            >
              <XMarkIcon class="w-5 h-5" />
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <!-- Loading state -->
            <div v-if="checking" class="flex items-center justify-center py-8">
              <div class="animate-spin w-6 h-6 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full"></div>
              <span class="ml-3 text-sm text-[hsl(var(--muted-foreground))]">正在檢查更新...</span>
            </div>

            <!-- No update available -->
            <div v-else-if="!hasUpdate" class="text-center py-6">
              <div class="text-4xl mb-3">&#10003;</div>
              <p class="font-medium">目前已是最新版本</p>
              <p class="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                版本 {{ currentVersion }}
              </p>
            </div>

            <!-- Update available -->
            <template v-else>
              <div class="space-y-2">
                <div class="flex items-baseline gap-2">
                  <span class="text-sm text-[hsl(var(--muted-foreground))]">最新版本：</span>
                  <span class="font-medium text-[hsl(var(--primary))]">v{{ latestVersion }}</span>
                </div>
                <div class="flex items-baseline gap-2">
                  <span class="text-sm text-[hsl(var(--muted-foreground))]">目前版本：</span>
                  <span>v{{ currentVersion }}</span>
                </div>
              </div>

              <!-- Changelog -->
              <div v-if="changelog" class="space-y-2">
                <h3 class="text-sm font-medium">更新內容</h3>
                <div class="rounded-md border border-border bg-[hsl(var(--card))] p-3 max-h-48 overflow-y-auto">
                  <pre class="text-xs whitespace-pre-wrap font-sans text-[hsl(var(--muted-foreground))]">{{ changelog }}</pre>
                </div>
              </div>
            </template>
          </div>

          <!-- Actions -->
          <div class="px-5 py-4 border-t border-border flex flex-wrap gap-2 justify-end">
            <template v-if="hasUpdate && !checking">
              <button
                @click="updater.skip"
                class="px-3 py-1.5 text-sm rounded border border-border bg-card hover:bg-[hsl(var(--selection))] transition-colors"
              >
                跳過此版本
              </button>
              <button
                @click="updater.later(24)"
                class="px-3 py-1.5 text-sm rounded border border-border bg-card hover:bg-[hsl(var(--selection))] transition-colors"
              >
                稍後提醒
              </button>
              <button
                @click="updater.downloadNow"
                class="px-3 py-1.5 text-sm rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
              >
                前往下載
              </button>
            </template>
            <template v-else-if="!checking">
              <button
                @click="updater.closeDialog"
                class="px-3 py-1.5 text-sm rounded border border-border bg-card hover:bg-[hsl(var(--selection))] transition-colors"
              >
                關閉
              </button>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
