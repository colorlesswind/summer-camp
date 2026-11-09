<script setup lang="ts">
import type { ApplicationStatus } from '@/types/application';
import type { FilterBarTexts, StatusFilterOption } from '../types';

/**
 * 表格容器顶栏：状态筛选 + 关键词 + Reset（+ 角色专属动作，通过 #actions 插槽注入）。
 *
 * 管理端传入 9 个状态与批量 Send Offer；导师端只传 6 个可见状态、不传插槽。
 */
withDefaults(
  defineProps<{
    status: ApplicationStatus | null;
    statusOptions: readonly StatusFilterOption[];
    keyword: string;
    texts: FilterBarTexts;
    busy?: boolean;
  }>(),
  { busy: false },
);

const emit = defineEmits<{
  (event: 'update:keyword', value: string): void;
  (event: 'change-status', value: ApplicationStatus | null): void;
  (event: 'reset'): void;
}>();

function onStatusChange(value: unknown): void {
  const next =
    typeof value === 'string' && value !== '' ? (value as ApplicationStatus) : null;
  emit('change-status', next);
}
</script>

<template>
  <div class="staff-toolbar">
    <label class="staff-toolbar__field">
      <span class="staff-toolbar__label">{{ texts.statusLabel }}</span>
      <span class="staff-toolbar__status-wrap">
        <a-select
          class="staff-toolbar__select"
          :value="status ?? ''"
          :options="statusOptions"
          :placeholder="texts.all"
          allow-clear
          show-search
          option-filter-prop="label"
          :disabled="busy"
          @update:value="onStatusChange"
        />
      </span>
    </label>

    <span class="staff-toolbar__search-wrap">
      <a-input
        class="staff-toolbar__search"
        :value="keyword"
        :placeholder="texts.searchPlaceholder"
        :aria-label="texts.searchPlaceholder"
        :maxlength="128"
        allow-clear
        :disabled="busy"
        @update:value="emit('update:keyword', $event)"
      />
    </span>

    <a-button type="link" size="small" :disabled="busy" @click="emit('reset')">
      {{ texts.reset }}
    </a-button>

    <span class="staff-toolbar__spacer" aria-hidden="true"></span>

    <slot name="actions"></slot>
  </div>
</template>
