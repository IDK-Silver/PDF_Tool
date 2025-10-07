<script setup lang="ts">

import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { EyeIcon } from '@heroicons/vue/24/outline';
import type { Component } from 'vue';

type Mode = 'media_view' | 'pdf_editor';

const modes: { key: Mode, label: string, icon: Component }[] = [
	{ key: 'media_view', label: '檢視', icon: EyeIcon },
	// { key: 'pdf_editor', label: '編輯', icon: PencilSquareIcon }
];

const router = useRouter();
const route = useRoute();

const current_mode = computed<Mode>(() => (route.name as Mode) || 'media_view');

function setMode(mode: Mode) {
	router.push({ name: mode })
}
</script>


<template>
	<nav class="w-full flex flex-col gap-1 py-3 pr-2 min-h-1">
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
