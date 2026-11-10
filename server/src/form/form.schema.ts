import { z } from 'zod';
import type { ApplicationStatus } from './application.state';
import { isApplicationStatus } from './form.display';

/** ULID：26 位 Crockford base32（这里放宽到大小写字母+数字，避免误杀） */
const ULID_RE = /^[0-9A-Za-z]{26}$/;

const statusSchema = z.custom<ApplicationStatus>(
  (value) => typeof value === 'string' && isApplicationStatus(value),
  '未知的申请状态',
);

/** `?status=Draft&status=Returned` 与 `?status=Draft,Returned` 都支持 */
const normalizeStatusList = (value: unknown): unknown => {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.filter((item) => item !== '');
  if (typeof value !== 'string') return value;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
};

const emptyToUndefined = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value;

export const idParamSchema = z.object({
  id: z.string().regex(ULID_RE, '申请 ID 格式不正确'),
});

export const listQuerySchema = z.object({
  status: z.preprocess(normalizeStatusList, z.array(statusSchema).optional()),
  keyword: z.preprocess(emptyToUndefined, z.string().trim().max(128, '关键词最多 128 个字符').optional()),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const supervisorQuerySchema = z.object({
  programCode: z.string({ required_error: '缺少 programCode' }).trim().min(1).max(8),
  keyword: z.preprocess(emptyToUndefined, z.string().trim().max(64, '关键词最多 64 个字符').optional()),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

/** Save：values 的 key 由 form_fields.code 决定，具体校验在 form.validation.ts */
export const saveSchema = z
  .object({
    values: z.record(z.unknown()).default({}),
  })
  .strict();

export const returnSchema = z
  .object({
    reason: z.string({ required_error: '请填写退回原因' }).trim().min(1, '退回原因不能为空').max(1000, '退回原因最多 1000 个字符'),
  })
  .strict();

export const reviewSchema = z
  .object({
    reason: z.preprocess(emptyToUndefined, z.string().trim().max(1000, '备注最多 1000 个字符').optional()),
  })
  .strict();

export const batchOfferSchema = z
  .object({
    ids: z
      .array(z.string().regex(ULID_RE, '申请 ID 格式不正确'), { required_error: '请选择要发送 Offer 的申请' })
      .min(1, '至少选择一条申请')
      .max(100, '单次最多处理 100 条申请'),
  })
  .strict();

export type ListQueryInput = z.infer<typeof listQuerySchema>;
export type SupervisorQueryInput = z.infer<typeof supervisorQuerySchema>;
export type SaveInput = z.infer<typeof saveSchema>;
export type ReturnInput = z.infer<typeof returnSchema>;
export type ReviewInput = z.infer<typeof reviewSchema>;
export type BatchOfferInput = z.infer<typeof batchOfferSchema>;
