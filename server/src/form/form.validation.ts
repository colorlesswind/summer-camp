import type { FieldConfig } from './form.config.service';
import type { ValidationIssue } from './form.types';

export interface ScalarValidationResult {
  values: Record<string, unknown>;
  issues: ValidationIssue[];
}

export interface RowValidationResult {
  rows: Array<Record<string, unknown>>;
  issues: ValidationIssue[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ROWS_PER_SECTION = 20;

export const isNil = (value: unknown): boolean =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

const isValidDateString = (value: string): boolean => {
  if (!DATE_RE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};

interface CoercedValue {
  value: unknown;
  issue: ValidationIssue | null;
}

const coerceValue = (field: FieldConfig, path: string, raw: unknown): CoercedValue => {
  if (isNil(raw)) return { value: null, issue: null };

  const fail = (code: string, message: string): CoercedValue => ({
    value: undefined,
    issue: { path, code, message },
  });

  switch (field.valueType) {
    case 'number': {
      const parsed = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (!Number.isFinite(parsed)) return fail('invalid_type', `${field.labelEn} 必须是数字`);
      return { value: parsed, issue: null };
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return { value: raw, issue: null };
      if (raw === 'true' || raw === 'false') return { value: raw === 'true', issue: null };
      return fail('invalid_type', `${field.labelEn} 必须是布尔值`);
    }
    case 'date': {
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (!text) return { value: null, issue: null };
      if (!isValidDateString(text)) return fail('invalid_format', `${field.labelEn} 必须是 yyyy-mm-dd 格式的日期`);
      return { value: text, issue: null };
    }
    default: {
      if (typeof raw !== 'string') return fail('invalid_type', `${field.labelEn} 必须是字符串`);
      const text = raw.trim();
      if (text.length === 0) return { value: null, issue: null };
      if (field.maxLength !== null && text.length > field.maxLength) {
        return fail('too_long', `${field.labelEn} 最多 ${field.maxLength} 个字符`);
      }
      return { value: text, issue: null };
    }
  }
};

/** 单选值必须落在配置的选项集合里（含 boolean 字段的 'true'/'false'） */
const checkOption = (field: FieldConfig, path: string, value: unknown): ValidationIssue | null => {
  if (isNil(value) || field.options.length === 0) return null;
  const asString = typeof value === 'boolean' ? String(value) : String(value);
  if (field.options.some((option) => option.value === asString)) return null;
  return {
    path,
    code: 'invalid_option',
    message: `${field.labelEn} 的取值 ${asString} 不在允许的选项内`,
  };
};

/**
 * 校验一组标量字段（1:1 小节）。
 *
 * mode='save'   ：只做类型 / 长度 / 选项校验，不检查必填（草稿可以残缺）
 * mode='submit' ：额外校验必填与联动必填
 */
export const validateScalarValues = (
  raw: Record<string, unknown>,
  fields: readonly FieldConfig[],
  mode: 'save' | 'submit',
): ScalarValidationResult => {
  const issues: ValidationIssue[] = [];
  const byCode = new Map(fields.map((field) => [field.code, field]));
  const values: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(raw)) {
    const field = byCode.get(key);
    if (!field) {
      issues.push({ path: `values.${key}`, code: 'unknown_field', message: `未知字段 ${key}` });
      continue;
    }
    const coerced = coerceValue(field, `values.${key}`, rawValue);
    if (coerced.issue) {
      issues.push(coerced.issue);
      continue;
    }
    const optionIssue = checkOption(field, `values.${key}`, coerced.value);
    if (optionIssue) {
      issues.push(optionIssue);
      continue;
    }
    values[key] = coerced.value;
  }

  // 联动：子字段有值但父字段为空 -> 无论保存还是提交都不允许（否则写库必然失败）
  for (const field of fields) {
    if (!field.dependsOnField) continue;
    const parent = values[field.dependsOnField];
    const child = values[field.code];
    if (!isNil(child) && isNil(parent)) {
      issues.push({
        path: `values.${field.code}`,
        code: 'missing_dependency',
        message: `填写 ${field.labelEn} 前必须先选择 ${byCode.get(field.dependsOnField)?.labelEn ?? field.dependsOnField}`,
      });
    }
  }

  if (mode === 'submit') {
    for (const field of fields) {
      if (isNil(values[field.code])) {
        const dependsOn = field.dependsOnField ? values[field.dependsOnField] : null;
        const requiredByDependency = field.dependsOnField !== null && !isNil(dependsOn);
        if (field.isRequired || requiredByDependency) {
          issues.push({
            path: `values.${field.code}`,
            code: 'required',
            message: `${field.labelEn} 为必填项`,
          });
        }
      }
    }
  }

  return { values, issues };
};

/**
 * 校验可重复小节的一行数组（论文 / 经历）。
 * 全空的行会被丢弃，row_no 由调用方按最终顺序重排。
 */
export const validateRowItems = (
  raw: unknown,
  fields: readonly FieldConfig[],
  sectionLabel: string,
): RowValidationResult => {
  const issues: ValidationIssue[] = [];

  if (raw === null || raw === undefined) return { rows: [], issues };
  if (!Array.isArray(raw)) {
    return {
      rows: [],
      issues: [{ path: sectionLabel, code: 'invalid_type', message: `${sectionLabel} 必须是数组` }],
    };
  }
  if (raw.length > MAX_ROWS_PER_SECTION) {
    return {
      rows: [],
      issues: [
        {
          path: sectionLabel,
          code: 'too_many_rows',
          message: `${sectionLabel} 最多 ${MAX_ROWS_PER_SECTION} 行`,
        },
      ],
    };
  }

  const byCode = new Map(fields.map((field) => [field.code, field]));
  const rows: Array<Record<string, unknown>> = [];

  raw.forEach((item, index) => {
    const path = `${sectionLabel}[${index}]`;
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      issues.push({ path, code: 'invalid_type', message: `${sectionLabel} 的第 ${index + 1} 行格式不正确` });
      return;
    }

    const row: Record<string, unknown> = {};
    let filled = 0;

    for (const [key, rawValue] of Object.entries(item as Record<string, unknown>)) {
      const field = byCode.get(key);
      if (!field) {
        issues.push({ path: `${path}.${key}`, code: 'unknown_field', message: `未知字段 ${key}` });
        continue;
      }
      const coerced = coerceValue(field, `${path}.${key}`, rawValue);
      if (coerced.issue) {
        issues.push(coerced.issue);
        continue;
      }
      const optionIssue = checkOption(field, `${path}.${key}`, coerced.value);
      if (optionIssue) {
        issues.push(optionIssue);
        continue;
      }
      row[key] = coerced.value;
      if (!isNil(coerced.value)) filled += 1;
    }

    if (filled > 0) rows.push(row);
  });

  return { rows, issues };
};
