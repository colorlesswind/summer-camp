<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { applicationApi } from '@/api/application';
import { APPLICATION_MESSAGES } from '../messages';

interface SelectOption {
  label: string;
  value: number;
}

const props = withDefaults(
  defineProps<{
    modelValue: number | null;
    programCode: string | null;
    excludeId?: number | null;
    disabled?: boolean;
  }>(),
  { excludeId: null, disabled: false },
);

const emit = defineEmits<{
  (event: 'update:modelValue', value: number | null): void;
}>();

const options = ref<SelectOption[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | undefined;
let requestSeq = 0;

const selectOptions = computed(() => {
  const excluded = props.excludeId;
  const list = options.value.filter((option) => excluded === null || option.value !== excluded);
  if (
    props.modelValue !== null &&
    props.modelValue !== excluded &&
    !list.some((option) => option.value === props.modelValue)
  ) {
    list.push({ label: `Supervisor #${props.modelValue}`, value: props.modelValue });
  }
  return list;
});

async function fetchOptions(keyword = ''): Promise<void> {
  const programCode = props.programCode;
  if (!programCode) {
    options.value = [];
    return;
  }

  const seq = ++requestSeq;
  loading.value = true;
  error.value = null;
  try {
    const items = await applicationApi.searchSupervisors(programCode, keyword, 50);
    if (seq !== requestSeq) return;
    options.value = items.map((item) => ({ label: item.name, value: item.id }));
  } catch {
    if (seq !== requestSeq) return;
    error.value = 'Unable to load supervisors. Try again.';
  } finally {
    if (seq === requestSeq) loading.value = false;
  }
}

function onSearch(keyword: string): void {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void fetchOptions(keyword);
  }, 300);
}

function onSelect(value: number | undefined): void {
  emit('update:modelValue', typeof value === 'number' ? value : null);
}

watch(
  () => props.programCode,
  (code, previous) => {
    if (code === previous) return;
    // 换了 Program，原导师一定不属于新 Program
    emit('update:modelValue', null);
    void fetchOptions('');
  },
);

watch(
  () => props.modelValue,
  (value) => {
    if (value === null) return;
    if (!options.value.some((option) => option.value === value)) {
      options.value = [...options.value, { label: `Supervisor #${value}`, value }];
    }
  },
  { immediate: true },
);

watch(
  () => props.excludeId,
  (excluded) => {
    if (excluded !== null && props.modelValue === excluded) {
      emit('update:modelValue', null);
    }
  },
);

onMounted(() => {
  if (props.programCode) void fetchOptions('');
});

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
  requestSeq += 1;
});
</script>

<template>
  <div class="supervisor-select">
    <a-select
      :value="modelValue ?? undefined"
      :options="selectOptions"
      :loading="loading"
      :disabled="disabled || !programCode"
      show-search
      allow-clear
      :filter-option="false"
      :placeholder="
        programCode ? APPLICATION_MESSAGES.searchSupervisor : APPLICATION_MESSAGES.selectProgramFirst
      "
      @update:value="onSelect"
      @search="onSearch"
      @focus="options.length === 0 && programCode ? fetchOptions('') : undefined"
    />
    <p v-if="error" class="supervisor-select__error">{{ error }}</p>
  </div>
</template>

<style scoped>
.supervisor-select {
  width: 100%;
}

.supervisor-select :deep(.ant-select) {
  width: 100%;
}

.supervisor-select__error {
  margin: 4px 0 0;
  color: var(--color-danger, #cf1322);
  font-size: 12px;
}
</style>
