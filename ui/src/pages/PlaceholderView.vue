<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();

const title = computed(() => (typeof route.meta.title === 'string' ? route.meta.title : 'Page'));
</script>

<template>
  <a-result
    status="info"
    :title="title"
    sub-title="This page will be implemented in the next iteration."
  />
</template>
