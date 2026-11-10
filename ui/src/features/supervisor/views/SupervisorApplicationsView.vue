<script setup lang="ts">
import { computed, ref } from 'vue';
import { Modal } from 'ant-design-vue';
import { SUPERVISOR_STATUS_OPTIONS } from '@/constants/application';
import type { ApplicationSummary } from '@/types/application';
import ApplicationFilterBar from '@/features/staff/components/ApplicationFilterBar.vue';
import type { FilterBarTexts, StatusFilterOption } from '@/features/staff/types';
import { useSupervisorApplications } from '../composables/useSupervisorApplications';
import { SUPERVISOR_MESSAGES } from '../messages';
import SupervisorApplicationTable from '../components/SupervisorApplicationTable.vue';
import ReviewRemarkModal from '../components/ReviewRemarkModal.vue';
import '@/features/staff/styles/staff.css';

const {
  items,
  total,
  loading,
  error,
  notRegistered,
  actionBusy,
  pendingReview,
  keyword,
  status,
  page,
  pageSize,
  reload,
  setStatus,
  setPage,
  setPageSize,
  reset,
  recommend,
  reject,
} = useSupervisorApplications();

const rejectTarget = ref<ApplicationSummary | null>(null);
const rejectOpen = ref(false);

const hasFilters = computed(() => status.value !== null || keyword.value.trim() !== '');

/** 只列 6 个导师可见状态；初筛前的状态服务端本来就查不到，不做成选项 */
const statusOptions: StatusFilterOption[] = [
  { value: '', label: SUPERVISOR_MESSAGES.filter.all },
  ...SUPERVISOR_STATUS_OPTIONS,
];

const filterTexts: FilterBarTexts = {
  statusLabel: SUPERVISOR_MESSAGES.filter.statusLabel,
  all: SUPERVISOR_MESSAGES.filter.all,
  searchPlaceholder: SUPERVISOR_MESSAGES.filter.searchPlaceholder,
  reset: SUPERVISOR_MESSAGES.filter.reset,
};

const totalLabel = (count: number): string => `Total ${count}`;

function confirmRecommend(row: ApplicationSummary): void {
  Modal.confirm({
    title: SUPERVISOR_MESSAGES.recommend.confirmTitle,
    content: SUPERVISOR_MESSAGES.recommend.confirmContent(row.applicationNumber),
    okText: SUPERVISOR_MESSAGES.action.recommend,
    cancelText: SUPERVISOR_MESSAGES.action.cancel,
    onOk: () => recommend(row),
  });
}

function openReject(row: ApplicationSummary): void {
  rejectTarget.value = row;
  rejectOpen.value = true;
}

async function handleReject(remark: string): Promise<void> {
  const target = rejectTarget.value;
  if (!target) return;
  const ok = await reject(target, remark);
  if (ok) {
    rejectOpen.value = false;
    rejectTarget.value = null;
  }
}

function handlePageChange(nextPage: number, nextSize: number): void {
  if (nextSize !== pageSize.value) setPageSize(nextSize);
  else setPage(nextPage);
}
</script>

<template>
  <div class="staff-page">
    <header class="staff-page__header">
      <h1 class="staff-page__title">{{ SUPERVISOR_MESSAGES.title }}</h1>
      <p class="staff-page__intro">{{ SUPERVISOR_MESSAGES.intro }}</p>
    </header>

    <a-result
      v-if="notRegistered"
      status="warning"
      :title="SUPERVISOR_MESSAGES.notRegistered.title"
      :sub-title="SUPERVISOR_MESSAGES.notRegistered.hint"
    />

    <div v-else class="staff-table-container">
      <ApplicationFilterBar
        :status="status"
        :status-options="statusOptions"
        :keyword="keyword"
        :texts="filterTexts"
        :busy="actionBusy"
        @update:keyword="keyword = $event"
        @change-status="setStatus"
        @reset="reset"
      />

      <a-result
        v-if="error"
        status="error"
        :title="SUPERVISOR_MESSAGES.loadFailed"
        :sub-title="error"
      >
        <template #extra>
          <a-button type="primary" @click="reload">{{ SUPERVISOR_MESSAGES.detail.tryAgain }}</a-button>
        </template>
      </a-result>

      <template v-else>
        <SupervisorApplicationTable
          :items="items"
          :loading="loading"
          :busy="actionBusy"
          :has-filters="hasFilters"
          :pending="pendingReview"
          @recommend="confirmRecommend"
          @reject="openReject"
          @clear-filters="reset"
        />

        <footer class="staff-table__footer">
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

    <ReviewRemarkModal
      v-model:open="rejectOpen"
      :loading="actionBusy"
      :application-number="rejectTarget?.applicationNumber ?? null"
      @confirm="handleReject"
    />
  </div>
</template>
