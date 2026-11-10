import { http } from './http';
import type {
  ApplicationDetail,
  ApplicationListQuery,
  ApplicationListResult,
  BatchOfferResult,
  FormSchema,
  FormValues,
  SupervisorOption,
} from '@/types/application';

/** 服务端成功响应统一是 { code, message, data } */
interface ApiEnvelope<T> {
  code: number;
  message: string;
  data: T;
}

const unwrap = <T>(body: ApiEnvelope<T>): T => body.data;

/**
 * 申请表模块 API（前缀 /form）。
 * CSRF、401 刷新与重放由 http.ts 统一处理，这里只负责取业务数据。
 */
export const applicationApi = {
  async schema(): Promise<FormSchema> {
    const { data } = await http.get<ApiEnvelope<FormSchema>>('/form/schema');
    return unwrap(data);
  },

  /** 「我那一份」；没有申请时服务端返回 data: null */
  async mine(): Promise<ApplicationDetail | null> {
    const { data } = await http.get<ApiEnvelope<ApplicationDetail | null>>('/form/applications/mine');
    return unwrap(data);
  },

  async detail(id: string): Promise<ApplicationDetail> {
    const { data } = await http.get<ApiEnvelope<ApplicationDetail>>(`/form/applications/${id}`);
    return unwrap(data);
  },

  /** 首次 Save：创建 Draft + 生成 Application No. */
  async create(values: FormValues): Promise<ApplicationDetail> {
    const { data } = await http.post<ApiEnvelope<ApplicationDetail>>('/form/applications', { values });
    return unwrap(data);
  },

  /** 后续 Save：服务端只覆盖传入的 key */
  async save(id: string, values: FormValues): Promise<ApplicationDetail> {
    const { data } = await http.put<ApiEnvelope<ApplicationDetail>>(`/form/applications/${id}`, { values });
    return unwrap(data);
  },

  async submit(id: string): Promise<ApplicationDetail> {
    const { data } = await http.post<ApiEnvelope<ApplicationDetail>>(`/form/applications/${id}/submit`);
    return unwrap(data);
  },

  async resubmit(id: string): Promise<ApplicationDetail> {
    const { data } = await http.post<ApiEnvelope<ApplicationDetail>>(`/form/applications/${id}/resubmit`);
    return unwrap(data);
  },

  /** 学生接受 Offer：OfferSent -> OfferAccepted */
  async acceptOffer(id: string): Promise<ApplicationDetail> {
    const { data } = await http.post<ApiEnvelope<ApplicationDetail>>(
      `/form/applications/${id}/accept-offer`,
    );
    return unwrap(data);
  },

  /** 学生拒绝 Offer：OfferSent -> OfferDeclined */
  async declineOffer(id: string): Promise<ApplicationDetail> {
    const { data } = await http.post<ApiEnvelope<ApplicationDetail>>(
      `/form/applications/${id}/decline-offer`,
    );
    return unwrap(data);
  },

  /** 学生列表（当前只有一份；状态页复用） */
  async listMine(page = 1, pageSize = 20): Promise<ApplicationListResult> {
    const { data } = await http.get<ApiEnvelope<ApplicationListResult>>('/form/applications', {
      params: { page, pageSize },
    });
    return unwrap(data);
  },

  /**
   * 管理端列表：服务端按角色收窄（admin=全部），支持 status/keyword/分页。
   * 状态筛选为单选，与 UI 的下拉一致。
   */
  async list(query: ApplicationListQuery = {}): Promise<ApplicationListResult> {
    const { data } = await http.get<ApiEnvelope<ApplicationListResult>>('/form/applications', {
      params: {
        status: query.status,
        keyword: query.keyword,
        page: query.page,
        pageSize: query.pageSize,
      },
    });
    return unwrap(data);
  },

  /** 管理员 Approve：PendingForPreliminaryScreening -> PendingSupervisorReview */
  async approve(id: string): Promise<ApplicationDetail> {
    const { data } = await http.post<ApiEnvelope<ApplicationDetail>>(
      `/form/applications/${id}/approve`,
    );
    return unwrap(data);
  },

  /** 管理员 Return：PendingForPreliminaryScreening -> Returned，原因必填 */
  async returnToStudent(id: string, reason: string): Promise<ApplicationDetail> {
    const { data } = await http.post<ApiEnvelope<ApplicationDetail>>(
      `/form/applications/${id}/return`,
      { reason },
    );
    return unwrap(data);
  },

  /** 管理员单条 Send Offer：SupervisorRecommended -> OfferSent */
  async sendOffer(id: string): Promise<ApplicationDetail> {
    const { data } = await http.post<ApiEnvelope<ApplicationDetail>>(
      `/form/applications/${id}/send-offer`,
    );
    return unwrap(data);
  },

  /** 管理员批量 Send Offer：并行处理，返回成功/失败数量与失败明细 */
  async sendOfferBatch(ids: readonly string[]): Promise<BatchOfferResult> {
    const { data } = await http.post<ApiEnvelope<BatchOfferResult>>(
      '/form/offers/batch',
      { ids },
      // 单条 3s 超时 + 并发 10，最坏情况会超过默认 15s，这里单独放宽
      { timeout: 60_000 },
    );
    return unwrap(data);
  },

  /** 导师 Recommend：PendingSupervisorReview -> SupervisorRecommended，备注可选 */
  async recommend(id: string, reason?: string): Promise<ApplicationDetail> {
    const { data } = await http.post<ApiEnvelope<ApplicationDetail>>(
      `/form/applications/${id}/recommend`,
      { reason: reason?.trim() ? reason.trim() : undefined },
    );
    return unwrap(data);
  },

  /** 导师 Reject：PendingSupervisorReview -> SupervisorRejected，备注可选 */
  async reject(id: string, reason?: string): Promise<ApplicationDetail> {
    const { data } = await http.post<ApiEnvelope<ApplicationDetail>>(
      `/form/applications/${id}/reject`,
      { reason: reason?.trim() ? reason.trim() : undefined },
    );
    return unwrap(data);
  },

  /** 志愿导师候选：按 Program 过滤，keyword 走模糊搜索 */
  async searchSupervisors(programCode: string, keyword: string, limit = 50): Promise<SupervisorOption[]> {
    const { data } = await http.get<ApiEnvelope<{ items: SupervisorOption[] }>>('/form/supervisors', {
      params: {
        programCode,
        keyword: keyword.trim() === '' ? undefined : keyword.trim(),
        limit,
      },
    });
    return unwrap(data).items;
  },
};
