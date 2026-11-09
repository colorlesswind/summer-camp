<script setup lang="ts">
import { STAFF_STATUS_OPTIONS } from '@/constants/application';
import type { ApplicationStatus } from '@/types/application';
import { ADMIN_MESSAGES } from '../messages';

/** 第一项显式「All」，清空下拉同样回到 All */
const STATUS_OPTIONS = [
  { value: '', label: ADMIN_MESSAGES.filter.all },
  ...STAFF_STATUS_OPTIONS,
];

withDefaults(
  defineProps<{
    status: ApplicationStatus | null;
    keyword: string;
    selectedCount: number;
    busy?: boolean;
  }>(),
  { busy: false },
);

const emit = defineEmits<{
  (event: 'update:keyword', value: string): void;
  (event: 'change-status', value: ApplicationStatus | null): void;
  (event: 'reset'): void;
  (event: 'batch'): void;
}>();

function onStatusChange(value: unknown): void {
  const next =
    typeof value === 'string' && value !== '' ? (value as ApplicationStatus) : null;
  emit('change-status', next);
}
</script>

<template>
  <div class="admin-toolbar">
    <label class="admin-toolbar__field">
      <span class="admin-toolbar__label">{{ ADMIN_MESSAGES.filter.statusLabel }}</span>
      <span class="admin-toolbar__status-wrap">
        <a-select
          class="admin-toolbar__select"
          :value="status ?? ''"
          :options="STATUS_OPTIONS"
          :placeholder="ADMIN_MESSAGES.filter.all"
          allow-clear
          show-search
          option-filter-prop="label"
          :disabled="busy"
          @update:value="onStatusChange"
        />
      </span>
    </label>

    <span class="admin-toolbar__search-wrap">
      <a-input
        class="admin-toolbar__search"
        :value="keyword"
        :placeholder="ADMIN_MESSAGES.filter.searchPlaceholder"
        :aria-label="ADMIN_MESSAGES.filter.searchPlaceholder"
        :maxlength="128"
        allow-clear
        :disabled="busy"
        @update:value="emit('update:keyword', $event)"
      />
    </span>

    <a-button type="link" size="small" :disabled="busy" @click="emit('reset')">
      {{ ADMIN_MESSAGES.filter.reset }}
    </a-button>

    <span class="admin-toolbar__spacer" aria-hidden="true"></span>

    <a-button
      type="primary"
      :disabled="selectedCount === 0 || busy"
      :loading="busy && selectedCount > 0"
      :title="selectedCount === 0 ? ADMIN_MESSAGES.filter.batchHint : undefined"
      @click="emit('batch')"
    >
      {{ ADMIN_MESSAGES.filter.batchButton(selectedCount) }}
    </a-button>
  </div>
</template>
