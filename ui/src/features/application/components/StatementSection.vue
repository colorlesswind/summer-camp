<script setup lang="ts">
import { computed } from 'vue';
import type { FormFieldConfig, FormSchema, FormSectionConfig, FormValues, StatementConfig } from '@/types/application';
import { APPLICATION_MESSAGES } from '../messages';

const props = withDefaults(
  defineProps<{
    section: FormSectionConfig;
    schema: FormSchema;
    values: FormValues;
    disabled?: boolean;
    errors: Record<string, string>;
  }>(),
  { disabled: false },
);

const statementByField = computed(() => {
  const map = new Map<string, StatementConfig>();
  for (const statement of props.schema.statements) map.set(statement.fieldCode, statement);
  return map;
});

function statementText(field: FormFieldConfig): string {
  return statementByField.value.get(field.code)?.textEn ?? APPLICATION_MESSAGES.statementFallback;
}

function onCheck(field: FormFieldConfig, event: { target?: { checked?: boolean } }): void {
  props.values[field.code] = event.target?.checked ?? false;
  delete props.errors[field.code];
}
</script>

<template>
  <section class="form-section" :data-section-code="section.code">
    <h2 class="form-section__title">{{ section.titleEn }}</h2>

    <div class="statement-list">
      <div v-for="field in section.fields" :key="field.code" class="statement-item">
        <a-checkbox
          :checked="Boolean(values[field.code])"
          :disabled="disabled"
          @change="onCheck(field, $event)"
        >
          <span class="statement-item__text">{{ statementText(field) }}</span>
        </a-checkbox>
        <p v-if="errors[field.code]" class="form-field__error">{{ errors[field.code] }}</p>
      </div>
    </div>
  </section>
</template>
