<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const backTarget = computed(() => (auth.isAuthenticated ? auth.homePath : '/login'));
const backLabel = computed(() => (auth.isAuthenticated ? 'Back to home' : 'Back to login'));

function goBack(): void {
  void router.replace(backTarget.value);
}
</script>

<template>
  <a-result status="404" title="404" sub-title="Sorry, the page you visited does not exist.">
    <template #extra>
      <a-button type="primary" @click="goBack">{{ backLabel }}</a-button>
    </template>
  </a-result>
</template>
