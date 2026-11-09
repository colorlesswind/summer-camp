<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter, type RouteLocationRaw } from 'vue-router';
import { Modal, message } from 'ant-design-vue';
import { applicationApi } from '@/api/application';
import { ApiError } from '@/api/problem';
import { STUDENT_STATUS_META, type StatusTone } from '@/constants/application';
import type { ApplicationDetail, ApplicationStatus } from '@/types/application';
import StudentSidebar from '../components/StudentSidebar.vue';
import { STATUS_PAGE_MESSAGES, formatDateTimeSeconds } from '../messages';
import '../styles/application-shell.css';

/**
 * 学生端 Application Status（界面参考 附件/application-status.png）。
 *
 * 表格只渲染本人申请（0 或 1 行）：
 *   - 还没有申请时给一行 Draft 占位，对应附件里「还没开始填表」的那一行；
 *   - 附件里 6 个未实现状态（Attendance / Offer Lapsed / Reject Letter Sent / Withdrawn）
 *     不渲染假数据行，只在前端 constants 里登记为 reserved（灰色文案）。
 *   - Due Date 列按本次确认保留，但不承载任何业务逻辑，固定展示 `-`。
 */

const router = useRouter();

const loading = ref(true);
const error = ref<string | null>(null);
const application = ref<ApplicationDetail | null>(null);
const respondOpen = ref(false);
const responding = ref(false);

type RowAction = 'application-form' | 'update' | 'respond';

interface StatusRow {
  key: string;
  applicationNumber: string;
  name: string;
  statusLabel: string;
  tone: StatusTone;
  returnReason: string | null;
  dueDate: string;
  action: RowAction | null;
  time: string;
  /** 当前状态行：加粗，且只有这一行带 Action 按钮 */
  isCurrent: boolean;
}

interface StatusHistoryEntry {
  status: ApplicationStatus;
  at: string;
  remark: string | null;
}

/** 申请状态 -> 表格 Action 列该给哪个按钮 */
function actionFor(status: ApplicationStatus): RowAction | null {
  if (status === 'Draft') return 'application-form';
  if (status === 'Returned') return 'update';
  if (status === 'OfferSent') return 'respond';
  return null;
}

/**
 * 把状态流转日志整理成表格行（含历史状态）：
 *   - 连续重复的内部状态只保留第一次（反复 Save 不会刷出一堆 Draft）；
 *   - 学生端多个内部状态折叠成同一文案（Under Review），连续同文案也合并成一段，
 *     时间取「进入该文案」的那一次，避免出现两行一模一样的 Under Review；
 *   - 最新状态排最前，历史状态依次向后；
 *   - 若日志里没有当前状态（并发或其他异常），补一条，保证当前行始终在第一位。
 */
function buildHistory(item: ApplicationDetail): StatusHistoryEntry[] {
  const entries: StatusHistoryEntry[] = [];

  for (const log of item.timeline) {
    const status = log.toStatus as ApplicationStatus;
    const previous = entries[entries.length - 1];
    if (previous && previous.status === status) continue;
    entries.push({ status, at: log.at, remark: log.remark });
  }

  const merged: StatusHistoryEntry[] = [];
  for (const entry of entries) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      STUDENT_STATUS_META[previous.status].label === STUDENT_STATUS_META[entry.status].label
    ) {
      continue;
    }
    merged.push({ ...entry });
  }

  const lastLog = item.timeline[item.timeline.length - 1];
  if (lastLog && lastLog.toStatus === item.status && merged.length > 0) {
    // 最后一段可能合并掉了当前内部状态（如 Pending → PendingSupervisorReview），以真实状态为准
    merged[merged.length - 1].status = item.status;
  } else {
    merged.push({ status: item.status, at: item.updatedAt, remark: item.returnReason });
  }

  return merged.reverse();
}

const rows = computed<StatusRow[]>(() => {
  const item = application.value;

  if (!item) {
    return [
      {
        key: 'draft',
        applicationNumber: '-',
        name: '-',
        statusLabel: STUDENT_STATUS_META.Draft.label,
        tone: STUDENT_STATUS_META.Draft.tone,
        returnReason: null,
        dueDate: '-',
        action: 'application-form',
        time: '-',
        isCurrent: true,
      },
    ];
  }

  // 附件里 Name in English 是全大写（ZHANG, SAN）
  const name = item.nameEn ? item.nameEn.toUpperCase() : '-';

  return buildHistory(item).map((entry, index) => {
    const isCurrent = index === 0;
    const meta = STUDENT_STATUS_META[entry.status];

    return {
      key: `${entry.status}-${entry.at}-${index}`,
      applicationNumber: item.applicationNumber,
      name,
      statusLabel: isCurrent ? item.displayStatus || meta.label : meta.label,
      tone: meta.tone,
      // 当前行用最近一次退回原因；历史行用它自己那次 Return 的备注
      returnReason:
        entry.status === 'Returned' ? (isCurrent ? item.returnReason : entry.remark) : null,
      dueDate: '-',
      action: isCurrent ? actionFor(item.status) : null,
      time: formatDateTimeSeconds(entry.at),
      isCurrent,
    };
  });
});

/** 侧边栏 Application Form 的目标：有申请进详情，没申请进新建 */
const formTarget = computed<RouteLocationRaw>(() =>
  application.value
    ? { name: 'student-application-detail', params: { id: application.value.id } }
    : { name: 'student-application-new' },
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = null;
  try {
    application.value = await applicationApi.mine();
  } catch (loadError) {
    error.value =
      loadError instanceof ApiError ? loadError.message : 'Unable to load your application.';
  } finally {
    loading.value = false;
  }
}

function openForm(): void {
  void router.push(formTarget.value);
}

function openRespond(): void {
  respondOpen.value = true;
}

function confirmAccept(): void {
  Modal.confirm({
    title: STATUS_PAGE_MESSAGES.acceptConfirmTitle,
    content: STATUS_PAGE_MESSAGES.acceptConfirmContent,
    okText: STATUS_PAGE_MESSAGES.acceptOffer,
    cancelText: STATUS_PAGE_MESSAGES.cancel,
    onOk: () => respond('accept'),
  });
}

function confirmDecline(): void {
  Modal.confirm({
    title: STATUS_PAGE_MESSAGES.declineConfirmTitle,
    content: STATUS_PAGE_MESSAGES.declineConfirmContent,
    okText: STATUS_PAGE_MESSAGES.declineOffer,
    okType: 'danger',
    cancelText: STATUS_PAGE_MESSAGES.cancel,
    onOk: () => respond('decline'),
  });
}

async function respond(kind: 'accept' | 'decline'): Promise<void> {
  const item = application.value;
  if (!item) return;

  responding.value = true;
  try {
    const updated =
      kind === 'accept'
        ? await applicationApi.acceptOffer(item.id)
        : await applicationApi.declineOffer(item.id);
    application.value = updated;
    respondOpen.value = false;
    message.success(
      kind === 'accept'
        ? STATUS_PAGE_MESSAGES.respondAccepted
        : STATUS_PAGE_MESSAGES.respondDeclined,
    );
  } catch (respondError) {
    const failure = respondError instanceof ApiError ? respondError : null;
    message.error(failure?.message ?? STATUS_PAGE_MESSAGES.respondFailed);
    // 409 说明状态已被其他端改过，重新拉一次，避免页面停在过期状态
    if (failure?.status === 409) await load();
  } finally {
    responding.value = false;
  }
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="application-page">
    <StudentSidebar active="status" :form-target="formTarget" />

    <div class="application-main">
      <p class="status-intro">{{ STATUS_PAGE_MESSAGES.intro }}</p>
      <h1 class="status-title">{{ STATUS_PAGE_MESSAGES.title }}</h1>

      <div v-if="loading" class="application-state">
        <a-spin size="large" />
        <p class="application-state__text">{{ STATUS_PAGE_MESSAGES.loading }}</p>
      </div>

      <a-result
        v-else-if="error"
        status="error"
        :title="STATUS_PAGE_MESSAGES.loadFailedTitle"
        :sub-title="error"
      >
        <template #extra>
          <a-button type="primary" @click="load">{{ STATUS_PAGE_MESSAGES.tryAgain }}</a-button>
        </template>
      </a-result>

      <div v-else class="status-table-wrap">
        <table class="status-table">
          <thead>
            <tr>
              <th>{{ STATUS_PAGE_MESSAGES.columns.applicationNumber }}</th>
              <th>{{ STATUS_PAGE_MESSAGES.columns.name }}</th>
              <th>{{ STATUS_PAGE_MESSAGES.columns.status }}</th>
              <th>{{ STATUS_PAGE_MESSAGES.columns.returnReason }}</th>
              <th>{{ STATUS_PAGE_MESSAGES.columns.dueDate }}</th>
              <th>{{ STATUS_PAGE_MESSAGES.columns.action }}</th>
              <th>{{ STATUS_PAGE_MESSAGES.columns.time }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, index) in rows" :key="row.key">
              <td v-if="index === 0" :rowspan="rows.length">{{ row.applicationNumber }}</td>
              <td v-if="index === 0" :rowspan="rows.length">{{ row.name }}</td>
              <td>
                <span
                  class="status-text"
                  :class="[`status-text--${row.tone}`, { 'status-text--current': row.isCurrent }]"
                >
                  {{ row.statusLabel }}
                </span>
              </td>
              <td>
                <template v-if="row.returnReason">
                  <p class="status-reason__label">Return Reason:</p>
                  <p class="status-reason__text">{{ row.returnReason }}</p>
                </template>
                <template v-else>-</template>
              </td>
              <td>{{ row.dueDate }}</td>
              <td>
                <a-button
                  v-if="row.action === 'application-form'"
                  type="primary"
                  @click="openForm"
                >
                  {{ STATUS_PAGE_MESSAGES.actionApplicationForm }}
                </a-button>
                <a-button v-else-if="row.action === 'update'" type="primary" @click="openForm">
                  {{ STATUS_PAGE_MESSAGES.actionUpdate }}
                </a-button>
                <a-button v-else-if="row.action === 'respond'" type="primary" @click="openRespond">
                  {{ STATUS_PAGE_MESSAGES.actionRespond }}
                </a-button>
                <template v-else>-</template>
              </td>
              <td>{{ row.time }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <a-modal
        v-model:open="respondOpen"
        :title="STATUS_PAGE_MESSAGES.respondTitle"
        :footer="null"
        :width="420"
        :mask-closable="!responding"
      >
        <p class="status-respond__hint">{{ STATUS_PAGE_MESSAGES.respondHint }}</p>
        <div class="status-respond__actions">
          <a-button type="primary" :loading="responding" @click="confirmAccept">
            {{ STATUS_PAGE_MESSAGES.acceptOffer }}
          </a-button>
          <a-button danger :loading="responding" @click="confirmDecline">
            {{ STATUS_PAGE_MESSAGES.declineOffer }}
          </a-button>
        </div>
      </a-modal>
    </div>
  </div>
</template>

<style scoped>
.status-intro {
  margin: 18px 0 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text);
}

.status-title {
  margin: 16px 0 12px;
  font-size: 16px;
  font-weight: 600;
  color: var(--color-text);
}

.status-table-wrap {
  overflow-x: auto;
  background: #ffffff;
  border: 1px solid var(--color-divider);
}

.status-table {
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
  font-size: 13px;
}

.status-table th,
.status-table td {
  padding: 10px 12px;
  text-align: left;
  vertical-align: top;
  border-right: 1px solid var(--color-divider);
  border-bottom: 1px solid var(--color-divider);
}

.status-table th {
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
  background: #fafafa;
}

.status-table th:last-child,
.status-table td:last-child {
  border-right: 0;
}

.status-table tbody tr:last-child td {
  border-bottom: 0;
}

.status-text {
  color: var(--color-text);
}

.status-text--default {
  color: var(--color-text);
}

/* 当前状态：加粗，和下面几行历史状态区分开 */
.status-text--current {
  font-weight: 600;
}

.status-text--success {
  color: #389e0d;
}

/* 未实现 / 已失效的状态统一置灰（附件里的灰色文案） */
.status-text--muted {
  color: #8c8c8c;
}

.status-reason__label {
  margin: 0 0 4px;
  color: var(--color-text);
}

.status-reason__text {
  margin: 0;
  color: var(--color-text);
  white-space: pre-wrap;
}

.status-respond__hint {
  margin: 0 0 18px;
  color: var(--color-text-secondary);
}

.status-respond__actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
