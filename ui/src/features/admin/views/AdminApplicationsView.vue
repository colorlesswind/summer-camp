<script setup lang="ts">
import { computed, ref } from 'vue';
import { Modal, message } from 'ant-design-vue';
import type { ApplicationSummary, BatchOfferResult } from '@/types/application';
import { useAdminApplications } from '../composables/useAdminApplications';
import { ADMIN_MESSAGES } from '../messages';
import ApplicationFilterBar from '../components/ApplicationFilterBar.vue';
import ApplicationTable from '../components/ApplicationTable.vue';
import BatchOfferResultModal from '../components/BatchOfferResultModal.vue';
import ReturnReasonModal from '../components/ReturnReasonModal.vue';
import '../styles/admin.css';

const {
  items,
  total,
  loading,
  error,
  actionBusy,
  selectedIds,
  selectedCount,
  keyword,
  status,
  page,
  pageSize,
  reload,
  setStatus,
  setPage,
  setPageSize,
  reset,
  approve,
  returnToStudent,
  sendOffer,
  sendOfferBatch,
} = useAdminApplications();

const returnTarget = ref<ApplicationSummary | null>(null);
const returnOpen = ref(false);
const batchResult = ref<BatchOfferResult | null>(null);
const batchResultOpen = ref(false);

const hasFilters = computed(() => status.value !== null || keyword.value.trim() !== '');

const totalLabel = (count: number): string => `Total ${count}`;

function confirmApprove(row: ApplicationSummary): void {
  Modal.confirm({
    title: ADMIN_MESSAGES.approve.confirmTitle,
    content: ADMIN_MESSAGES.approve.confirmContent(row.applicationNumber),
    okText: ADMIN_MESSAGES.action.approve,
    cancelText: ADMIN_MESSAGES.action.cancel,
    onOk: () => approve(row.id),
  });
}

function openReturn(row: ApplicationSummary): void {
  returnTarget.value = row;
  returnOpen.value = true;
}

async function handleReturn(reason: string): Promise<void> {
  const target = returnTarget.value;
  if (!target) return;
  const ok = await returnToStudent(target.id, reason);
  if (ok) {
    returnOpen.value = false;
    returnTarget.value = null;
  }
}

function confirmSendOffer(row: ApplicationSummary): void {
  Modal.confirm({
    title: ADMIN_MESSAGES.offer.confirmTitle,
    content: ADMIN_MESSAGES.offer.confirmContent(row.applicationNumber),
    okText: ADMIN_MESSAGES.action.sendOffer,
    cancelText: ADMIN_MESSAGES.action.cancel,
    onOk: () => sendOffer(row.id),
  });
}

function confirmBatch(): void {
  const ids = [...selectedIds.value];
  if (ids.length === 0) return;

  Modal.confirm({
    title: ADMIN_MESSAGES.offer.batchConfirmTitle,
    content: ADMIN_MESSAGES.offer.batchConfirmContent(ids.length),
    okText: ADMIN_MESSAGES.offer.batchConfirm,
    cancelText: ADMIN_MESSAGES.action.cancel,
    onOk: async () => {
      const result = await sendOfferBatch(ids);
      if (!result) return;
      if (result.failureCount === 0) {
        message.success(ADMIN_MESSAGES.offer.allSuccess(result.successCount));
        return;
      }
      batchResult.value = result;
      batchResultOpen.value = true;
    },
  });
}

function handlePageChange(nextPage: number, nextSize: number): void {
  if (nextSize !== pageSize.value) setPageSize(nextSize);
  else setPage(nextPage);
}
</script>

<template>
  <div class="admin-page">
    <header class="admin-page__header">
      <h1 class="admin-page__title">{{ ADMIN_MESSAGES.title }}</h1>
      <p class="admin-page__intro">{{ ADMIN_MESSAGES.intro }}</p>
    </header>

    <div class="admin-table-container">
      <ApplicationFilterBar
        :status="status"
        :keyword="keyword"
        :selected-count="selectedCount"
        :busy="actionBusy"
        @update:keyword="keyword = $event"
        @change-status="setStatus"
        @reset="reset"
        @batch="confirmBatch"
      />

      <a-result
        v-if="error"
        status="error"
        :title="ADMIN_MESSAGES.loadFailed"
        :sub-title="error"
      >
        <template #extra>
          <a-button type="primary" @click="reload">{{ ADMIN_MESSAGES.detail.tryAgain }}</a-button>
        </template>
      </a-result>

      <template v-else>
        <ApplicationTable
          v-model:selected-ids="selectedIds"
          :items="items"
          :loading="loading"
          :busy="actionBusy"
          :has-filters="hasFilters"
          @approve="confirmApprove"
          @request-return="openReturn"
          @send-offer="confirmSendOffer"
          @clear-filters="reset"
        />

        <footer class="admin-table__footer">
          <a-pagination
            :current="page"
            :page-size="pageSize"
            :total="total"
            :show-size-changer="true"
            :page-size-options="[20, 50, 100]"
            :show-total="totalLabel"
            @change="handlePageChange"
          />
        </footer>
      </template>
    </div>

    <ReturnReasonModal
      v-model:open="returnOpen"
      :loading="actionBusy"
      :application-number="returnTarget?.applicationNumber ?? null"
      @confirm="handleReturn"
    />

    <BatchOfferResultModal v-model:open="batchResultOpen" :result="batchResult" />
  </div>
</template>
