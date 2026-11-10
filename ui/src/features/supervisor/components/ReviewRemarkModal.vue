<script setup lang="ts">
import { ref, watch } from 'vue';
import { SUPERVISOR_MESSAGES } from '../messages';

/**
 * 导师 Reject 的备注弹窗。备注**可选**（服务端 `review.reason` 可选），
 * 填写后会写进 Status History 的 Remark，方便事后解释。
 */
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
  (event: 'confirm', remark: string): void;
}>();

const remark = ref('');

watch(
  () => props.open,
  (open) => {
    if (open) remark.value = '';
  },
);

function close(): void {
  if (props.loading) return;
  emit('update:open', false);
}

function confirm(): void {
  emit('confirm', remark.value.trim());
}
</script>

<template>
  <a-modal
    :open="open"
    :title="SUPERVISOR_MESSAGES.reject.title"
    :confirm-loading="loading"
    :ok-text="SUPERVISOR_MESSAGES.action.reject"
    ok-type="danger"
    :cancel-text="SUPERVISOR_MESSAGES.action.cancel"
    :mask-closable="!loading"
    :closable="!loading"
    @ok="confirm"
    @cancel="close"
  >
    <p v-if="applicationNumber" class="staff-modal__target">
      Application {{ applicationNumber }}
    </p>

    <label class="staff-modal__label" for="supervisor-reject-remark">
      {{ SUPERVISOR_MESSAGES.reject.remarkLabel }}
    </label>
    <a-textarea
      id="supervisor-reject-remark"
      v-model:value="remark"
      :rows="4"
      :maxlength="1000"
      show-count
      :placeholder="SUPERVISOR_MESSAGES.reject.placeholder"
      :disabled="loading"
    />
  </a-modal>
</template>
