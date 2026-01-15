<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { marked } from 'marked'
import { useUpdaterStore } from '@/modules/updater/store'
import { XMarkIcon } from '@heroicons/vue/24/outline'

const { t } = useI18n()

marked.setOptions({
  breaks: true,
  gfm: true,
})

const updater = useUpdaterStore()
const visible = computed(() => updater.state.dialogVisible)
const result = computed(() => updater.state.result)

const hasUpdate = computed(() => result.value?.hasUpdate ?? false)
const currentVersion = computed(() => result.value?.currentVersion ?? '')
const latestVersion = computed(() => result.value?.latestVersion ?? '')
const changelog = computed(() => result.value?.releaseInfo?.body ?? '')
const changelogHtml = computed(() => {
  if (!changelog.value) return ''
  return marked.parse(changelog.value) as string
})

function onBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget && !updater.isDownloading) {
    updater.closeDialog()
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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
              <template v-if="updater.isDownloading">{{ t('update.downloading') }}</template>
              <template v-else-if="updater.isReadyToRestart">{{ t('update.ready') }}</template>
              <template v-else-if="hasUpdate">{{ t('update.newVersion') }}</template>
              <template v-else>{{ t('update.checkUpdate') }}</template>
            </h2>
            <button
              v-if="!updater.isDownloading"
              @click="updater.closeDialog"
              class="w-7 h-7 flex items-center justify-center rounded hover:bg-[hsl(var(--selection))] transition"
              :aria-label="t('update.close')"
            >
              <XMarkIcon class="w-5 h-5" />
            </button>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <!-- Loading state -->
            <div v-if="updater.isChecking" class="flex items-center justify-center py-8">
              <div class="animate-spin w-6 h-6 border-2 border-[hsl(var(--primary))] border-t-transparent rounded-full"></div>
              <span class="ml-3 text-sm text-[hsl(var(--muted-foreground))]">{{ t('update.checking') }}</span>
            </div>

            <!-- Downloading state -->
            <div v-else-if="updater.isDownloading" class="py-4 space-y-4">
              <div class="text-center text-sm text-[hsl(var(--muted-foreground))]">
                {{ t('update.downloadingVersion', { version: latestVersion }) }}
              </div>

              <!-- Progress bar -->
              <div class="space-y-2">
                <div class="h-2 bg-[hsl(var(--muted))] rounded-full overflow-hidden">
                  <!-- Single element: avoids DOM recreation that breaks transitions -->
                  <div
                    class="h-full bg-[hsl(var(--primary))]"
                    :class="{
                      'animate-indeterminate': updater.downloadPercent === null,
                      'transition-all duration-300 ease-out': updater.downloadPercent !== null
                    }"
                    :style="{ width: updater.downloadPercent !== null ? `${updater.downloadPercent}%` : '33.33%' }"
                  ></div>
                </div>
                <div class="flex justify-between text-xs text-[hsl(var(--muted-foreground))]">
                  <span v-if="updater.state.downloadProgress?.downloaded">
                    {{ formatBytes(updater.state.downloadProgress.downloaded) }}
                  </span>
                  <span v-if="updater.downloadPercent !== null">{{ updater.downloadPercent }}%</span>
                  <span v-else class="text-[hsl(var(--muted-foreground))]">—</span>
                  <span v-if="updater.state.downloadProgress?.total">
                    {{ formatBytes(updater.state.downloadProgress.total) }}
                  </span>
                </div>
              </div>

              <p class="text-xs text-center text-[hsl(var(--muted-foreground))]">
                {{ t('update.doNotClose') }}
              </p>
            </div>

            <!-- Ready to restart -->
            <div v-else-if="updater.isReadyToRestart" class="text-center py-6">
              <div class="text-4xl mb-3">&#10003;</div>
              <p class="font-medium">{{ t('update.downloadComplete') }}</p>
              <p class="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                {{ t('update.restartToComplete') }}
              </p>
            </div>

            <!-- No update available -->
            <div v-else-if="!hasUpdate" class="text-center py-6">
              <div class="text-4xl mb-3">&#10003;</div>
              <p class="font-medium">{{ t('update.upToDate') }}</p>
              <p class="text-sm text-[hsl(var(--muted-foreground))] mt-1">
                {{ t('update.version', { version: currentVersion }) }}
              </p>
            </div>

            <!-- Update available -->
            <template v-else>
              <div class="space-y-2">
                <div class="flex items-baseline gap-2">
                  <span class="text-sm text-[hsl(var(--muted-foreground))]">{{ t('update.latestVersion') }}</span>
                  <span class="font-medium text-[hsl(var(--primary))]">v{{ latestVersion }}</span>
                </div>
                <div class="flex items-baseline gap-2">
                  <span class="text-sm text-[hsl(var(--muted-foreground))]">{{ t('update.currentVersion') }}</span>
                  <span>v{{ currentVersion }}</span>
                </div>
              </div>

              <!-- Changelog -->
              <div v-if="changelog" class="space-y-2">
                <h3 class="text-sm font-medium">{{ t('update.changelog') }}</h3>
                <div
                  class="changelog-content rounded-md border border-border bg-[hsl(var(--card))] p-3 max-h-48 overflow-y-auto text-sm"
                  v-html="changelogHtml"
                ></div>
              </div>
            </template>
          </div>

          <!-- Actions -->
          <div class="px-5 py-4 border-t border-border flex flex-wrap gap-2 justify-end">
            <!-- Update available actions -->
            <template v-if="hasUpdate && !updater.isChecking && !updater.isDownloading && !updater.isReadyToRestart">
              <button
                @click="updater.closeDialog"
                class="px-3 py-1.5 text-sm rounded border border-border bg-card hover:bg-[hsl(var(--selection))] transition-colors"
              >
                {{ t('update.later') }}
              </button>
              <button
                @click="updater.downloadNow"
                class="px-3 py-1.5 text-sm rounded bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90 transition-opacity"
              >
                {{ t('update.updateNow') }}
              </button>
            </template>

            <!-- Ready to restart action -->
            <template v-else-if="updater.isReadyToRestart">
              <button
                @click="updater.closeDialog"
                class="px-3 py-1.5 text-sm rounded border border-border bg-card hover:bg-[hsl(var(--selection))] transition-colors"
              >
                {{ t('update.restartLater') }}
              </button>
            </template>

            <!-- No update / checking done -->
            <template v-else-if="!updater.isChecking && !updater.isDownloading">
              <button
                @click="updater.closeDialog"
                class="px-3 py-1.5 text-sm rounded border border-border bg-card hover:bg-[hsl(var(--selection))] transition-colors"
              >
                {{ t('update.close') }}
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

/* Indeterminate progress bar animation */
@keyframes indeterminate {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(300%);
  }
}

.animate-indeterminate {
  animation: indeterminate 1.5s ease-in-out infinite;
}

.changelog-content :deep(h1),
.changelog-content :deep(h2),
.changelog-content :deep(h3) {
  font-weight: 600;
  margin-top: 0.75rem;
  margin-bottom: 0.5rem;
}

.changelog-content :deep(h1) {
  font-size: 1.125rem;
}

.changelog-content :deep(h2) {
  font-size: 1rem;
}

.changelog-content :deep(h3) {
  font-size: 0.875rem;
}

.changelog-content :deep(p) {
  margin-bottom: 0.5rem;
  color: hsl(var(--muted-foreground));
}

.changelog-content :deep(ul),
.changelog-content :deep(ol) {
  margin-left: 1.25rem;
  margin-bottom: 0.5rem;
  color: hsl(var(--muted-foreground));
}

.changelog-content :deep(ul) {
  list-style-type: disc;
}

.changelog-content :deep(ol) {
  list-style-type: decimal;
}

.changelog-content :deep(li) {
  margin-bottom: 0.25rem;
}

.changelog-content :deep(code) {
  background: hsl(var(--muted));
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  font-size: 0.8em;
}

.changelog-content :deep(a) {
  color: hsl(var(--primary));
  text-decoration: underline;
}

.changelog-content :deep(a:hover) {
  opacity: 0.8;
}

.changelog-content :deep(> :first-child) {
  margin-top: 0;
}

.changelog-content :deep(> :last-child) {
  margin-bottom: 0;
}
</style>
