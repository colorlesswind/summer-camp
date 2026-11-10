<script setup lang="ts">
import { computed } from 'vue';
import { staffStatusLabel } from '@/constants/application';
import type { TimelineEntry } from '@/types/application';
import { STAFF_MESSAGES, actionLabel, formatDateTimeSeconds } from '../messages';

/** 状态流转时间线（管理端 / 导师端共用），最新在前 */
const props = defineProps<{
  timeline: TimelineEntry[];
}>();

const rows = computed(() => [...props.timeline].reverse());

function actorLabel(role: string | null): string {
  if (!role) return '—';
  return role.charAt(0).toUpperCase() + role.slice(1);
}
</script>

<template>
  <section class="staff-history">
    <h2 class="form-section__title">{{ STAFF_MESSAGES.history.title }}</h2>

    <div class="staff-history__wrap">
      <table class="staff-history__table">
        <thead>
          <tr>
            <th>{{ STAFF_MESSAGES.history.action }}</th>
            <th>{{ STAFF_MESSAGES.history.from }}</th>
            <th>{{ STAFF_MESSAGES.history.to }}</th>
            <th>{{ STAFF_MESSAGES.history.actor }}</th>
            <th>{{ STAFF_MESSAGES.history.remark }}</th>
            <th>{{ STAFF_MESSAGES.history.time }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(entry, index) in rows" :key="`${entry.at}-${index}`">
            <td>{{ actionLabel(entry.action) }}</td>
            <td>{{ entry.fromStatus ? staffStatusLabel(entry.fromStatus) : '—' }}</td>
            <td>{{ staffStatusLabel(entry.toStatus) }}</td>
            <td>{{ actorLabel(entry.actorRole) }}</td>
            <td class="staff-history__remark">{{ entry.remark || '—' }}</td>
            <td class="staff-history__time">{{ formatDateTimeSeconds(entry.at) }}</td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="6" class="staff-history__empty">{{ STAFF_MESSAGES.history.empty }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
