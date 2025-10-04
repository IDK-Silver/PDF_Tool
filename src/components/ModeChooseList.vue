<script setup lang="ts">

import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';


type Mode = 'media_view' | 'pdf_editor';

const modes:  {key: Mode, label: string}[] = [
    {key: 'media_view', label: '檢視'},
    {key: 'pdf_editor', label: '編輯'}
];

const router = useRouter();
const route = useRoute();

const current_mode = computed<Mode>(() => route.query.mode as Mode);

function setMode(mode: Mode) {
    router.push({
        name: (route.name as string),
        query: {...route.query, mode},
    })
}
</script>


<template>
    <nav class="flex flex-col gap-1 p-2">
        <button
            v-for="mode in modes"
            :key="mode.key"
            type="button"
            @click="setMode(mode.key)"
            class="
                w-full text-left px-3 py-2 rounded-md border transition
                border-transparent hover:bg-muted hover:text-foreground
            "
            :class="current_mode === mode.key ? 'bg-accent text-on-accent' : 'text-muted-foreground' "
        >
            {{ mode.key }}
        </button>

    </nav>
</template>
