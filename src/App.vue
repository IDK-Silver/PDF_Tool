<script setup lang="ts">

import ModeChooseList from './components/ModeChooseList.vue';
import SettingBar from './components/SettingBar.vue';

</script>



<template>
  <div class="flex flex-row h-screen w-screen">
    <aside
      class="w-[240px] flex-shrink-0 bg-background flex flex-col border-r border-[hsl(var(--border))] pl-1 pr-4 relative z-50">
      <SettingBar />
      <ModeChooseList />
      <section class="w-full border-t border-[hsl(var(--border))] pt-[6px] py-2"></section>
      <RouterView name="filelist" />
    </aside>
    <main class="flex-1 min-h-0 overflow-hidden bg-background flex flex-col relative z-0 mr-8">
      <div class="flex-1 min-h-0">
        <RouterView />
      </div>
    </main>
  </div>
</template>
