import { computed, ref, watch, type Ref } from 'vue';
import { message } from 'ant-design-vue';
import { applicationApi } from '@/api/application';
import { ApiError } from '@/api/problem';
import type { ApplicationDetail, FormSchema } from '@/types/application';
import { ADMIN_MESSAGES } from '../messages';

export type AdminReviewAction = 'approve' | 'return' | 'send_offer';

/**
 * 管理端详情：加载 schema + 详情，并执行 Approve / Return / Send Offer。
 * 动作成功后重新拉详情，让状态 Tag 与粘底按钮即时更新。
 */
export function useAdminApplicationDetail(applicationId: Ref<string | null>) {
  const schema = ref<FormSchema | null>(null);
  const detail = ref<ApplicationDetail | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const notFound = ref(false);
  const actionBusy = ref(false);
  const pendingAction = ref<AdminReviewAction | null>(null);

  const actions = computed(() => detail.value?.actions ?? []);

  let loadSeq = 0;

  async function load(): Promise<void> {
    const id = applicationId.value;
    if (!id) {
      loading.value = false;
      notFound.value = true;
      return;
    }

    const seq = ++loadSeq;
    // 动作成功后的刷新不整页转圈，避免详情内容闪烁；只有首次加载 / 切换申请才显示 loading
    loading.value = detail.value === null;
    error.value = null;
    notFound.value = false;
    try {
      const [loadedSchema, loadedDetail] = await Promise.all([
        schema.value ? Promise.resolve(schema.value) : applicationApi.schema(),
        applicationApi.detail(id),
      ]);
      if (seq !== loadSeq) return;
      schema.value = loadedSchema;
      detail.value = loadedDetail;
    } catch (loadError) {
      if (seq !== loadSeq) return;
      detail.value = null;
      // 非法 ID（400）与不存在（404）都按「找不到」处理，避免把服务端措辞暴露给用户
      if (loadError instanceof ApiError && (loadError.status === 404 || loadError.status === 400)) {
        notFound.value = true;
      } else {
        error.value =
          loadError instanceof ApiError
            ? loadError.message
            : ADMIN_MESSAGES.detail.loadFailedTitle;
      }
    } finally {
      if (seq === loadSeq) loading.value = false;
    }
  }

  async function runAction(
    kind: AdminReviewAction,
    action: (id: string) => Promise<ApplicationDetail>,
    successText: string,
  ): Promise<boolean> {
    const id = applicationId.value;
    if (!id || actionBusy.value) return false;

    actionBusy.value = true;
    pendingAction.value = kind;
    try {
      await action(id);
      message.success(successText);
      await load();
      return true;
    } catch (actionError) {
      if (actionError instanceof ApiError && actionError.status === 409) {
        message.warning(ADMIN_MESSAGES.stale);
        await load();
      } else {
        message.error(
          actionError instanceof ApiError ? actionError.message : ADMIN_MESSAGES.actionFailed,
        );
      }
      return false;
    } finally {
      actionBusy.value = false;
      pendingAction.value = null;
    }
  }

  const approve = (): Promise<boolean> =>
    runAction('approve', (id) => applicationApi.approve(id), ADMIN_MESSAGES.approve.success);

  const returnToStudent = (reason: string): Promise<boolean> =>
    runAction(
      'return',
      (id) => applicationApi.returnToStudent(id, reason),
      ADMIN_MESSAGES.return.success,
    );

  const sendOffer = (): Promise<boolean> =>
    runAction('send_offer', (id) => applicationApi.sendOffer(id), ADMIN_MESSAGES.offer.success);

  watch(
    applicationId,
    () => {
      // 切换到另一份申请时先清空，避免短暂显示上一份的内容
      detail.value = null;
      void load();
    },
    { immediate: true },
  );

  return {
    schema,
    detail,
    loading,
    error,
    notFound,
    actionBusy,
    pendingAction,
    actions,
    load,
    approve,
    returnToStudent,
    sendOffer,
  };
}
