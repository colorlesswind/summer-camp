<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string;
    description?: string;
  }>(),
  { title: '', description: '' },
);
</script>

<template>
  <section class="auth-card">
    <h1 v-if="title" class="auth-card__title">{{ title }}</h1>
    <p v-if="description" class="auth-card__description">{{ description }}</p>
    <slot />
  </section>
</template>

<style scoped>
.auth-card {
  display: flex;
  flex-direction: column;
  width: 100%;
  max-width: var(--auth-card-width);
  padding: var(--auth-card-padding);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 2px;
  box-shadow: 0 2px 10px rgb(0 0 0 / 6%);
}

.auth-card__title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  line-height: 1.4;
  text-align: center;
}

.auth-card__description {
  margin: 12px 0 24px;
  font-size: 14px;
  line-height: 1.5;
  color: var(--color-text);
  text-align: center;
}

@media (max-width: 640px) {
  .auth-card {
    border-radius: 2px;
    box-shadow: 0 1px 6px rgb(0 0 0 / 8%);
  }

  .auth-card__description {
    margin: 8px 0 20px;
    font-size: 13px;
  }
}
</style>
