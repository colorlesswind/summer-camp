import { describe, expect, it } from 'vitest';
import type { FieldConfig } from '@src/form/form.config.service';
import { isNil, validateRowItems, validateScalarValues } from '@src/form/form.validation';

const field = (over: Record<string, unknown> & { code: string }): FieldConfig => {
  const base: Record<string, unknown> = {
    code: over.code,
    sectionCode: 'BASIC',
    groupCode: null,
    labelEn: over.code,
    labelZh: null,
    widget: 'input',
    valueType: 'string',
    isRequired: false,
    maxLength: null,
    optionsSource: null,
    dependsOnField: null,
    guideTextEn: null,
    storageTable: 'application_details',
    storageColumn: over.code,
    sortOrder: 0,
    options: [],
  };
  return { ...base, ...over } as unknown as FieldConfig;
};

const basicFields: FieldConfig[] = [
  field({ code: 'nameEn', isRequired: true, maxLength: 10 }),
  field({ code: 'age', valueType: 'number' }),
  field({ code: 'isDomestic', valueType: 'boolean', options: [
    { value: 'true', labelEn: 'yes', labelZh: null },
    { value: 'false', labelEn: 'no', labelZh: null },
  ] }),
  field({ code: 'birthDate', valueType: 'date' }),
  field({ code: 'programCode', options: [
    { value: 'AMAT', labelEn: 'AMAT', labelZh: null },
    { value: 'CS', labelEn: 'CS', labelZh: null },
  ] }),
  field({ code: 'supervisorId', dependsOnField: 'programCode' }),
  field({ code: 'note', isRequired: true }),
];

describe('isNil', () => {
  it('null / undefined / 纯空白字符串都算空', () => {
    expect(isNil(null)).toBe(true);
    expect(isNil(undefined)).toBe(true);
    expect(isNil('')).toBe(true);
    expect(isNil('   ')).toBe(true);
  });

  it('0 / false / 空数组都算有值（0 和 false 是合法业务值）', () => {
    expect(isNil(0)).toBe(false);
    expect(isNil(false)).toBe(false);
    expect(isNil([])).toBe(false);
  });
});

describe('validateScalarValues - 类型与清洗', () => {
  it('未知字段 -> unknown_field（防止前端塞未定义字段进库）', () => {
    const { issues, values } = validateScalarValues({ hacker: 'x' }, basicFields, 'save');
    expect(issues).toEqual([
      { path: 'values.hacker', code: 'unknown_field', message: '未知字段 hacker' },
    ]);
    expect(values).toEqual({});
  });

  it('字符串 trim，空串归一成 null', () => {
    const { values, issues } = validateScalarValues({ nameEn: '  Alice ', note: '   ' }, basicFields, 'save');
    expect(values).toEqual({ nameEn: 'Alice', note: null });
    expect(issues).toEqual([]);
  });

  it('超过 maxLength -> too_long', () => {
    const { issues, values } = validateScalarValues({ nameEn: 'x'.repeat(11) }, basicFields, 'save');
    expect(issues[0]).toMatchObject({ path: 'values.nameEn', code: 'too_long' });
    expect(values.nameEn).toBeUndefined();
  });

  it('number 接受数字字符串并转成 number', () => {
    expect(validateScalarValues({ age: ' 42 ' }, basicFields, 'save').values.age).toBe(42);
    expect(validateScalarValues({ age: 42 }, basicFields, 'save').values.age).toBe(42);
  });

  it('number 非法 -> invalid_type', () => {
    expect(validateScalarValues({ age: 'abc' }, basicFields, 'save').issues[0]).toMatchObject({
      code: 'invalid_type',
      message: 'age 必须是数字',
    });
  });

  it('boolean 接受 true/false 与字符串 "true"/"false"', () => {
    expect(validateScalarValues({ isDomestic: true }, basicFields, 'save').values).toEqual({ isDomestic: true });
    expect(validateScalarValues({ isDomestic: 'false' }, basicFields, 'save').values).toEqual({
      isDomestic: false,
    });
    expect(validateScalarValues({ isDomestic: 'yes' }, basicFields, 'save').issues[0]).toMatchObject({
      code: 'invalid_type',
    });
  });

  it('date 必须是 yyyy-mm-dd 且真实存在', () => {
    expect(validateScalarValues({ birthDate: '2008-02-29' }, basicFields, 'save').values.birthDate).toBe(
      '2008-02-29',
    );
    expect(validateScalarValues({ birthDate: '2026-02-30' }, basicFields, 'save').issues[0]).toMatchObject({
      code: 'invalid_format',
    });
    expect(validateScalarValues({ birthDate: '2026/01/01' }, basicFields, 'save').issues[0]).toMatchObject({
      code: 'invalid_format',
    });
  });

  it('非字符串喂给 string 字段 -> invalid_type', () => {
    expect(validateScalarValues({ nameEn: 123 }, basicFields, 'save').issues[0]).toMatchObject({
      path: 'values.nameEn',
      code: 'invalid_type',
    });
  });

  it('选项值必须在配置集合内', () => {
    expect(validateScalarValues({ programCode: 'CS' }, basicFields, 'save').values.programCode).toBe('CS');
    expect(validateScalarValues({ programCode: 'MATH' }, basicFields, 'save').issues[0]).toMatchObject({
      path: 'values.programCode',
      code: 'invalid_option',
    });
  });

  it('没有选项配置的字段不做选项校验', () => {
    expect(validateScalarValues({ note: 'anything' }, basicFields, 'save').issues).toEqual([]);
  });
});

describe('validateScalarValues - 必填与联动', () => {
  it('save 模式不检查必填（草稿可以残缺）', () => {
    expect(validateScalarValues({}, basicFields, 'save').issues).toEqual([]);
  });

  it('submit 模式检查必填', () => {
    const { issues } = validateScalarValues({}, basicFields, 'submit');
    const requiredPaths = issues.filter((issue) => issue.code === 'required').map((issue) => issue.path);
    expect(requiredPaths).toEqual(expect.arrayContaining(['values.nameEn', 'values.note']));
  });

  it('submit 模式下被依赖字段有值时，子字段也变成必填', () => {
    const { issues } = validateScalarValues({ programCode: 'CS' }, basicFields, 'submit');
    expect(issues).toContainEqual(
      expect.objectContaining({ path: 'values.supervisorId', code: 'required' }),
    );

    // 父字段为空时子字段不是「联动必填」（但它的 required 来自父字段为空则无）
    const noParent = validateScalarValues({}, basicFields, 'submit');
    expect(noParent.issues.some((issue) => issue.path === 'values.supervisorId')).toBe(false);
  });

  it('子字段有值但父字段为空 -> missing_dependency（save 与 submit 都不允许）', () => {
    for (const mode of ['save', 'submit'] as const) {
      const { issues } = validateScalarValues({ supervisorId: '12' }, basicFields, mode);
      expect(issues).toContainEqual(
        expect.objectContaining({ path: 'values.supervisorId', code: 'missing_dependency' }),
      );
    }
  });

  it('未知字段不会进入 values，也不会中断其它字段的校验', () => {
    const { values, issues } = validateScalarValues({ nameEn: 'Alice', hacker: 1 }, basicFields, 'save');
    expect(values).toEqual({ nameEn: 'Alice' });
    expect(issues).toHaveLength(1);
  });
});

describe('validateRowItems', () => {
  const rowFields: FieldConfig[] = [
    field({ code: 'title', maxLength: 5, sectionCode: 'PUBLICATIONS' }),
    field({ code: 'year', valueType: 'number', sectionCode: 'PUBLICATIONS' }),
    field({ code: 'status', sectionCode: 'PUBLICATIONS', options: [
      { value: 'published', labelEn: 'Published', labelZh: null },
    ] }),
  ];

  it('null / undefined -> 空数组', () => {
    expect(validateRowItems(null, rowFields, 'Publications')).toEqual({ rows: [], issues: [] });
    expect(validateRowItems(undefined, rowFields, 'Publications')).toEqual({ rows: [], issues: [] });
  });

  it('不是数组 -> invalid_type', () => {
    expect(validateRowItems({ title: 'x' }, rowFields, 'Publications')).toEqual({
      rows: [],
      issues: [{ path: 'Publications', code: 'invalid_type', message: 'Publications 必须是数组' }],
    });
  });

  it('超过 20 行 -> too_many_rows', () => {
    const raw = Array.from({ length: 21 }, (_, index) => ({ title: `t${index}` }));
    expect(validateRowItems(raw, rowFields, 'Publications').issues[0]).toMatchObject({
      code: 'too_many_rows',
    });
  });

  it('恰好 20 行允许', () => {
    const raw = Array.from({ length: 20 }, (_, index) => ({ title: `t${index}` }));
    expect(validateRowItems(raw, rowFields, 'Publications').issues).toEqual([]);
  });

  it('全空的行被丢弃（用户点开又没填的行不落库）', () => {
    const result = validateRowItems([{ title: '  ', year: '' }, { title: 'Paper' }], rowFields, 'Publications');
    expect(result.rows).toEqual([{ title: 'Paper' }]);
    expect(result.issues).toEqual([]);
  });

  it('行内未知字段 -> unknown_field', () => {
    const result = validateRowItems([{ title: 'ok', hacker: 1 }], rowFields, 'Publications');
    expect(result.issues[0]).toMatchObject({ path: 'Publications[0].hacker', code: 'unknown_field' });
  });

  it('行内类型 / 选项 / 长度错误都带行号路径', () => {
    const result = validateRowItems(
      [{ title: 'toolong', year: 'abc', status: 'unknown' }],
      rowFields,
      'Publications',
    );
    expect(result.issues.map((issue) => issue.path)).toEqual([
      'Publications[0].title',
      'Publications[0].year',
      'Publications[0].status',
    ]);
  });

  it('非对象的行 -> invalid_type 且其它行继续处理', () => {
    const result = validateRowItems(['oops', { title: 'A' }], rowFields, 'Publications');
    expect(result.issues).toEqual([
      { path: 'Publications[0]', code: 'invalid_type', message: 'Publications 的第 1 行格式不正确' },
    ]);
    expect(result.rows).toEqual([{ title: 'A' }]);
  });

  it('合法行完成类型转换', () => {
    const result = validateRowItems([{ title: 'P1', year: '2025', status: 'published' }], rowFields, 'Publications');
    expect(result.rows).toEqual([{ title: 'P1', year: 2025, status: 'published' }]);
  });
});
