<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Modal } from 'ant-design-vue';
import { STAFF_STATUS_META } from '@/constants/application';
import { makeRow } from '@/features/application/form-values';
import { useSectionScrollSpy } from '@/features/application/composables/useSectionScrollSpy';
import SectionNav from '@/features/application/components/SectionNav.vue';
import ApplicationReadOnlyBody from '@/features/staff/components/ApplicationReadOnlyBody.vue';
import StatusHistoryTable from '@/features/staff/components/StatusHistoryTable.vue';
import { formatDateTime } from '@/features/staff/messages';
import type { FormValues } from '@/types/application';
import ReviewRemarkModal from '../components/ReviewRemarkModal.vue';
import { useSupervisorApplicationDetail } from '../composables/useSupervisorApplicationDetail';
import { SUPERVISOR_MESSAGES, SUPERVISOR_STATUS_HINTS } from '../messages';
import '@/features/application/styles/application-form.css';
import '@/features/staff/styles/staff.css';

const route = useRoute();
const router = useRouter();

const applicationId = computed<string | null>(() =>
  typeof route.params.id === 'string' ? route.params.id : null,
);

const {
  schema,
  detail,
  loading,
  error,
  notFound,
  notRegistered,
  actionBusy,
  pendingAction,
  actions,
  load,
  recommend,
  reject,
} = useSupervisorApplicationDetail(applicationId);

const rejectOpen = ref(false);

const sectionCodes = computed(() => schema.value?.sections.map((section) => section.code) ?? []);
const navWrap = ref<HTMLElement | null>(null);
const { active, scrollTo, update: updateSpy } = useSectionScrollSpy(sectionCodes, navWrap);

/** 只读展示数据：可重复小节补 `_key`，标量字段交给 FormField 的 text 模式解析 */
const values = computed<FormValues>(() => {
  const source = detail.value?.values ?? {};
  const output: FormValues = { ...source };
  for (const section of schema.value?.sections ?? []) {
    const key = section.payloadKey;
    if (!section.isRepeatable || !key) continue;
    const rows = Array.isArray(source[key]) ? source[key] : [];
    output[key] = rows.map((raw) => makeRow(section, raw));
  }
  return output;
});

/** 导师下拉在 schema 里只有 id；用详情里的两个志愿导师名做展示文案 */
const valueLabels = computed<Record<string, string>>(() => {
  const labels: Record<string, string> = {};
  if (detail.value?.firstSupervisorName) {
    labels.supervisorFirstId = detail.value.firstSupervisorName;
  }
  if (detail.value?.secondSupervisorName) {
    labels.supervisorSecondId = detail.value.secondSupervisorName;
  }
  return labels;
});

const canRecommend = computed(() => actions.value.includes('recommend'));
const canReject = computed(() => actions.value.includes('reject'));
const hasReviewActions = computed(() => canRecommend.value || canReject.value);

const statusHint = computed(() =>
  detail.value ? SUPERVISOR_STATUS_HINTS[detail.value.status] : '',
);

const statusColor = computed(() =>
  detail.value ? STAFF_STATUS_META[detail.value.status].color : 'default',
);

function goToList(): void {
  void router.push({ name: 'supervisor-applications' });
}

function goBack(): void {
  const state = window.history.state as { back?: string | null } | null;
  if (state?.back) router.back();
  else goToList();
}

function confirmRecommend(): void {
  const item = detail.value;
  if (!item) return;
  Modal.confirm({
    title: SUPERVISOR_MESSAGES.recommend.confirmTitle,
    content: SUPERVISOR_MESSAGES.recommend.confirmContent(item.applicationNumber),
    okText: SUPERVISOR_MESSAGES.action.recommend,
    cancelText: SUPERVISOR_MESSAGES.action.cancel,
    onOk: () => recommend(),
  });
}

async function handleReject(remark: string): Promise<void> {
  const ok = await reject(remark);
  if (ok) rejectOpen.value = false;
}

watch(loading, async (value) => {
  if (value) return;
  await nextTick();
  updateSpy();
});
</script>

<template>
  <div class="staff-detail">
    <button type="button" class="staff-detail__back" @click="goBack">
      {{ SUPERVISOR_MESSAGES.detail.back }}
    </button>

    <div v-if="loading" class="application-state">
      <a-spin size="large" />
      <p class="application-state__text">{{ SUPERVISOR_MESSAGES.loading }}</p>
    </div>

    <a-result
      v-else-if="notRegistered"
      status="warning"
      :title="SUPERVISOR_MESSAGES.notRegistered.title"
      :sub-title="SUPERVISOR_MESSAGES.notRegistered.hint"
    />

    <a-result
      v-else-if="notFound"
      status="404"
      :title="SUPERVISOR_MESSAGES.detail.notFoundTitle"
      :sub-title="SUPERVISOR_MESSAGES.detail.notFoundHint"
    >
      <template #extra>
        <a-button type="primary" @click="goToList">
          {{ SUPERVISOR_MESSAGES.detail.backToList }}
        </a-button>
      </template>
    </a-result>

    <a-result
      v-else-if="error"
      status="error"
      :title="SUPERVISOR_MESSAGES.detail.loadFailedTitle"
      :sub-title="error"
    >
      <template #extra>
        <div class="staff-detail__result-actions">
          <a-button type="primary" @click="load">{{ SUPERVISOR_MESSAGES.detail.tryAgain }}</a-button>
          <a-button @click="goToList">{{ SUPERVISOR_MESSAGES.detail.backToList }}</a-button>
        </div>
      </template>
    </a-result>

    <template v-else-if="detail && schema">
      <header class="staff-detail__header">
        <div class="staff-detail__title-row">
          <h1 class="staff-detail__number">{{ detail.applicationNumber }}</h1>
          <a-tag :color="statusColor">{{ detail.displayStatus }}</a-tag>
        </div>
        <div class="staff-detail__meta">
          <span>{{ detail.nameEn || '—' }}</span>
          <span>{{ detail.email }}</span>
          <span v-if="detail.submittedAt">
            {{ SUPERVISOR_MESSAGES.detail.submitted }}:
            {{ formatDateTime(detail.submittedAt) }}
          </span>
        </div>
      </header>

      <div class="staff-detail__summary">
        <div class="staff-detail__summary-item">
          <span class="staff-detail__summary-label">
            {{ SUPERVISOR_MESSAGES.detail.firstChoice }}
          </span>
          <span class="staff-detail__summary-value">{{ detail.firstProgramCode || '—' }}</span>
        </div>
        <div class="staff-detail__summary-item">
          <span class="staff-detail__summary-label">
            {{ SUPERVISOR_MESSAGES.detail.secondChoice }}
          </span>
          <span class="staff-detail__summary-value">{{ detail.secondProgramCode || '—' }}</span>
        </div>
        <div class="staff-detail__summary-item">
          <span class="staff-detail__summary-label">
            {{ SUPERVISOR_MESSAGES.detail.submitted }}
          </span>
          <span class="staff-detail__summary-value">
            {{ formatDateTime(detail.submittedAt) }}
          </span>
        </div>
        <div class="staff-detail__summary-item">
          <span class="staff-detail__summary-label">
            {{ SUPERVISOR_MESSAGES.detail.lastUpdated }}
          </span>
          <span class="staff-detail__summary-value">{{ formatDateTime(detail.updatedAt) }}</span>
        </div>
      </div>

      <div ref="navWrap" class="section-nav-wrap">
        <SectionNav :sections="schema.sections" :active-code="active" @select="scrollTo" />
      </div>

      <ApplicationReadOnlyBody
        :schema="schema"
        :values="values"
        :value-labels="valueLabels"
      />

      <StatusHistoryTable :timeline="detail.timeline" />

      <div class="staff-detail__actions">
        <span class="staff-detail__hint">{{ statusHint }}</span>
        <div class="staff-detail__action-buttons">
          <template v-if="hasReviewActions">
            <a-button
              v-if="canRecommend"
              type="primary"
              :loading="pendingAction === 'recommend'"
              :disabled="actionBusy && pendingAction !== 'recommend'"
              @click="confirmRecommend"
            >
              {{ SUPERVISOR_MESSAGES.action.recommend }}
            </a-button>
            <a-button
              v-if="canReject"
              danger
              :loading="pendingAction === 'reject'"
              :disabled="actionBusy && pendingAction !== 'reject'"
              @click="rejectOpen = true"
            >
              {{ SUPERVISOR_MESSAGES.action.reject }}
            </a-button>
          </template>
          <span v-else class="staff-detail__readonly">
            {{ SUPERVISOR_MESSAGES.detail.readOnly }}
          </span>
        </div>
      </div>
    </template>

    <ReviewRemarkModal
      v-model:open="rejectOpen"
      :loading="actionBusy"
      :application-number="detail?.applicationNumber ?? null"
      @confirm="handleReject"
    />
  </div>
</template>
