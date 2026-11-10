<script setup lang="ts">
import BrandHeader from '@/components/BrandHeader.vue';
</script>

<template>
  <div class="auth-layout">
    <BrandHeader />
    <main class="auth-layout__main">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.auth-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

.auth-layout__main {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  padding: 32px 24px clamp(40px, 18vh, 160px);
}

@media (max-width: 640px) {
  .auth-layout__main {
    align-items: flex-start;
    padding: 24px 16px 40px;
  }
}
</style>
