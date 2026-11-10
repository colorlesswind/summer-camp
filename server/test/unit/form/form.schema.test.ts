import { describe, expect, it } from 'vitest';
import {
  batchOfferSchema,
  idParamSchema,
  listQuerySchema,
  returnSchema,
  reviewSchema,
  saveSchema,
  supervisorQuerySchema,
} from '@src/form/form.schema';

const ULID = '01J8Z6Q3W9K7X2C4V5B6N7M8P9';

describe('idParamSchema', () => {
  it('接受 26 位 ULID', () => {
    expect(idParamSchema.parse({ id: ULID })).toEqual({ id: ULID });
    expect(idParamSchema.parse({ id: 'a'.repeat(26) })).toEqual({ id: 'a'.repeat(26) });
  });

  it('拒绝长度不对 / 含非法字符的 ID', () => {
    expect(idParamSchema.safeParse({ id: 'abc' }).success).toBe(false);
    expect(idParamSchema.safeParse({ id: 'a'.repeat(27) }).success).toBe(false);
    expect(idParamSchema.safeParse({ id: `${'a'.repeat(25)}-` }).success).toBe(false);
  });
});

describe('listQuerySchema', () => {
  it('给默认分页（page=1, pageSize=20）', () => {
    expect(listQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
  });

  it('支持 ?status=Draft,Returned 的逗号形式', () => {
    expect(listQuerySchema.parse({ status: 'Draft, Returned' }).status).toEqual(['Draft', 'Returned']);
  });

  it('支持 ?status=Draft&status=Returned 的数组形式，并过滤空值', () => {
    expect(listQuerySchema.parse({ status: ['Draft', '', 'Returned'] }).status).toEqual([
      'Draft',
      'Returned',
    ]);
  });

  it('空字符串 status 视为不筛选', () => {
    expect(listQuerySchema.parse({ status: '' }).status).toBeUndefined();
  });

  it('未知状态 -> 校验失败（不能把拼错的状态当成有效筛选）', () => {
    expect(listQuerySchema.safeParse({ status: 'Draft,Unknown' }).success).toBe(false);
  });

  it('page / pageSize 做数字转换并限制范围', () => {
    expect(listQuerySchema.parse({ page: '3', pageSize: '50' })).toMatchObject({ page: 3, pageSize: 50 });
    expect(listQuerySchema.safeParse({ page: 0 }).success).toBe(false);
    expect(listQuerySchema.safeParse({ pageSize: 101 }).success).toBe(false);
    expect(listQuerySchema.safeParse({ pageSize: 'abc' }).success).toBe(false);
  });

  it('keyword trim 且空串归一成 undefined，超长拒绝', () => {
    expect(listQuerySchema.parse({ keyword: '  alice ' }).keyword).toBe('alice');
    expect(listQuerySchema.parse({ keyword: '   ' }).keyword).toBeUndefined();
    expect(listQuerySchema.safeParse({ keyword: 'x'.repeat(129) }).success).toBe(false);
  });
});

describe('supervisorQuerySchema', () => {
  it('programCode 必填，limit 默认 20', () => {
    expect(supervisorQuerySchema.parse({ programCode: ' AMAT ' })).toEqual({
      programCode: 'AMAT',
      limit: 20,
    });
  });

  it('缺少 programCode -> 失败', () => {
    expect(supervisorQuerySchema.safeParse({}).success).toBe(false);
  });

  it('limit 上限 50，keyword 上限 64', () => {
    expect(supervisorQuerySchema.safeParse({ programCode: 'AMAT', limit: 51 }).success).toBe(false);
    expect(supervisorQuerySchema.safeParse({ programCode: 'AMAT', keyword: 'x'.repeat(65) }).success).toBe(
      false,
    );
  });
});

describe('saveSchema', () => {
  it('values 缺省为空对象', () => {
    expect(saveSchema.parse({})).toEqual({ values: {} });
  });

  it('保留任意 key（具体字段校验在 form.validation 里做）', () => {
    expect(saveSchema.parse({ values: { nameEn: 'Alice', age: 20 } }).values).toEqual({
      nameEn: 'Alice',
      age: 20,
    });
  });

  it('strict：拒绝 values 之外的字段', () => {
    expect(saveSchema.safeParse({ values: {}, role: 'admin' }).success).toBe(false);
  });

  it('values 必须是对象', () => {
    expect(saveSchema.safeParse({ values: [] }).success).toBe(false);
    expect(saveSchema.safeParse({ values: 'x' }).success).toBe(false);
  });
});

describe('returnSchema', () => {
  it('退回原因必填，trim 后不能为空', () => {
    expect(returnSchema.parse({ reason: '  请补充成绩单  ' })).toEqual({ reason: '请补充成绩单' });
    expect(returnSchema.safeParse({ reason: '   ' }).success).toBe(false);
    expect(returnSchema.safeParse({}).success).toBe(false);
  });

  it('原因上限 1000 字', () => {
    expect(returnSchema.safeParse({ reason: 'x'.repeat(1001) }).success).toBe(false);
    expect(returnSchema.safeParse({ reason: 'x'.repeat(1000) }).success).toBe(true);
  });
});

describe('reviewSchema', () => {
  it('备注可选，空串归一成 undefined', () => {
    expect(reviewSchema.parse({})).toEqual({});
    expect(reviewSchema.parse({ reason: '  ' })).toEqual({});
    expect(reviewSchema.parse({ reason: ' 优秀 ' })).toEqual({ reason: '优秀' });
  });

  it('超长备注拒绝', () => {
    expect(reviewSchema.safeParse({ reason: 'x'.repeat(1001) }).success).toBe(false);
  });
});

describe('batchOfferSchema', () => {
  it('至少 1 条、最多 100 条、ID 必须是 ULID', () => {
    expect(batchOfferSchema.parse({ ids: [ULID] })).toEqual({ ids: [ULID] });
    expect(batchOfferSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(batchOfferSchema.safeParse({ ids: ['bad-id'] }).success).toBe(false);
    expect(
      batchOfferSchema.safeParse({ ids: Array.from({ length: 101 }, (_, i) => `${'a'.repeat(24)}${String(i).padStart(2, '0')}`) }).success,
    ).toBe(false);
  });

  it('ids 必填', () => {
    expect(batchOfferSchema.safeParse({}).success).toBe(false);
  });
});
