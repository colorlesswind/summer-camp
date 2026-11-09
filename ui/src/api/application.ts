import { http } from './http';
import type {
  ApplicationDetail,
  ApplicationListResult,
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
