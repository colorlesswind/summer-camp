<script setup lang="ts">
import type { BatchOfferResult } from '@/types/application';
import { ADMIN_MESSAGES, batchFailureMessage } from '../messages';

defineProps<{
  open: boolean;
  result: BatchOfferResult | null;
}>();

const emit = defineEmits<{
  (event: 'update:open', value: boolean): void;
}>();

function close(): void {
  emit('update:open', false);
}
</script>

<template>
  <a-modal
    :open="open"
    :title="ADMIN_MESSAGES.batch.resultTitle"
    :footer="null"
    :width="560"
    @cancel="close"
  >
    <template v-if="result">
      <p class="admin-modal__summary">
        {{ ADMIN_MESSAGES.batch.summary(result.successCount, result.failureCount, result.total) }}
      </p>

      <div v-if="result.failures.length > 0" class="admin-modal__failures">
        <table class="admin-modal__table">
          <thead>
            <tr>
              <th>{{ ADMIN_MESSAGES.batch.failureApplication }}</th>
              <th>{{ ADMIN_MESSAGES.batch.failureReason }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="failure in result.failures" :key="failure.id">
              <td>{{ failure.applicationNumber || '—' }}</td>
              <td>{{ batchFailureMessage(failure.code) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <div class="admin-modal__actions">
      <a-button type="primary" @click="close">{{ ADMIN_MESSAGES.batch.close }}</a-button>
    </div>
  </a-modal>
</template>
