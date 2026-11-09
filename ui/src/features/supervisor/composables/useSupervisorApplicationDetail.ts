import { computed, ref, watch, type Ref } from 'vue';
import { message } from 'ant-design-vue';
import { applicationApi } from '@/api/application';
import { ApiError } from '@/api/problem';
import type { ApplicationDetail, FormSchema } from '@/types/application';
import { SUPERVISOR_MESSAGES } from '../messages';

export type SupervisorDetailAction = 'recommend' | 'reject';

/**
 * 导师端详情：加载 schema + 详情，并执行 Recommend / Reject。
 * 动作成功后重新拉详情，让状态 Tag、粘底按钮与 Status History 即时更新。
 */
export function useSupervisorApplicationDetail(applicationId: Ref<string | null>) {
  const schema = ref<FormSchema | null>(null);
  const detail = ref<ApplicationDetail | null>(null);
  const loading = ref(true);
  const error = ref<string | null>(null);
  const notFound = ref(false);
  const notRegistered = ref(false);
  const actionBusy = ref(false);
  const pendingAction = ref<SupervisorDetailAction | null>(null);

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
    // 动作成功后的刷新不整页转圈；只有首次加载 / 切换申请才显示 loading
    loading.value = detail.value === null;
    error.value = null;
    notFound.value = false;
    notRegistered.value = false;
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
      if (loadError instanceof ApiError && loadError.code === 'supervisor_not_registered') {
        notRegistered.value = true;
      } else if (
        loadError instanceof ApiError &&
        (loadError.status === 404 || loadError.status === 400)
      ) {
        // 未分配 / 未进入导师审核都按「找不到」处理，不区分原因
        notFound.value = true;
      } else {
        error.value =
          loadError instanceof ApiError
            ? loadError.message
            : SUPERVISOR_MESSAGES.detail.loadFailedTitle;
      }
    } finally {
      if (seq === loadSeq) loading.value = false;
    }
  }

  async function runAction(
    kind: SupervisorDetailAction,
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
        message.warning(SUPERVISOR_MESSAGES.stale);
        await load();
      } else {
        message.error(
          actionError instanceof ApiError
            ? actionError.message
            : SUPERVISOR_MESSAGES.actionFailed,
        );
      }
      return false;
    } finally {
      actionBusy.value = false;
      pendingAction.value = null;
    }
  }

  const recommend = (): Promise<boolean> =>
    runAction(
      'recommend',
      (id) => applicationApi.recommend(id),
      SUPERVISOR_MESSAGES.recommend.success,
    );

  const reject = (remark: string): Promise<boolean> =>
    runAction(
      'reject',
      (id) => applicationApi.reject(id, remark),
      SUPERVISOR_MESSAGES.reject.success,
    );

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
    notRegistered,
    actionBusy,
    pendingAction,
    actions,
    load,
    recommend,
    reject,
  };
}
