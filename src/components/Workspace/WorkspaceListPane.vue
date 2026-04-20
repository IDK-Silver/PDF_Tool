<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { FileList } from '@/components/FileList'
import type { FileItem } from '@/components/FileList/types'
import { useWorkspaceStore } from '@/modules/workspace/store'

const { t } = useI18n()
const workspace = useWorkspaceStore()

const items = computed<FileItem[]>(() =>
  workspace.items.map(item => ({
    id: item.id,
    name: item.name,
    path: item.id,
    type: 'workspace',
  }))
)

const selectedId = computed({
  get: () => workspace.currentId,
  set: (id: string | null) => {
    if (!id) return
    void workspace.selectWorkspace(id)
  },
})

function onItemClick(item: FileItem) {
  void workspace.selectWorkspace(item.id)
}

function onRemove(item: FileItem) {
  void workspace.removeWorkspace(item.id)
}

function onReorder(nextItems: FileItem[]) {
  workspace.reorderWorkspaces(nextItems)
}

function onAddWorkspace() {
  void workspace.addWorkspace()
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex-shrink-0">
      <div class="flex items-center gap-2 pb-2">
        <div class="text-xs font-medium text-[hsl(var(--muted-foreground))]">
          {{ t('workspace.title') }}
        </div>
        <button class="ml-auto h-8 px-3 border rounded text-sm flex-shrink-0" @click="onAddWorkspace">
          ＋
        </button>
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <FileList
        :items="items"
        :selected-id="selectedId"
        :removable="true"
        :draggable="true"
        @item-click="onItemClick"
        @remove="onRemove"
        @reorder="onReorder"
      />
    </div>
  </div>
</template>
