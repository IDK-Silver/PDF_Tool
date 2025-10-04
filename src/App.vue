<script setup lang="ts">

import ModeChooseList from './components/ModeChooseList.vue';

</script>



<template>
  <div class="flex flex-row h-screen w-screen">
    <aside class="w-2/5 flex-shrink-0 border-r border-border p-2 bg-background">
      <ModeChooseList />
    </aside>
    <main class="w-3/5 flex-shrink-0 overflow-auto bg-background">
      <RouterView />
    </main>
  </div>
</template>