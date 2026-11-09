<script setup lang="ts">
import { computed } from 'vue';
import dayjs, { type Dayjs } from 'dayjs';
import type { FieldOption, FormFieldConfig, FormSchema } from '@/types/application';
import { APPLICATION_MESSAGES } from '../messages';
import SupervisorSelect from './SupervisorSelect.vue';

interface UiOption {
  label: string;
  value: string | number;
}

const props = withDefaults(
  defineProps<{
    field: FormFieldConfig;
    modelValue: unknown;
    schema: FormSchema;
    disabled?: boolean;
    compact?: boolean;
    programCode?: string | null;
    excludeSupervisorId?: number | null;
    excludeOptionValue?: string | number | null;
  }>(),
  {
    disabled: false,
    compact: false,
    programCode: null,
    excludeSupervisorId: null,
    excludeOptionValue: null,
  },
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: unknown): void;
}>();

const size = computed(() => (props.compact ? 'small' : 'middle'));

const stringValue = computed(() =>
  props.modelValue === null || props.modelValue === undefined ? '' : String(props.modelValue),
);

const numberValue = computed(() =>
  typeof props.modelValue === 'number' && Number.isFinite(props.modelValue) ? props.modelValue : null,
);

const dateValue = computed<Dayjs | null>(() => {
  if (typeof props.modelValue !== 'string' || props.modelValue === '') return null;
  const parsed = dayjs(props.modelValue);
  return parsed.isValid() ? parsed : null;
});

const supervisorValue = computed(() =>
  typeof props.modelValue === 'number' && Number.isFinite(props.modelValue) ? props.modelValue : null,
);

const selectOptions = computed<UiOption[]>(() => {
  if (props.field.optionsSource === 'programs') {
    return props.schema.enums.programs
      .filter(
        (item: FieldOption) =>
          props.excludeOptionValue === null || item.value !== String(props.excludeOptionValue),
      )
      .map((item: FieldOption) => ({
        label: item.labelEn,
        value: item.value,
      }));
  }

  return (props.field.options ?? []).map((item: FieldOption) => ({
    label: item.labelEn,
    value: item.value,
  }));
});

const selectValue = computed(() => {
  if (props.field.valueType === 'boolean') {
    if (props.modelValue === true || props.modelValue === 'true') return 'true';
    if (props.modelValue === false || props.modelValue === 'false') return 'false';
    return undefined;
  }
  return props.modelValue === null || props.modelValue === undefined ? undefined : props.modelValue;
});

function onSelect(value: unknown): void {
  if (props.field.valueType === 'boolean') {
    if (value === 'true') {
      emit('update:modelValue', true);
      return;
    }
    if (value === 'false') {
      emit('update:modelValue', false);
      return;
    }
    emit('update:modelValue', null);
    return;
  }
  emit('update:modelValue', value === undefined ? null : value);
}

function onDateChange(value: Dayjs | null): void {
  emit('update:modelValue', value ? value.format('YYYY-MM-DD') : null);
}

function onCheck(event: { target?: { checked?: boolean } }): void {
  emit('update:modelValue', event.target?.checked ?? false);
}

function onNumber(value: number | string | null): void {
  if (value === null || value === undefined || value === '') {
    emit('update:modelValue', null);
    return;
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  emit('update:modelValue', Number.isFinite(parsed) ? parsed : null);
}

function onInput(value: string | number): void {
  emit('update:modelValue', typeof value === 'string' ? value : String(value));
}
</script>

<template>
  <SupervisorSelect
    v-if="field.widget === 'single_choice' && field.optionsSource === 'supervisors_by_thrust'"
    :model-value="supervisorValue"
    :program-code="programCode"
    :exclude-id="excludeSupervisorId"
    :disabled="disabled"
    @update:model-value="emit('update:modelValue', $event)"
  />

  <a-select
    v-else-if="field.widget === 'single_choice'"
    :value="selectValue"
    :options="selectOptions"
    :size="size"
    :disabled="disabled"
    allow-clear
    show-search
    :option-filter-prop="'label'"
    :placeholder="APPLICATION_MESSAGES.selectPlaceholder"
    @update:value="onSelect"
  />

  <a-date-picker
    v-else-if="field.widget === 'date'"
    :value="dateValue"
    :size="size"
    :disabled="disabled"
    format="YYYY-MM-DD"
    :allow-clear="!disabled"
    style="width: 100%"
    @update:value="onDateChange"
  />

  <a-textarea
    v-else-if="field.widget === 'long_text'"
    :value="stringValue"
    :size="size"
    :disabled="disabled"
    :maxlength="field.maxLength ?? undefined"
    :auto-size="{ minRows: compact ? 2 : 4, maxRows: 10 }"
    show-count
    @update:value="onInput"
  />

  <a-input-number
    v-else-if="field.widget === 'number'"
    :value="numberValue"
    :size="size"
    :disabled="disabled"
    style="width: 100%"
    @update:value="onNumber"
  />

  <a-checkbox
    v-else-if="field.widget === 'checkbox'"
    :checked="Boolean(modelValue)"
    :disabled="disabled"
    @change="onCheck"
  />

  <a-input
    v-else-if="field.widget === 'readonly'"
    :value="stringValue"
    :size="size"
    disabled
  />

  <a-input
    v-else-if="field.widget === 'free_text' || field.widget === 'url'"
    :value="stringValue"
    :size="size"
    :disabled="disabled"
    :maxlength="field.maxLength ?? undefined"
    :placeholder="field.widget === 'url' ? 'https://' : undefined"
    autocomplete="off"
    @update:value="onInput"
  />

  <a-input
    v-else
    :value="stringValue"
    :size="size"
    disabled
    placeholder="This field type is not supported yet"
  />
</template>
