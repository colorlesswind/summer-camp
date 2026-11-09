<script setup lang="ts">
import { computed } from 'vue';
import type { FormFieldConfig, FormSchema, FormValues } from '@/types/application';
import { subFieldLabel, type FieldGroup } from '../field-groups';
import FormField from './FormField.vue';

const props = withDefaults(
  defineProps<{
    group: FieldGroup;
    values: FormValues;
    schema: FormSchema;
    disabled?: boolean;
    errors: Record<string, string>;
    required?: boolean;
  }>(),
  { disabled: false, required: false },
);

const isWide = computed(() => props.group.fields.some((field) => field.widget === 'long_text'));
const showSubLabel = computed(() => props.group.fields.length > 1);
const groupHint = computed(
  () => props.group.fields.find((field) => field.guideTextEn)?.guideTextEn ?? null,
);
const hasAnyError = computed(() =>
  props.group.fields.some((field) => Boolean(props.errors[field.code])),
);

const isNil = (value: unknown): boolean =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

function setValue(code: string, value: unknown): void {
  props.values[code] = value;
  delete props.errors[code];
}

function programCodeFor(field: FormFieldConfig): string | null {
  if (!field.dependsOnField) return null;
  const value = props.values[field.dependsOnField];
  return isNil(value) ? null : String(value);
}

function excludeSupervisorFor(field: FormFieldConfig): number | null {
  if (field.code !== 'supervisorSecondId') return null;
  const first = props.values['supervisorFirstId'];
  const parsed = typeof first === 'number' ? first : Number(first);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function excludeOptionFor(field: FormFieldConfig): string | number | null {
  if (field.code !== 'programSecondId') return null;
  const first = props.values['programFirstId'];
  if (isNil(first)) return null;
  return typeof first === 'number' || typeof first === 'string' ? first : String(first);
}
</script>

<template>
  <div class="form-field" :class="{ 'form-field--wide': isWide }">
    <label class="form-field__label">
      {{ group.label }}
      <span v-if="required" class="form-field__required" aria-hidden="true">*</span>
    </label>

    <div class="form-field__controls">
      <div v-for="field in group.fields" :key="field.code" class="form-field__control">
        <span v-if="showSubLabel" class="form-field__sub-label">{{ subFieldLabel(field) }}</span>

        <FormField
          :field="field"
          :model-value="values[field.code]"
          :schema="schema"
          :disabled="disabled"
          :program-code="programCodeFor(field)"
          :exclude-supervisor-id="excludeSupervisorFor(field)"
          :exclude-option-value="excludeOptionFor(field)"
          @update:model-value="setValue(field.code, $event)"
        />

        <p v-if="errors[field.code]" class="form-field__error">{{ errors[field.code] }}</p>
      </div>
    </div>

    <p v-if="groupHint && !hasAnyError" class="form-field__hint">{{ groupHint }}</p>
  </div>
</template>
