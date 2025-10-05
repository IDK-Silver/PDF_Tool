<script setup lang="ts">

import ModeChooseList from './components/ModeChooseList.vue';
import SettingBar from './components/SettingBar.vue';

</script>



<template>
  <div class="flex flex-row h-screen w-screen">
    <aside class="w-3/10 flex-shrink-0 bg-background flex flex-col">
      <SettingBar />
      <ModeChooseList />
    </aside>
    <main class="w-7/10 flex-shrink-1 overflow-auto bg-background">
      <RouterView />
    </main>
  </div>
</template>
