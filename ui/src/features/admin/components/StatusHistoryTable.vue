<script setup lang="ts">
import { computed } from 'vue';
import { staffStatusLabel } from '@/constants/application';
import type { TimelineEntry } from '@/types/application';
import { ADMIN_MESSAGES, actionLabel, formatDateTimeSeconds } from '../messages';

const props = defineProps<{
  timeline: TimelineEntry[];
}>();

/** 最新在前 */
const rows = computed(() => [...props.timeline].reverse());

function actorLabel(role: string | null): string {
  if (!role) return '—';
  return role.charAt(0).toUpperCase() + role.slice(1);
}
</script>

<template>
  <section class="admin-history">
    <h2 class="form-section__title">{{ ADMIN_MESSAGES.detail.historyTitle }}</h2>

    <div class="admin-history__wrap">
      <table class="admin-history__table">
        <thead>
          <tr>
            <th>{{ ADMIN_MESSAGES.history.action }}</th>
            <th>{{ ADMIN_MESSAGES.history.from }}</th>
            <th>{{ ADMIN_MESSAGES.history.to }}</th>
            <th>{{ ADMIN_MESSAGES.history.actor }}</th>
            <th>{{ ADMIN_MESSAGES.history.remark }}</th>
            <th>{{ ADMIN_MESSAGES.history.time }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(entry, index) in rows" :key="`${entry.at}-${index}`">
            <td>{{ actionLabel(entry.action) }}</td>
            <td>{{ entry.fromStatus ? staffStatusLabel(entry.fromStatus) : '—' }}</td>
            <td>{{ staffStatusLabel(entry.toStatus) }}</td>
            <td>{{ actorLabel(entry.actorRole) }}</td>
            <td class="admin-history__remark">{{ entry.remark || '—' }}</td>
            <td class="admin-history__time">{{ formatDateTimeSeconds(entry.at) }}</td>
          </tr>
          <tr v-if="rows.length === 0">
            <td colspan="6" class="admin-history__empty">{{ ADMIN_MESSAGES.detail.historyEmpty }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
