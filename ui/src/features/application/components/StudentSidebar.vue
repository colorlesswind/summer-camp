<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router';
import { APPLICATION_MESSAGES } from '../messages';

/**
 * 学生端左侧导航（SUMMER CAMP / Application Status / Application Form）。
 *
 * - `active` 决定当前高亮项；
 * - `formTarget` 为空时不渲染可点击的 Application Form（例如已经在表单页），
 *   避免学生从一个只读申请再点进“新建申请”。
 */
withDefaults(
  defineProps<{
    active: 'status' | 'form';
    formTarget?: RouteLocationRaw | null;
  }>(),
  { formTarget: null },
);
</script>

<template>
  <aside class="application-sidebar">
    <div class="application-sidebar__sticky">
      <div class="application-sidebar__brand">{{ APPLICATION_MESSAGES.sidebarTitle }}</div>
      <nav class="application-sidebar__nav" aria-label="Summer Camp">
        <router-link
          v-if="active !== 'status'"
          class="application-sidebar__item"
          :to="{ name: 'student-applications' }"
        >
          {{ APPLICATION_MESSAGES.sidebarStatus }}
        </router-link>
        <span v-else class="application-sidebar__item is-active">
          {{ APPLICATION_MESSAGES.sidebarStatus }}
        </span>

        <router-link
          v-if="active !== 'form' && formTarget"
          class="application-sidebar__item"
          :to="formTarget"
        >
          {{ APPLICATION_MESSAGES.sidebarForm }}
        </router-link>
        <span
          v-else
          class="application-sidebar__item"
          :class="{ 'is-active': active === 'form' }"
        >
          {{ APPLICATION_MESSAGES.sidebarForm }}
        </span>
      </nav>
    </div>
  </aside>
</template>
