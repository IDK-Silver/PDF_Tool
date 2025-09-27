<script setup lang="ts">

type Mode = 'view' | 'convert' | 'compose'

const mode = defineModel<Mode>({ required: true })

const tabs: Array<{ key: Mode, label: string }> = [
    { key: 'view', label: 'View' },
    { key: 'convert', label: 'Convert' },
    { key: 'compose', label: 'Compose' }
]

</script>


<template>
    <div class="tabs">
        <button v-for="(tab, index) in tabs" :key="index" class="tab-btn" :class="{ active: mode === tab.key }"
            type="button" @click="mode = tab.key" :aria-pressed="mode === tab.key">
            {{ tab.label }}
        </button>
    </div>
</template>


<style>
.tabs {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.tab-btn {
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    background: #fff;
    cursor: pointer;
    text-align: left;
    border: none;
    height: 32px;
}

.tab-btn:hover {
    background: var(--hover);
}

.tab-btn.active {
    background: var(--selected, #f3f4f6);
    color: inherit;
    box-shadow: inset 3px 0 0 var(--selected-bar, #d1d5db);
}

.tab-btn:focus {
    outline: 2px solid var(--ring);
    outline-offset: 2px;
}
</style>
