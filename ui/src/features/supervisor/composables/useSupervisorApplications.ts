import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { message } from 'ant-design-vue';
import { applicationApi } from '@/api/application';
import { ApiError } from '@/api/problem';
import { SUPERVISOR_VISIBLE_STATUSES } from '@/constants/application';
import type { ApplicationStatus, ApplicationSummary } from '@/types/application';
import { SUPERVISOR_MESSAGES } from '../messages';

const PAGE_SIZES = [20, 50, 100] as const;
const VISIBLE_SET = new Set<string>(SUPERVISOR_VISIBLE_STATUSES);

export type SupervisorReviewAction = 'recommend' | 'reject';

export interface PendingReview {
  id: string;
  action: SupervisorReviewAction;
}

/** 列表行内是否应该有动作：只有待导师审核可操作，其余只读 */
export const canReview = (row: ApplicationSummary): boolean =>
  row.status === 'PendingSupervisorReview';

const readStatus = (value: unknown): ApplicationStatus | null =>
  typeof value === 'string' && VISIBLE_SET.has(value) ? (value as ApplicationStatus) : null;

const readPositiveInt = (value: unknown, fallback: number): number => {
  const parsed = typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

interface QueryPatch {
  status?: ApplicationStatus | null;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/**
 * 导师端列表的单一状态源。
 *
 * - 服务端已按「当前导师 + 可见状态」收窄，前端不再做数据过滤；
 * - 筛选 / 页码写回 URL（router.replace），刷新、返回、分享都能还原；
 * - 关键词 300ms 防抖；
 * - 导师账号未绑定档案时（403 supervisor_not_registered）走专用提示，而不是通用报错。
 */
export function useSupervisorApplications() {
  const route = useRoute();
  const router = useRouter();

  const items = ref<ApplicationSummary[]>([]);
  const total = ref(0);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const notRegistered = ref(false);
  const actionBusy = ref(false);
  const pendingReview = ref<PendingReview | null>(null);
  const keyword = ref(typeof route.query.keyword === 'string' ? route.query.keyword : '');

  const status = computed<ApplicationStatus | null>(() => readStatus(route.query.status));
  const page = computed<number>(() => readPositiveInt(route.query.page, 1));
  const pageSize = computed<number>(() => {
    const size = readPositiveInt(route.query.pageSize, 20);
    return (PAGE_SIZES as readonly number[]).includes(size) ? size : 20;
  });

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
    notRegistered.value = false;
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

      // 当前页被操作空了，退到最后一页
      const lastPage = Math.max(1, Math.ceil(result.total / pageSize.value));
      if (result.items.length === 0 && page.value > lastPage) {
        applyQuery({ page: lastPage });
        return;
      }

      items.value = result.items;
      total.value = result.total;
    } catch (loadError) {
      if (seq !== loadSeq) return;
      items.value = [];
      total.value = 0;
      if (loadError instanceof ApiError && loadError.code === 'supervisor_not_registered') {
        notRegistered.value = true;
        error.value = null;
      } else {
        error.value =
          loadError instanceof ApiError ? loadError.message : SUPERVISOR_MESSAGES.loadFailed;
      }
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
      message.warning(SUPERVISOR_MESSAGES.stale);
      void load();
      return;
    }
    message.error(
      actionError instanceof ApiError
        ? actionError.message
        : SUPERVISOR_MESSAGES.actionFailed,
    );
  }

  async function runReview(
    row: ApplicationSummary,
    kind: SupervisorReviewAction,
    action: () => Promise<unknown>,
    successText: string,
  ): Promise<boolean> {
    if (actionBusy.value) return false;
    actionBusy.value = true;
    pendingReview.value = { id: row.id, action: kind };
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
      pendingReview.value = null;
    }
  }

  function recommend(row: ApplicationSummary): Promise<boolean> {
    return runReview(
      row,
      'recommend',
      () => applicationApi.recommend(row.id),
      SUPERVISOR_MESSAGES.recommend.success,
    );
  }

  function reject(row: ApplicationSummary, remark: string): Promise<boolean> {
    return runReview(
      row,
      'reject',
      () => applicationApi.reject(row.id, remark),
      SUPERVISOR_MESSAGES.reject.success,
    );
  }

  // URL 是筛选条件的唯一来源：浏览器前进/后退、刷新都能复现
  watch(
    () => route.query,
    () => {
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
    notRegistered,
    actionBusy,
    pendingReview,
    keyword,
    status,
    page,
    pageSize,
    reload: load,
    setStatus,
    setPage,
    setPageSize,
    reset,
    recommend,
    reject,
  };
}
