<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import SignatureDrawDialog from './SignatureDrawDialog.vue'
import {
  listSignatures,
  addSignature,
  deleteSignature,
} from '@/modules/signature/api'

const { t } = useI18n()

export interface SignatureItem {
  id: string
  dataUrl: string
  createdAt: number
}

const emit = defineEmits<{
  (e: 'select', signature: SignatureItem): void
  (e: 'close'): void
}>()

const signatures = ref<SignatureItem[]>([])
const showDrawDialog = ref(false)
const isLoading = ref(true)

// Pagination state
const currentPage = ref(0)
const pageSize = 4 // 2x2 grid

const totalPages = computed(() => Math.ceil(signatures.value.length / pageSize))
const pagedSignatures = computed(() => {
  const start = currentPage.value * pageSize
  return signatures.value.slice(start, start + pageSize)
})

const canGoPrev = computed(() => currentPage.value > 0)
const canGoNext = computed(() => currentPage.value < totalPages.value - 1)

function prevPage() {
  if (canGoPrev.value) currentPage.value--
}

function nextPage() {
  if (canGoNext.value) currentPage.value++
}

// Reset to first page when signatures change (e.g., after delete)
watch(() => signatures.value.length, () => {
  if (currentPage.value >= totalPages.value && totalPages.value > 0) {
    currentPage.value = totalPages.value - 1
  }
})

onMounted(async () => {
  try {
    const list = await listSignatures()
    signatures.value = list.map((sig) => ({
      id: sig.id,
      dataUrl: sig.dataUrl,
      createdAt: sig.createdAt,
    }))
  } catch (err) {
    console.error('Failed to load signatures:', err)
  } finally {
    isLoading.value = false
  }
})

function handleSelectSignature(sig: SignatureItem) {
  emit('select', sig)
}

async function handleDeleteSignature(id: string, event: Event) {
  event.stopPropagation()
  try {
    await deleteSignature(id)
    signatures.value = signatures.value.filter((s) => s.id !== id)
  } catch (err) {
    console.error('Failed to delete signature:', err)
  }
}

function openDrawDialog() {
  showDrawDialog.value = true
}

async function handleSaveSignature(dataUrl: string) {
  try {
    const newSig = await addSignature(dataUrl)
    signatures.value.unshift({
      id: newSig.id,
      dataUrl: newSig.dataUrl,
      createdAt: newSig.createdAt,
    })
    showDrawDialog.value = false
    // Go to first page to show the new signature
    currentPage.value = 0
  } catch (err) {
    console.error('Failed to save signature:', err)
  }
}

function handleCloseDrawDialog() {
  showDrawDialog.value = false
}

const hasSignatures = computed(() => signatures.value.length > 0)
</script>

<template>
  <div class="signature-picker">
    <div class="picker-header">
      <span class="picker-title">{{ t('annotation.signature.mySignatures') }}</span>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="empty-state">
      <span class="text-muted-foreground text-xs">{{ t('annotation.signature.loading') }}</span>
    </div>

    <!-- Signature list with pagination -->
    <div v-else-if="hasSignatures" class="signature-container">
      <!-- Left arrow -->
      <button
        class="page-arrow page-arrow-left"
        :class="{ disabled: !canGoPrev }"
        :disabled="!canGoPrev"
        @click.stop="prevPage"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M15 19l-7-7 7-7" />
        </svg>
      </button>

      <!-- Signature grid -->
      <div class="signature-list">
        <div
          v-for="sig in pagedSignatures"
          :key="sig.id"
          class="signature-item"
          @click="handleSelectSignature(sig)"
        >
          <img :src="sig.dataUrl" alt="Signature" class="signature-preview" />
          <button
            class="delete-btn"
            @click="handleDeleteSignature(sig.id, $event)"
            :title="t('annotation.signature.delete')"
          >
            <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Right arrow -->
      <button
        class="page-arrow page-arrow-right"
        :class="{ disabled: !canGoNext }"
        :disabled="!canGoNext"
        @click.stop="nextPage"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
    </div>

    <!-- Page indicator -->
    <div v-if="hasSignatures && totalPages > 1" class="page-indicator">
      <!-- 7 頁以下用圓點 -->
      <template v-if="totalPages <= 7">
        <span
          v-for="page in totalPages"
          :key="page"
          class="page-dot"
          :class="{ active: page - 1 === currentPage }"
          @click.stop="currentPage = page - 1"
        ></span>
      </template>
      <!-- 超過 7 頁用數字 -->
      <span v-else class="page-number">{{ currentPage + 1 }} / {{ totalPages }}</span>
    </div>

    <!-- Empty state -->
    <div v-if="!isLoading && !hasSignatures" class="empty-state">
      <span class="text-muted-foreground text-xs">{{ t('annotation.signature.noSignatures') }}</span>
    </div>

    <!-- Add new signature button -->
    <button class="add-signature-btn" @click.stop="openDrawDialog">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span>{{ t('annotation.signature.newSignature') }}</span>
    </button>

    <!-- Click outside backdrop -->
    <div class="popover-backdrop" @click.stop="emit('close')"></div>

    <!-- Draw dialog -->
    <SignatureDrawDialog
      v-if="showDrawDialog"
      @save="handleSaveSignature"
      @close="handleCloseDrawDialog"
    />
  </div>
</template>

<style scoped>
.signature-picker {
  position: absolute;
  top: calc(100% + 0.375rem);
  right: 0;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 0.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 100;
  width: 240px;
  overflow: visible;
}

.picker-header {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid hsl(var(--border));
}

.picker-title {
  font-size: 0.75rem;
  font-weight: 500;
  color: hsl(var(--foreground));
}

.signature-container {
  display: flex;
  align-items: center;
  padding: 0.5rem 0.25rem;
  gap: 0.25rem;
}

.page-arrow {
  flex-shrink: 0;
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.25rem;
  color: hsl(var(--foreground) / 0.6);
  transition: background-color 0.15s, color 0.15s;
}

.page-arrow:hover:not(.disabled) {
  background: hsl(var(--muted));
  color: hsl(var(--foreground));
}

.page-arrow.disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.signature-list {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 0.375rem;
  height: 88px;
}

.signature-item {
  position: relative;
  aspect-ratio: 2 / 1;
  border: 1px solid hsl(var(--border));
  border-radius: 0.375rem;
  cursor: pointer;
  overflow: hidden;
  background: white;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.signature-item:hover {
  border-color: hsl(var(--primary));
  box-shadow: 0 0 0 1px hsl(var(--primary) / 0.3);
}

.signature-preview {
  width: 100%;
  height: 100%;
  object-fit: contain;
  padding: 0.125rem;
}

.delete-btn {
  position: absolute;
  top: 0.125rem;
  right: 0.125rem;
  width: 1rem;
  height: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: hsl(var(--destructive));
  color: hsl(var(--destructive-foreground));
  border-radius: 50%;
  opacity: 0;
  transition: opacity 0.15s;
}

.signature-item:hover .delete-btn {
  opacity: 1;
}

.delete-btn:hover {
  background: hsl(var(--destructive) / 0.9);
}

.page-indicator {
  display: flex;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.25rem 0 0.5rem;
}

.page-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: hsl(var(--muted-foreground) / 0.3);
  cursor: pointer;
  transition: background-color 0.15s, transform 0.15s;
}

.page-dot:hover {
  background: hsl(var(--muted-foreground));
}

.page-dot.active {
  background: hsl(var(--foreground));
  transform: scale(1.2);
}

.page-number {
  font-size: 0.6875rem;
  color: hsl(var(--muted-foreground));
  font-variant-numeric: tabular-nums;
}

.empty-state {
  padding: 1.5rem;
  text-align: center;
}

.add-signature-btn {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  width: 100%;
  padding: 0.5rem;
  border-top: 1px solid hsl(var(--border));
  font-size: 0.8125rem;
  color: hsl(var(--primary));
  transition: background-color 0.15s;
  cursor: pointer;
}

.add-signature-btn:hover {
  background: hsl(var(--muted));
}

.popover-backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
}
</style>
