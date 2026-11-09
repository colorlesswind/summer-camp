<script setup lang="ts">
import { STAFF_STATUS_META } from '@/constants/application';
import type { ApplicationStatus, ApplicationSummary } from '@/types/application';
import { formatDateTime } from '@/features/staff/messages';
import { canReview, type PendingReview, type SupervisorReviewAction } from '../composables/useSupervisorApplications';
import { SUPERVISOR_MESSAGES } from '../messages';

const props = withDefaults(
  defineProps<{
    items: ApplicationSummary[];
    loading: boolean;
    busy?: boolean;
    hasFilters?: boolean;
    pending?: PendingReview | null;
  }>(),
  { busy: false, hasFilters: false, pending: null },
);

const emit = defineEmits<{
  (event: 'recommend', row: ApplicationSummary): void;
  (event: 'reject', row: ApplicationSummary): void;
  (event: 'clear-filters'): void;
}>();

function isPending(row: ApplicationSummary, action: SupervisorReviewAction): boolean {
  return props.pending?.id === row.id && props.pending.action === action;
}

function statusColor(status: ApplicationStatus): string {
  return STAFF_STATUS_META[status].color;
}
</script>

<template>
  <div class="staff-table-wrap">
    <div v-if="loading && items.length === 0" class="staff-table__state">
      <a-spin size="large" />
      <p class="staff-table__state-text">{{ SUPERVISOR_MESSAGES.loading }}</p>
    </div>

    <table v-else class="staff-table staff-table--supervisor">
      <thead>
        <tr>
          <th>{{ SUPERVISOR_MESSAGES.columns.applicationNumber }}</th>
          <th>{{ SUPERVISOR_MESSAGES.columns.applicant }}</th>
          <th>{{ SUPERVISOR_MESSAGES.columns.program }}</th>
          <th>{{ SUPERVISOR_MESSAGES.columns.status }}</th>
          <th>{{ SUPERVISOR_MESSAGES.columns.updatedAt }}</th>
          <th>{{ SUPERVISOR_MESSAGES.columns.action }}</th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="item in items" :key="item.id">
          <td>
            <router-link
              class="staff-table__link"
              :to="{ name: 'supervisor-application-detail', params: { id: item.id } }"
            >
              {{ item.applicationNumber }}
            </router-link>
          </td>
          <td>
            <span class="staff-table__applicant">
              <strong>{{ item.nameEn || '—' }}</strong>
              <span>{{ item.email }}</span>
            </span>
          </td>
          <td>{{ item.firstProgramCode || '—' }}</td>
          <td>
            <a-tag :color="statusColor(item.status)">{{ item.displayStatus }}</a-tag>
          </td>
          <td class="staff-table__time">{{ formatDateTime(item.updatedAt) }}</td>
          <td>
            <div class="staff-table__actions">
              <template v-if="canReview(item)">
                <a-button
                  type="primary"
                  size="small"
                  :loading="isPending(item, 'recommend')"
                  :disabled="busy && !isPending(item, 'recommend')"
                  @click="emit('recommend', item)"
                >
                  {{ SUPERVISOR_MESSAGES.action.recommend }}
                </a-button>
                <a-button
                  danger
                  size="small"
                  :loading="isPending(item, 'reject')"
                  :disabled="busy && !isPending(item, 'reject')"
                  @click="emit('reject', item)"
                >
                  {{ SUPERVISOR_MESSAGES.action.reject }}
                </a-button>
              </template>
              <template v-else>—</template>
            </div>
          </td>
        </tr>

        <tr v-if="!loading && items.length === 0">
          <td colspan="6" class="staff-table__empty">
            <p>
              {{
                hasFilters
                  ? SUPERVISOR_MESSAGES.filter.empty
                  : SUPERVISOR_MESSAGES.filter.emptyAll
              }}
            </p>
            <a-button v-if="hasFilters" type="link" size="small" @click="emit('clear-filters')">
              {{ SUPERVISOR_MESSAGES.filter.clearFilters }}
            </a-button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
