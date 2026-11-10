// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import {
  createMemoryHistory,
  createRouter,
  type Router,
} from 'vue-router';
import { ApiError } from '@/api/problem';
import {
  canSendOffer,
  useAdminApplications,
} from '@/features/admin/composables/useAdminApplications';
import { useAdminApplicationDetail } from '@/features/admin/composables/useAdminApplicationDetail';
import {
  canReview,
  useSupervisorApplications,
} from '@/features/supervisor/composables/useSupervisorApplications';
import { useSupervisorApplicationDetail } from '@/features/supervisor/composables/useSupervisorApplicationDetail';
import { ADMIN_MESSAGES } from '@/features/admin/messages';
import { SUPERVISOR_MESSAGES } from '@/features/supervisor/messages';
import type { ApplicationDetail, ApplicationListResult } from '@/types/application';
import {
  makeDetail,
  makeSchema,
  makeSummary,
} from '../../../helpers/fixtures';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  schema: vi.fn(),
  detail: vi.fn(),
  create: vi.fn(),
  save: vi.fn(),
  submit: vi.fn(),
  resubmit: vi.fn(),
  approve: vi.fn(),
  returnToStudent: vi.fn(),
  sendOffer: vi.fn(),
  sendOfferBatch: vi.fn(),
  recommend: vi.fn(),
  reject: vi.fn(),
  searchSupervisors: vi.fn(),
}));

const messageMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));

vi.mock('@/api/application', () => ({ applicationApi: api }));
vi.mock('ant-design-vue', () => ({ message: messageMock }));

const Page = defineComponent({ render: () => h('div') });

function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/admin/applications', name: 'admin-applications', component: Page },
      { path: '/supervisor/applications', name: 'supervisor-applications', component: Page },
    ],
  });
}

function listResult(overrides: Partial<ApplicationListResult> = {}): ApplicationListResult {
  return { items: [makeSummary()], total: 1, page: 1, pageSize: 20, ...overrides };
}

async function mountAdmin(query = '') {
  const router = createTestRouter();
  await router.push(`/admin/applications${query}`);
  await router.isReady();

  let form!: ReturnType<typeof useAdminApplications>;
  const wrapper = mount(
    defineComponent({
      setup() {
        form = useAdminApplications();
        return () => h('div');
      },
    }),
    { global: { plugins: [router] } },
  );
  await flushPromises();
  return { router, form, wrapper };
}

async function mountSupervisor(query = '') {
  const router = createTestRouter();
  await router.push(`/supervisor/applications${query}`);
  await router.isReady();

  let form!: ReturnType<typeof useSupervisorApplications>;
  const wrapper = mount(
    defineComponent({
      setup() {
        form = useSupervisorApplications();
        return () => h('div');
      },
    }),
    { global: { plugins: [router] } },
  );
  await flushPromises();
  return { router, form, wrapper };
}

const wrappers: Array<{ unmount: () => void }> = [];

function track<T extends { wrapper: { unmount: () => void } }>(mounted: T): T {
  wrappers.push(mounted.wrapper);
  return mounted;
}

describe('useAdminApplications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockResolvedValue(listResult());
  });

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  });

  it('uses the URL query as the single source of filters', async () => {
    const { form } = track(
      await mountAdmin('?status=Returned&keyword=alice&page=2&pageSize=50'),
    );

    expect(api.list).toHaveBeenCalledWith({
      status: 'Returned',
      keyword: 'alice',
      page: 2,
      pageSize: 50,
    });
    expect(form.items.value).toHaveLength(1);
    expect(form.total.value).toBe(1);
    expect(form.loading.value).toBe(false);
    expect(form.status.value).toBe('Returned');
    expect(form.page.value).toBe(2);
    expect(form.pageSize.value).toBe(50);
  });

  it('ignores unknown statuses, non-positive pages and unsupported page sizes', async () => {
    const { form } = track(
      await mountAdmin('?status=NotAStatus&page=0&pageSize=999'),
    );

    expect(form.status.value).toBeNull();
    expect(form.page.value).toBe(1);
    expect(form.pageSize.value).toBe(20);
  });

  it('writes the status filter back to the URL and resets to page 1', async () => {
    const { router, form } = track(await mountAdmin('?page=3'));

    form.setStatus('Draft');
    await flushPromises();

    expect(router.currentRoute.value.query).toEqual({ status: 'Draft' });
  });

  it('keeps the other filters when paging', async () => {
    const { router, form } = track(await mountAdmin('?status=OfferSent'));

    form.setPage(4);
    await flushPromises();

    expect(router.currentRoute.value.query).toEqual({ status: 'OfferSent', page: '4' });
  });

  it('changes the page size and goes back to page 1', async () => {
    const { router, form } = track(await mountAdmin('?status=Draft&page=3'));

    form.setPageSize(100);
    await flushPromises();

    expect(router.currentRoute.value.query).toEqual({ status: 'Draft', pageSize: '100' });
  });

  it('debounces the keyword by 300ms before touching the URL', async () => {
    const { router, form } = track(await mountAdmin());
    vi.useFakeTimers();

    form.keyword.value = '  Bob  ';
    // 让 keyword 的 watch 先跑一次，它才会真正挂上 300ms 的防抖定时器
    await nextTick();
    vi.advanceTimersByTime(299);
    expect(router.currentRoute.value.query).toEqual({});
    expect(api.list).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    vi.useRealTimers();
    await flushPromises();

    expect(router.currentRoute.value.query).toEqual({ keyword: 'Bob' });
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: 'Bob', page: 1 }),
    );
  });

  it('reset() clears the keyword and all filters', async () => {
    const { router, form } = track(
      await mountAdmin('?status=Draft&keyword=alice&page=2'),
    );

    form.reset();
    await flushPromises();

    expect(form.keyword.value).toBe('');
    expect(router.currentRoute.value.query).toEqual({});
    expect(api.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: undefined, keyword: undefined, page: 1 }),
    );
  });

  it('shows the translated message of an ApiError and clears the rows', async () => {
    api.list.mockRejectedValue(new ApiError('forbidden', 403, 'You do not have permission.'));
    const { form } = track(await mountAdmin());

    expect(form.error.value).toBe('You do not have permission.');
    expect(form.items.value).toEqual([]);
    expect(form.total.value).toBe(0);
    expect(form.loading.value).toBe(false);
  });

  it('falls back to the generic load error for unexpected failures', async () => {
    api.list.mockRejectedValue(new Error('boom'));
    const { form } = track(await mountAdmin());

    expect(form.error.value).toBe(ADMIN_MESSAGES.loadFailed);
  });

  it('steps back to the last page when the current page became empty', async () => {
    api.list.mockResolvedValue(listResult({ items: [], total: 1, page: 3 }));
    const { router } = track(await mountAdmin('?page=3'));
    await flushPromises();

    expect(router.currentRoute.value.query).not.toHaveProperty('page');
  });

  it('clears the batch selection whenever the query changes', async () => {
    const { form } = track(await mountAdmin());
    form.selectedIds.value = ['app-1'];
    expect(form.selectedCount.value).toBe(1);

    form.setStatus('Returned');
    await flushPromises();

    expect(form.selectedIds.value).toEqual([]);
  });

  it('approves an application, notifies and reloads', async () => {
    api.approve.mockResolvedValue(makeDetail());
    const { form } = track(await mountAdmin());

    await expect(form.approve('app-1')).resolves.toBe(true);

    expect(api.approve).toHaveBeenCalledWith('app-1');
    expect(messageMock.success).toHaveBeenCalledWith(ADMIN_MESSAGES.approve.success);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(form.actionBusy.value).toBe(false);
  });

  it('warns about a stale status and reloads on 409', async () => {
    api.sendOffer.mockRejectedValue(new ApiError('conflict', 409, 'Conflict'));
    const { form } = track(await mountAdmin());

    await expect(form.sendOffer('app-1')).resolves.toBe(false);

    expect(messageMock.warning).toHaveBeenCalledWith(ADMIN_MESSAGES.stale);
    expect(messageMock.error).not.toHaveBeenCalled();
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('reports a normal action failure without reloading', async () => {
    api.returnToStudent.mockRejectedValue(new ApiError('invalid_transition', 400, 'Not allowed'));
    const { form } = track(await mountAdmin());

    await expect(form.returnToStudent('app-1', 'reason')).resolves.toBe(false);

    expect(messageMock.error).toHaveBeenCalledWith('Not allowed');
    expect(api.list).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an empty batch selection', async () => {
    const { form } = track(await mountAdmin());

    await expect(form.sendOfferBatch([])).resolves.toBeNull();
    expect(api.sendOfferBatch).not.toHaveBeenCalled();
  });

  it('returns the batch result and clears the selection', async () => {
    const result = { total: 2, successCount: 1, failureCount: 1, failures: [] };
    api.sendOfferBatch.mockResolvedValue(result);
    const { form } = track(await mountAdmin());
    form.selectedIds.value = ['a', 'b'];

    await expect(form.sendOfferBatch(['a', 'b'])).resolves.toEqual(result);

    expect(api.sendOfferBatch).toHaveBeenCalledWith(['a', 'b']);
    expect(form.selectedIds.value).toEqual([]);
  });

  it('only allows sending an offer for supervisor-recommended rows', () => {
    expect(canSendOffer(makeSummary({ status: 'SupervisorRecommended' }))).toBe(true);
    expect(canSendOffer(makeSummary({ status: 'PendingForPreliminaryScreening' }))).toBe(false);
    expect(canSendOffer(makeSummary({ status: 'OfferSent' }))).toBe(false);
  });
});

describe('useAdminApplicationDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.schema.mockResolvedValue(makeSchema());
  });

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  });

  function mountDetail(id: string | null) {
    const idRef = ref<string | null>(id);
    let form!: ReturnType<typeof useAdminApplicationDetail>;
    const wrapper = mount(
      defineComponent({
        setup() {
          form = useAdminApplicationDetail(idRef);
          return () => h('div');
        },
      }),
    );
    wrappers.push(wrapper);
    return { idRef, form };
  }

  it('loads the schema and the application', async () => {
    api.detail.mockResolvedValue(makeDetail({ actions: ['approve', 'return'] }));
    const { form } = mountDetail('app-1');
    await flushPromises();

    expect(api.schema).toHaveBeenCalledTimes(1);
    expect(api.detail).toHaveBeenCalledWith('app-1');
    expect(form.detail.value?.id).toBe('app-1');
    expect(form.actions.value).toEqual(['approve', 'return']);
    expect(form.loading.value).toBe(false);
  });

  it('treats a missing id as not found without hitting the API', async () => {
    const { form } = mountDetail(null);
    await flushPromises();

    expect(form.notFound.value).toBe(true);
    expect(form.loading.value).toBe(false);
    expect(api.detail).not.toHaveBeenCalled();
  });

  it('treats 400 and 404 as not found', async () => {
    api.detail.mockRejectedValue(new ApiError('not_found', 404, 'Missing'));
    const { form } = mountDetail('app-1');
    await flushPromises();

    expect(form.notFound.value).toBe(true);
    expect(form.error.value).toBeNull();
  });

  it('shows the server message for other load failures', async () => {
    api.detail.mockRejectedValue(new ApiError('internal_error', 500, 'Server exploded'));
    const { form } = mountDetail('app-1');
    await flushPromises();

    expect(form.error.value).toBe('Server exploded');
    expect(form.notFound.value).toBe(false);
  });

  it('refreshes the detail after a successful action', async () => {
    const detail: ApplicationDetail = makeDetail({ actions: ['approve'] });
    api.detail.mockResolvedValue(detail);
    api.approve.mockResolvedValue(detail);
    const { form } = mountDetail('app-1');
    await flushPromises();

    await expect(form.approve()).resolves.toBe(true);

    expect(api.approve).toHaveBeenCalledWith('app-1');
    expect(messageMock.success).toHaveBeenCalledWith(ADMIN_MESSAGES.approve.success);
    expect(api.detail).toHaveBeenCalledTimes(2);
    expect(form.pendingAction.value).toBeNull();
  });

  it('does not run an action without an application id', async () => {
    const { form } = mountDetail(null);
    await flushPromises();

    await expect(form.sendOffer()).resolves.toBe(false);
    expect(api.sendOffer).not.toHaveBeenCalled();
  });
});

describe('useSupervisorApplications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.list.mockResolvedValue(listResult());
  });

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  });

  it('only accepts statuses the supervisor is allowed to see', async () => {
    const { form } = track(
      await mountSupervisor('?status=PendingSupervisorReview'),
    );

    expect(api.list).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'PendingSupervisorReview' }),
    );
    expect(form.status.value).toBe('PendingSupervisorReview');
  });

  it('drops pre-screening statuses from the URL', async () => {
    const { form } = track(await mountSupervisor('?status=Draft'));

    expect(form.status.value).toBeNull();
    expect(api.list).toHaveBeenCalledWith(expect.objectContaining({ status: undefined }));
  });

  it('flags an unlinked supervisor profile instead of showing a generic error', async () => {
    api.list.mockRejectedValue(
      new ApiError('supervisor_not_registered', 403, 'Not linked'),
    );
    const { form } = track(await mountSupervisor());

    expect(form.notRegistered.value).toBe(true);
    expect(form.error.value).toBeNull();
    expect(form.items.value).toEqual([]);
  });

  it('recommends a row and reloads', async () => {
    api.recommend.mockResolvedValue(makeDetail());
    const { form } = track(await mountSupervisor());
    const row = makeSummary({ id: 'app-1', status: 'PendingSupervisorReview' });

    await expect(form.recommend(row)).resolves.toBe(true);

    expect(api.recommend).toHaveBeenCalledWith('app-1');
    expect(messageMock.success).toHaveBeenCalledWith(SUPERVISOR_MESSAGES.recommend.success);
    expect(api.list).toHaveBeenCalledTimes(2);
    expect(form.pendingReview.value).toBeNull();
  });

  it('passes the rejection remark through', async () => {
    api.reject.mockResolvedValue(makeDetail());
    const { form } = track(await mountSupervisor());
    const row = makeSummary({ id: 'app-9' });

    await expect(form.reject(row, 'not a fit')).resolves.toBe(true);

    expect(api.reject).toHaveBeenCalledWith('app-9', 'not a fit');
  });

  it('warns and reloads on a stale action', async () => {
    api.recommend.mockRejectedValue(new ApiError('conflict', 409, 'Conflict'));
    const { form } = track(await mountSupervisor());

    await expect(form.recommend(makeSummary())).resolves.toBe(false);

    expect(messageMock.warning).toHaveBeenCalledWith(SUPERVISOR_MESSAGES.stale);
    expect(api.list).toHaveBeenCalledTimes(2);
  });

  it('only allows reviewing rows pending supervisor review', () => {
    expect(canReview(makeSummary({ status: 'PendingSupervisorReview' }))).toBe(true);
    expect(canReview(makeSummary({ status: 'Draft' }))).toBe(false);
    expect(canReview(makeSummary({ status: 'SupervisorRecommended' }))).toBe(false);
  });
});

describe('useSupervisorApplicationDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.schema.mockResolvedValue(makeSchema());
  });

  afterEach(() => {
    for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  });

  function mountDetail(id: string | null) {
    const idRef = ref<string | null>(id);
    let form!: ReturnType<typeof useSupervisorApplicationDetail>;
    const wrapper = mount(
      defineComponent({
        setup() {
          form = useSupervisorApplicationDetail(idRef);
          return () => h('div');
        },
      }),
    );
    wrappers.push(wrapper);
    return { form };
  }

  it('flags an unlinked supervisor account', async () => {
    api.detail.mockRejectedValue(
      new ApiError('supervisor_not_registered', 403, 'Not linked'),
    );
    const { form } = mountDetail('app-1');
    await flushPromises();

    expect(form.notRegistered.value).toBe(true);
    expect(form.notFound.value).toBe(false);
    expect(form.error.value).toBeNull();
  });

  it('hides applications that are not assigned to the supervisor', async () => {
    api.detail.mockRejectedValue(new ApiError('not_found', 404, 'Missing'));
    const { form } = mountDetail('app-1');
    await flushPromises();

    expect(form.notFound.value).toBe(true);
  });

  it('rejects with the remark and reloads', async () => {
    const detail = makeDetail({ actions: ['reject'] });
    api.detail.mockResolvedValue(detail);
    api.reject.mockResolvedValue(detail);
    const { form } = mountDetail('app-1');
    await flushPromises();

    await expect(form.reject('weak profile')).resolves.toBe(true);

    expect(api.reject).toHaveBeenCalledWith('app-1', 'weak profile');
    expect(api.detail).toHaveBeenCalledTimes(2);
    expect(messageMock.success).toHaveBeenCalledWith(SUPERVISOR_MESSAGES.reject.success);
  });
});
