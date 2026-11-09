<script setup lang="ts">
import { computed } from 'vue';
import type { FormSectionConfig, FormSchema, FormValues } from '@/types/application';
import { groupFields, type FieldGroup } from '@/features/application/field-groups';
import type { RepeatableRow } from '@/features/application/form-values';
import FormFieldGroup from '@/features/application/components/FormFieldGroup.vue';
import RepeatableSection from '@/features/application/components/RepeatableSection.vue';
import StatementSection from '@/features/application/components/StatementSection.vue';

const props = defineProps<{
  schema: FormSchema;
  values: FormValues;
  valueLabels: Record<string, string>;
}>();

const EMPTY_ERRORS: Record<string, string> = {};

const groupsBySection = computed(() => {
  const map = new Map<string, FieldGroup[]>();
  for (const section of props.schema.sections) {
    map.set(section.code, groupFields(section.fields));
  }
  return map;
});

function groupsFor(section: FormSectionConfig): FieldGroup[] {
  return groupsBySection.value.get(section.code) ?? [];
}

function rowsFor(section: FormSectionConfig): RepeatableRow[] {
  const key = section.payloadKey;
  if (!key) return [];
  const rows = props.values[key];
  return Array.isArray(rows) ? (rows as RepeatableRow[]) : [];
}
</script>

<template>
  <form class="application-form admin-body" novalidate @submit.prevent>
    <template v-for="section in schema.sections" :key="section.code">
      <StatementSection
        v-if="section.code === 'STATEMENT'"
        :section="section"
        :schema="schema"
        :values="values"
        :disabled="true"
        :errors="EMPTY_ERRORS"
        presentation="text"
      />

      <RepeatableSection
        v-else-if="section.isRepeatable"
        :section="section"
        :schema="schema"
        :rows="rowsFor(section)"
        :disabled="true"
        :row-errors="EMPTY_ERRORS"
        :value-labels="valueLabels"
        presentation="text"
      />

      <section v-else class="form-section" :data-section-code="section.code">
        <h2 class="form-section__title">{{ section.titleEn }}</h2>
        <FormFieldGroup
          v-for="group in groupsFor(section)"
          :key="group.key"
          :group="group"
          :values="values"
          :schema="schema"
          :disabled="true"
          :errors="EMPTY_ERRORS"
          :value-labels="valueLabels"
          presentation="text"
        />
      </section>
    </template>
  </form>
</template>
