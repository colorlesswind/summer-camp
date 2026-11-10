<script setup lang="ts">
import type { FormSectionConfig } from '@/types/application';

defineProps<{
  sections: FormSectionConfig[];
  activeCode: string;
}>();

const emit = defineEmits<{
  (event: 'select', code: string): void;
}>();
</script>

<template>
  <nav class="section-nav" aria-label="Application form sections">
    <button
      v-for="section in sections"
      :key="section.code"
      type="button"
      class="section-nav__item"
      :class="{ 'is-active': section.code === activeCode }"
      :title="section.titleEn"
      :aria-current="section.code === activeCode ? 'true' : undefined"
      @click="emit('select', section.code)"
    >
      {{ section.titleEn }}
    </button>
  </nav>
</template>
