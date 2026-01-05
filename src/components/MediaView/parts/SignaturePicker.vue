<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import SignatureDrawDialog from './SignatureDrawDialog.vue'
import {
  listSignatures,
  addSignature,
  deleteSignature,
} from '@/modules/signature/api'

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
    // Auto-select the new signature
    emit('select', {
      id: newSig.id,
      dataUrl: newSig.dataUrl,
      createdAt: newSig.createdAt,
    })
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
      <span class="picker-title">My Signatures</span>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="empty-state">
      <span class="text-muted-foreground text-xs">Loading...</span>
    </div>

    <!-- Signature list -->
    <div v-else-if="hasSignatures" class="signature-list">
      <div
        v-for="sig in signatures"
        :key="sig.id"
        class="signature-item"
        @click="handleSelectSignature(sig)"
      >
        <img :src="sig.dataUrl" alt="Signature" class="signature-preview" />
        <button
          class="delete-btn"
          @click="handleDeleteSignature(sig.id, $event)"
          title="Delete"
        >
          <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Empty state -->
    <div v-else class="empty-state">
      <span class="text-muted-foreground text-xs">No signatures yet</span>
    </div>

    <!-- Add new signature button -->
    <button class="add-signature-btn" @click="openDrawDialog">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
        <path d="M12 5v14M5 12h14" />
      </svg>
      <span>New Signature</span>
    </button>

    <!-- Click outside backdrop -->
    <div class="popover-backdrop" @click="emit('close')"></div>

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
  min-width: 200px;
  max-width: 280px;
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

.signature-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
  padding: 0.5rem;
  max-height: 180px;
  overflow-y: auto;
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
  padding: 0.25rem;
}

.delete-btn {
  position: absolute;
  top: 0.125rem;
  right: 0.125rem;
  width: 1.25rem;
  height: 1.25rem;
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

.empty-state {
  padding: 1.5rem;
  text-align: center;
}

.add-signature-btn {
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
