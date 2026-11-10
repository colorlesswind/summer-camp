import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { applicationApi } from '@/api/application';
import { ApiError } from '@/api/problem';
import { APPLICATION_STATUSES } from '@/types/application';
import type { ApplicationStatus, ApplicationSummary, BatchOfferResult } from '@/types/application';
import { ADMIN_MESSAGES } from '../messages';

const PAGE_SIZES = [20, 50, 100] as const;
const STATUS_SET = new Set<string>(APPLICATION_STATUSES);

const readStatus = (value: unknown): ApplicationStatus | null =>
  typeof value === 'string' && STATUS_SET.has(value) ? (value as ApplicationStatus) : null;

const readPositiveInt = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/** 只有 Supervisor Recommended 的申请可以接收 Offer（批量与单条一致） */
export const canSendOffer = (row: ApplicationSummary): boolean =>
  row.status === 'SupervisorRecommended';

interface QueryPatch {
  status?: ApplicationStatus | null;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 管理端列表的单一状态源：筛选条件以 URL query 为准，数据变化即重新请求。
 *
 * - 筛选 / 页码 / 每页条数写回 URL（router.replace），刷新、返回、分享都能还原；
 * - 关键词 300ms 防抖；
 * - 换筛选或换页时清空批量选择，避免「选了看不见的行」。
 */
export function useAdminApplications() {
  const route = useRoute();
  const router = useRouter();

  const items = ref<ApplicationSummary[]>([]);
  const total = ref(0);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const actionBusy = ref(false);
  const selectedIds = ref<string[]>([]);
  const keyword = ref(typeof route.query.keyword === 'string' ? route.query.keyword : '');

  const status = computed<ApplicationStatus | null>(() => readStatus(route.query.status));
  const page = computed<number>(() => readPositiveInt(route.query.page, 1));
  const pageSize = computed<number>(() => {
    const size = readPositiveInt(route.query.pageSize, 20);
    return (PAGE_SIZES as readonly number[]).includes(size) ? size : 20;
  });
  const selectedCount = computed(() => selectedIds.value.length);

  let keywordTimer: ReturnType<typeof setTimeout> | null = null;
  let loadSeq = 0;

  function applyQuery(patch: QueryPatch): void {
    const nextStatus = patch.status !== undefined ? patch.status : status.value;
    const currentKeyword = typeof route.query.keyword === 'string' ? route.query.keyword : '';
    const nextKeyword = (patch.keyword !== undefined ? patch.keyword : currentKeyword).trim();
    const nextPage = patch.page ?? page.value;
    const nextPageSize = patch.pageSize ?? pageSize.value;

    const query: Record<string, string> = {};
    if (nextStatus) query.status = nextStatus;
    if (nextKeyword) query.keyword = nextKeyword;
    if (nextPage > 1) query.page = String(nextPage);
    if (nextPageSize !== 20) query.pageSize = String(nextPageSize);

    void router.replace({ query });
  }

  async function load(): Promise<void> {
    const seq = ++loadSeq;
    loading.value = true;
    error.value = null;
    // 请求以 URL 为准（输入框可能还有未防抖提交的内容）
    const queryKeyword = typeof route.query.keyword === 'string' ? route.query.keyword : '';
    try {
      const result = await applicationApi.list({
        status: status.value ?? undefined,
        keyword: queryKeyword.trim() || undefined,
        page: page.value,
        pageSize: pageSize.value,
      });
      if (seq !== loadSeq) return;

      // 当前页被操作空了（例如批量发完 Offer），退到最后一页
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize.value));
      if (result.items.length === 0 && page.value > lastPage) {
        applyQuery({ page: lastPage });
        return;
      }

      items.value = result.items;
      total.value = result.total;
      selectedIds.value = [];
    } catch (loadError) {
      if (seq !== loadSeq) return;
      items.value = [];
      total.value = 0;
      error.value =
        loadError instanceof ApiError ? loadError.message : ADMIN_MESSAGES.loadFailed;
    } finally {
      if (seq === loadSeq) loading.value = false;
    }
  }

  function setStatus(next: ApplicationStatus | null): void {
    applyQuery({ status: next, page: 1 });
  }

  function setPage(next: number): void {
    applyQuery({ page: next });
  }

  function setPageSize(next: number): void {
    applyQuery({ pageSize: next, page: 1 });
  }

  function reset(): void {
    if (keywordTimer) {
      clearTimeout(keywordTimer);
      keywordTimer = null;
    }
    keyword.value = '';
    applyQuery({ status: null, keyword: '', page: 1 });
  }

  function handleActionError(actionError: unknown): void {
    if (actionError instanceof ApiError && actionError.status === 409) {
      message.warning(ADMIN_MESSAGES.stale);
      void load();
      return;
    }
    message.error(
      actionError instanceof ApiError ? actionError.message : ADMIN_MESSAGES.actionFailed,
    );
  }

  async function runSingle(action: () => Promise<unknown>, successText: string): Promise<boolean> {
    if (actionBusy.value) return false;
    actionBusy.value = true;
    try {
      await action();
      message.success(successText);
      await load();
      return true;
    } catch (actionError) {
      handleActionError(actionError);
      return false;
    } finally {
      actionBusy.value = false;
    }
  }

  function approve(id: string): Promise<boolean> {
    return runSingle(() => applicationApi.approve(id), ADMIN_MESSAGES.approve.success);
  }

  function returnToStudent(id: string, reason: string): Promise<boolean> {
    return runSingle(
      () => applicationApi.returnToStudent(id, reason),
      ADMIN_MESSAGES.return.success,
    );
  }

  function sendOffer(id: string): Promise<boolean> {
    return runSingle(() => applicationApi.sendOffer(id), ADMIN_MESSAGES.offer.success);
  }

  async function sendOfferBatch(ids: readonly string[]): Promise<BatchOfferResult | null> {
    if (ids.length === 0 || actionBusy.value) return null;
    actionBusy.value = true;
    try {
      const result = await applicationApi.sendOfferBatch(ids);
      selectedIds.value = [];
      await load();
      return result;
    } catch (actionError) {
      handleActionError(actionError);
      return null;
    } finally {
      actionBusy.value = false;
    }
  }

  // URL 是筛选条件的唯一来源：浏览器前进/后退、刷新都能复现
  watch(
    () => route.query,
    () => {
      selectedIds.value = [];
      void load();
    },
    { immediate: true },
  );

  // URL 里的关键词被外部改写（前进/后退）时同步回输入框
  watch(
    () => route.query.keyword,
    (value) => {
      const text = typeof value === 'string' ? value : '';
      if (text !== keyword.value) keyword.value = text;
    },
  );

  watch(keyword, (value) => {
    if (keywordTimer) clearTimeout(keywordTimer);
    keywordTimer = setTimeout(() => {
      keywordTimer = null;
      applyQuery({ keyword: value, page: 1 });
    }, 300);
  });

  onBeforeUnmount(() => {
    if (keywordTimer) clearTimeout(keywordTimer);
  });

  return {
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
    reload: load,
    setStatus,
    setPage,
    setPageSize,
    reset,
    approve,
    returnToStudent,
    sendOffer,
    sendOfferBatch,
  };
}
