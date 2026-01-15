<script setup lang="ts">
import { ref, type CSSProperties } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const props = defineProps<{
  visible: boolean
  modelValue: string
  busy: boolean
  error: string | null
  summary: string
  hasMatches: boolean
  panelStyle: CSSProperties
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
  (e: 'prev'): void
  (e: 'next'): void
  (e: 'close'): void
}>()

const inputEl = ref<HTMLInputElement | null>(null)

function focusInput() {
  const el = inputEl.value
  if (!el) return
  el.focus()
  el.select()
}

defineExpose({
  inputEl,
  focusInput,
})
</script>

<template>
  <teleport to="body">
    <div
      v-if="props.visible"
      class="fixed z-[2100] flex items-center gap-2 bg-card/95 backdrop-blur border border-border rounded-md shadow px-3 py-2 text-sm"
      role="search"
      :style="props.panelStyle"
    >
      <input
        ref="inputEl"
        :value="props.modelValue"
        type="text"
        :placeholder="t('toolbar.searchPlaceholder')"
        class="px-2 py-1 rounded border border-border focus:outline-none focus:ring-1 focus:ring-primary/60 bg-background text-foreground flex-1 min-w-0"
        style="width: 0;"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <span class="text-xs text-muted-foreground whitespace-nowrap flex-shrink-0 min-w-[48px] text-center">
        <template v-if="props.busy">{{ t('toolbar.searching') }}</template>
        <template v-else-if="props.error">{{ t('toolbar.noResults') }}</template>
        <template v-else>{{ props.summary }}</template>
      </span>
      <div class="flex items-center gap-1 flex-shrink-0">
        <button
          class="px-2 py-1 rounded border border-transparent hover:bg-hover disabled:opacity-40 flex-shrink-0"
          type="button"
          :disabled="!props.hasMatches || props.busy"
          @click="emit('prev')"
          :title="t('toolbar.searchPrevious')"
        >
          ↑
        </button>
        <button
          class="px-2 py-1 rounded border border-transparent hover:bg-hover disabled:opacity-40 flex-shrink-0"
          type="button"
          :disabled="!props.hasMatches || props.busy"
          @click="emit('next')"
          :title="t('toolbar.searchNext')"
        >
          ↓
        </button>
      </div>
      <button
        class="px-2 py-1 rounded border border-transparent hover:bg-hover text-muted-foreground flex-shrink-0"
        type="button"
        @click="emit('close')"
        :title="t('toolbar.searchClose')"
      >
        ✕
      </button>
    </div>
  </teleport>
</template>
