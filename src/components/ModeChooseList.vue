<script setup lang="ts">

import { computed } from 'vue';
import { useRoute, useRouter, isNavigationFailure } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { DocumentMagnifyingGlassIcon, ArchiveBoxIcon, RectangleStackIcon } from '@heroicons/vue/24/outline';

const { t } = useI18n();

type Mode = 'media_view' | 'compress' | 'workspace_view' | 'pdf_editor';

const modes = computed(() => [
	{ key: 'media_view' as Mode, label: t('nav.view'), icon: DocumentMagnifyingGlassIcon },
	{ key: 'workspace_view' as Mode, label: t('nav.workspace'), icon: RectangleStackIcon },
	{ key: 'compress' as Mode, label: t('nav.compress'), icon: ArchiveBoxIcon },
]);

const router = useRouter();
const route = useRoute();

const current_mode = computed<Mode>(() => (route.name as Mode) || 'media_view');

async function setMode(mode: Mode) {
  try {
    await router.push({ name: mode })
  } catch (err) {
    // 若為導航守衛中止/取消等預期情況，不做任何 fallback 以尊重守衛
    if (!isNavigationFailure(err)) {
      // 非預期錯誤時才採用保守 fallback（理論上很少發生）
      const toHash =
        mode === 'media_view'
          ? '#/media'
          : mode === 'workspace_view'
            ? '#/workspace'
            : mode === 'compress'
              ? '#/compress'
              : '#/editor'
      window.location.hash = toHash
    }
  }
}
</script>


<template>
	<nav class="w-full flex flex-col gap-1 py-3 pr-1 min-h-1 relative z-[60] pointer-events-auto">
		<button v-for="mode in modes" :key="mode.key" type="button" @click="setMode(mode.key)" class="
			w-full min-h-[8px] flex items-center gap-2 px-3 py-2 border-0 rounded-md max-h-8
			transition-colors duration-150
			hover:text-[hsl(var(--foreground))]
		" :class="current_mode === mode.key ?
			'text-[hsl(var(--foreground))] font-medium bg-[hsl(var(--selection))]' :
			'bg-transparent hover:bg-[hsl(var(--selection))]/50'">
			<component :is="mode.icon" class="w-5 h-5 flex-shrink-0" />
			<span>{{ mode.label }}</span>
		</button>
	</nav>
</template>
