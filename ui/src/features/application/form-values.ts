import type { FormFieldConfig, FormSectionConfig } from '@/types/application';

/** 可重复小节的一行；`_key` 仅前端使用，提交前会剔除 */
export interface RepeatableRow {
  _key: string;
  [code: string]: unknown;
}

export const makeRowKey = (): string =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

export const isNil = (value: unknown): boolean =>
  value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

/** 服务端值 → 表单控件值（日期只保留 YYYY-MM-DD） */
export const hydrateValue = (field: FormFieldConfig, raw: unknown): unknown => {
  if (raw === null || raw === undefined) return null;
  switch (field.valueType) {
    case 'boolean':
      return raw === true || raw === 'true';
    case 'number': {
      const parsed = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }
    case 'date': {
      const text = String(raw);
      return text.length >= 10 ? text.slice(0, 10) : null;
    }
    default:
      return typeof raw === 'string' ? raw : String(raw);
  }
};

/** 表单控件值 → 提交给服务端的值 */
export const payloadValue = (field: FormFieldConfig, raw: unknown): unknown => {
  if (raw === null || raw === undefined) return null;
  switch (field.valueType) {
    case 'boolean':
      return raw === true || raw === 'true';
    case 'number': {
      const parsed = typeof raw === 'number' ? raw : Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    }
    case 'date': {
      const text = String(raw).slice(0, 10);
      return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
    }
    default: {
      const text = String(raw).trim();
      return text === '' ? null : text;
    }
  }
};

export const makeRow = (section: FormSectionConfig, raw: unknown): RepeatableRow => {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const row: RepeatableRow = { _key: makeRowKey() };
  for (const field of section.fields) {
    row[field.code] = hydrateValue(field, source[field.code]);
  }
  return row;
};
