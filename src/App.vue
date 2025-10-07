<script setup lang="ts">

import ModeChooseList from './components/ModeChooseList.vue';
import SettingBar from './components/SettingBar.vue';

</script>



<template>
  <div class="flex flex-row h-screen w-screen">
    <aside class="w-3/12 flex-shrink-0 bg-background flex flex-col">
      <SettingBar />
      <ModeChooseList />
      <RouterView name="filelist" />
    </aside>
    <main class="w-9/12 shrink h-full min-h-0 overflow-hidden bg-background flex flex-col">
      <div class="flex-1 min-h-0">
        <RouterView />
      </div>
    </main>
  </div>
</template>
