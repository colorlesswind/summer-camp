<script setup lang="ts">
import { computed } from 'vue';
import type { FormFieldConfig, FormSchema } from '@/types/application';
import { tableColumns, type FieldGroup } from '../field-groups';
import type { RepeatableRow } from '../composables/useApplicationForm';
import { APPLICATION_MESSAGES } from '../messages';
import FormField from './FormField.vue';

const MAX_ROWS = 20;

const props = withDefaults(
  defineProps<{
    section: { code: string; titleEn: string; fields: FormFieldConfig[] };
    schema: FormSchema;
    rows: RepeatableRow[];
    disabled?: boolean;
    rowErrors: Record<string, string>;
  }>(),
  { disabled: false },
);

const emit = defineEmits<{
  (event: 'add'): void;
  (event: 'remove', index: number): void;
}>();

const columns = computed<FieldGroup[]>(() => tableColumns(props.section.fields));
const canAdd = computed(() => !props.disabled && props.rows.length < MAX_ROWS);

function setValue(row: RepeatableRow, field: FormFieldConfig, value: unknown): void {
  row[field.code] = value;
  delete props.rowErrors[`${props.section.code}:${props.rows.indexOf(row)}:${field.code}`];
}

function errorFor(index: number, field: FormFieldConfig): string | undefined {
  return props.rowErrors[`${props.section.code}:${index}:${field.code}`];
}

function columnRequired(column: FieldGroup): boolean {
  return column.fields.some((field) => field.isRequired);
}

function programCodeFor(field: FormFieldConfig, row: RepeatableRow): string | null {
  if (!field.dependsOnField) return null;
  const value = row[field.dependsOnField];
  return value === null || value === undefined || value === '' ? null : String(value);
}
</script>

<template>
  <section class="form-section" :data-section-code="section.code">
    <h2 class="form-section__title">{{ section.titleEn }}</h2>
    <p v-if="section.code === 'PUBLICATIONS'" class="form-section__hint">
      In descending order of importance.
    </p>

    <div class="repeat-table-wrap">
      <table class="repeat-table">
        <thead>
          <tr>
            <th v-if="!disabled" class="repeat-table__action">Action</th>
            <th v-for="column in columns" :key="column.key">
              {{ column.label }}
              <span v-if="columnRequired(column)" class="form-field__required" aria-hidden="true">*</span>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="row._key">
            <td v-if="!disabled" class="repeat-table__action">
              <a-button type="link" size="small" danger @click="emit('remove', index)">
                {{ APPLICATION_MESSAGES.removeRow }}
              </a-button>
            </td>
            <td v-for="column in columns" :key="column.key">
              <div
                class="repeat-cell"
                :class="{ 'repeat-cell--group': column.fields.length > 1 }"
              >
                <div
                  v-for="field in column.fields"
                  :key="field.code"
                  class="repeat-cell__item"
                >
                  <FormField
                    :field="field"
                    :model-value="row[field.code]"
                    :schema="schema"
                    :disabled="disabled"
                    :compact="true"
                    :program-code="programCodeFor(field, row)"
                    @update:model-value="setValue(row, field, $event)"
                  />
                  <p v-if="errorFor(index, field)" class="form-field__error">
                    {{ errorFor(index, field) }}
                  </p>
                </div>
              </div>
            </td>
          </tr>
          <tr v-if="rows.length === 0">
            <td :colspan="columns.length + (disabled ? 0 : 1)" class="repeat-table__empty">
              {{ APPLICATION_MESSAGES.noEntries }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="canAdd" class="repeat-table__footer">
      <a-button size="small" @click="emit('add')">+ {{ APPLICATION_MESSAGES.addRow }}</a-button>
    </div>
  </section>
</template>
