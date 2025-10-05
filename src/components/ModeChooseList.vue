<script setup lang="ts">

import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';


type Mode = 'media_view' | 'pdf_editor';

const modes: { key: Mode, label: string }[] = [
	{ key: 'media_view', label: '檢視' },
	{ key: 'pdf_editor', label: '編輯' }
];

const router = useRouter();
const route = useRoute();

const current_mode = computed<Mode>(() => route.query.mode as Mode);

function setMode(mode: Mode) {
	router.push({
		name: (route.name as string),
		query: { ...route.query, mode },
	})
}
</script>


<template>
	<nav class="w-full flex flex-col gap-[2px] ">
		<button v-for="mode in modes" :key="mode.key" type="button" @click="setMode(mode.key)" class="
			                w-full min-h-[32px] flex items-center p-0 border-0 rounded-none text-9xl 
		                hover:text-[hsl(var(--foreground))]
				" :class="current_mode === mode.key ?
				 'text-[hsl(var(--foreground))] font-medium !bg-[hsl(var(--selection))]' :
				 '!bg-[hsl(var(--background))]'">
			{{ mode.label }}
		</button>

	</nav>
</template>
