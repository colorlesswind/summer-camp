<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { ADMIN_MESSAGES } from '../messages';

const props = withDefaults(
  defineProps<{
    open: boolean;
    loading?: boolean;
    applicationNumber?: string | null;
  }>(),
  { loading: false, applicationNumber: null },
);

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
  (event: 'confirm', reason: string): void;
}>();

const reason = ref('');
const touched = ref(false);

const trimmedReason = computed(() => reason.value.trim());
const invalid = computed(() => touched.value && trimmedReason.value.length === 0);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    reason.value = '';
    touched.value = false;
  },
);

function close(): void {
  if (props.loading) return;
  emit('update:open', false);
}

function confirm(): void {
  touched.value = true;
  if (trimmedReason.value.length === 0) return;
  emit('confirm', trimmedReason.value);
}
</script>

<template>
  <a-modal
    :open="open"
    :title="ADMIN_MESSAGES.return.title"
    :confirm-loading="loading"
    :ok-text="ADMIN_MESSAGES.action.return"
    :cancel-text="ADMIN_MESSAGES.action.cancel"
    :mask-closable="!loading"
    :closable="!loading"
    @ok="confirm"
    @cancel="close"
  >
    <p v-if="applicationNumber" class="staff-modal__target">
      Application {{ applicationNumber }}
    </p>

    <label class="staff-modal__label" for="admin-return-reason">
      {{ ADMIN_MESSAGES.return.reasonLabel }}
    </label>
    <a-textarea
      id="admin-return-reason"
      v-model:value="reason"
      :rows="4"
      :maxlength="1000"
      show-count
      :placeholder="ADMIN_MESSAGES.return.placeholder"
      :disabled="loading"
      :status="invalid ? 'error' : undefined"
      @blur="touched = true"
    />
    <p v-if="invalid" class="staff-modal__error">{{ ADMIN_MESSAGES.return.required }}</p>
  </a-modal>
</template>
