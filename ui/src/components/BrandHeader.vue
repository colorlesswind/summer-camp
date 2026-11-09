<script setup lang="ts">
import logoUrl from '@resource/logo.png';
</script>

<template>
  <header class="brand-header">
    <div class="brand-header__brand">
      <router-link class="brand-header__logo-link" to="/" aria-label="Summer Camp home">
        <img
          class="brand-header__logo"
          :src="logoUrl"
          alt="The Hong Kong University of Science and Technology (Guangzhou)"
        />
      </router-link>

      <span class="brand-header__divider" aria-hidden="true"></span>

      <div class="brand-header__unit">
        <span class="brand-header__unit-cn">功能枢纽</span>
        <span class="brand-header__unit-en">FUNCTION HUB</span>
      </div>
    </div>

    <div v-if="$slots.actions" class="brand-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.brand-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: var(--header-height);
  padding: 12px 32px;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-divider);
}

.brand-header__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.brand-header__logo-link {
  display: inline-flex;
  flex: 0 0 auto;
}

.brand-header__logo {
  display: block;
  width: auto;
  height: 36px;
}

.brand-header__logo-link:hover {
  text-decoration: none;
}

.brand-header__divider {
  flex: 0 0 auto;
  width: 1px;
  height: 34px;
  background: var(--color-border);
}

.brand-header__unit {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.25;
  color: var(--brand-navy);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.brand-header__unit-en {
  letter-spacing: 0.08em;
}

.brand-header__actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

@media (max-width: 640px) {
  .brand-header {
    padding: 10px 16px;
  }

  .brand-header__logo {
    height: 30px;
  }

  .brand-header__divider {
    height: 28px;
  }

  .brand-header__unit {
    font-size: 9px;
  }
}
</style>
