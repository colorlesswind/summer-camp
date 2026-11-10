<script setup lang="ts">
import { loginCopy as copy } from '../messages';

defineProps<{ loading?: boolean }>();
</script>

<template>
  <div class="login-actions">
    <a-button disabled>{{ copy.previous }}</a-button>
    <a-button type="primary" html-type="submit" :loading="loading">{{ copy.next }}</a-button>
  </div>
</template>

<style scoped>
.login-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-top: 8px;
}
</style>
