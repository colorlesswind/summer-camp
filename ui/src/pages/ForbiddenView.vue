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
  <a-result status="403" title="403" sub-title="Sorry, you are not authorized to access this page.">
    <template #extra>
      <a-button type="primary" @click="goBack">{{ backLabel }}</a-button>
    </template>
  </a-result>
</template>
