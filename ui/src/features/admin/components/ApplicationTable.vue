<script setup lang="ts">
import { computed } from 'vue';
import { STAFF_STATUS_META } from '@/constants/application';
import type { ApplicationStatus, ApplicationSummary } from '@/types/application';
import { formatDateTime } from '@/features/staff/messages';
import { canSendOffer } from '../composables/useAdminApplications';
import { ADMIN_MESSAGES } from '../messages';

interface CheckboxChangeEventLike {
  target?: { checked?: boolean };
}

const props = withDefaults(
  defineProps<{
    items: ApplicationSummary[];
    loading: boolean;
    selectedIds: string[];
    busy?: boolean;
    hasFilters?: boolean;
  }>(),
  { busy: false, hasFilters: false },
);

const emit = defineEmits<{
  (event: 'update:selectedIds', value: string[]): void;
  (event: 'approve', row: ApplicationSummary): void;
  (event: 'request-return', row: ApplicationSummary): void;
  (event: 'send-offer', row: ApplicationSummary): void;
  (event: 'clear-filters'): void;
}>();

const selectableIds = computed(() =>
  props.items.filter((item) => canSendOffer(item)).map((item) => item.id),
);

const allSelected = computed(
  () =>
    selectableIds.value.length > 0 &&
    selectableIds.value.every((id) => props.selectedIds.includes(id)),
);

const someSelected = computed(
  () =>
    !allSelected.value &&
    selectableIds.value.some((id) => props.selectedIds.includes(id)),
);

const isSelected = (id: string): boolean => props.selectedIds.includes(id);

function toggleRow(id: string, event: CheckboxChangeEventLike): void {
  const checked = event.target?.checked ?? false;
  const next = new Set(props.selectedIds);
  if (checked) next.add(id);
  else next.delete(id);
  emit('update:selectedIds', [...next]);
}

function toggleAll(event: CheckboxChangeEventLike): void {
  emit(
    'update:selectedIds',
    event.target?.checked ? [...selectableIds.value] : [],
  );
}

function onRowChange(id: string, event: CheckboxChangeEventLike): void {
  toggleRow(id, event);
}

function choiceLabel(code: string | null, supervisor: string | null): string {
  if (!code && !supervisor) return '—';
  if (!supervisor) return code ?? '—';
  return code ? `${code} · ${supervisor}` : supervisor;
}

function statusColor(status: ApplicationStatus): string {
  return STAFF_STATUS_META[status].color;
}
</script>

<template>
  <div class="staff-table-wrap">
    <div v-if="loading && items.length === 0" class="staff-table__state">
      <a-spin size="large" />
      <p class="staff-table__state-text">{{ ADMIN_MESSAGES.loading }}</p>
    </div>

    <table v-else class="staff-table">
      <thead>
        <tr>
          <th class="staff-table__select">
            <a-checkbox
              :checked="allSelected"
              :indeterminate="someSelected"
              :disabled="selectableIds.length === 0"
              :aria-label="ADMIN_MESSAGES.filter.selectAll"
              @change="toggleAll"
            />
          </th>
          <th>{{ ADMIN_MESSAGES.columns.applicationNumber }}</th>
          <th>{{ ADMIN_MESSAGES.columns.applicant }}</th>
          <th>{{ ADMIN_MESSAGES.columns.firstChoice }}</th>
          <th>{{ ADMIN_MESSAGES.columns.secondChoice }}</th>
          <th>{{ ADMIN_MESSAGES.columns.status }}</th>
          <th>{{ ADMIN_MESSAGES.columns.updatedAt }}</th>
          <th>{{ ADMIN_MESSAGES.columns.action }}</th>
        </tr>
      </thead>

      <tbody>
        <tr v-for="item in items" :key="item.id">
          <td>
            <a-checkbox
              :checked="isSelected(item.id)"
              :disabled="!canSendOffer(item)"
              :title="canSendOffer(item) ? undefined : ADMIN_MESSAGES.filter.batchHint"
              :aria-label="ADMIN_MESSAGES.filter.selectRow(item.applicationNumber)"
              @change="onRowChange(item.id, $event)"
            />
          </td>
          <td>
            <router-link
              class="staff-table__link"
              :to="{ name: 'admin-application-detail', params: { id: item.id } }"
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
          <td>{{ choiceLabel(item.firstProgramCode, item.firstSupervisorName) }}</td>
          <td>{{ choiceLabel(item.secondProgramCode, item.secondSupervisorName) }}</td>
          <td>
            <a-tag :color="statusColor(item.status)">{{ item.displayStatus }}</a-tag>
          </td>
          <td class="staff-table__time">{{ formatDateTime(item.updatedAt) }}</td>
          <td>
            <div class="staff-table__actions">
              <template v-if="item.status === 'PendingForPreliminaryScreening'">
                <a-button
                  type="primary"
                  size="small"
                  :disabled="busy"
                  @click="emit('approve', item)"
                >
                  {{ ADMIN_MESSAGES.action.approve }}
                </a-button>
                <a-button size="small" :disabled="busy" @click="emit('request-return', item)">
                  {{ ADMIN_MESSAGES.action.return }}
                </a-button>
              </template>
              <a-button
                v-else-if="item.status === 'SupervisorRecommended'"
                type="primary"
                size="small"
                :disabled="busy"
                @click="emit('send-offer', item)"
              >
                {{ ADMIN_MESSAGES.action.sendOffer }}
              </a-button>
              <template v-else>—</template>
            </div>
          </td>
        </tr>

        <tr v-if="!loading && items.length === 0">
          <td colspan="8" class="staff-table__empty">
            <p>
              {{ hasFilters ? ADMIN_MESSAGES.filter.empty : ADMIN_MESSAGES.filter.emptyAll }}
            </p>
            <a-button v-if="hasFilters" type="link" size="small" @click="emit('clear-filters')">
              {{ ADMIN_MESSAGES.filter.clearFilters }}
            </a-button>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
