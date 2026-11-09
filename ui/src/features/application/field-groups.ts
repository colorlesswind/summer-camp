import type { FormFieldConfig } from '@/types/application';

export interface FieldGroup {
  key: string;
  label: string;
  fields: FormFieldConfig[];
}

/** 同一行内组合控件的整体标签（schema 只给单字段标签，组合行需要更自然的文案） */
const GROUP_LABELS: Record<string, string> = {
  nameEn: 'Name in English',
  idDocument: 'I.D. Document',
  phone: 'Phone Number',
  expPeriod: 'Period',
};

/** 组合行内每个子控件的短标签 */
const SUB_LABELS: Record<string, string> = {
  lastNameEn: 'Last Name',
  firstNameEn: 'First Name',
  idDocumentType: 'Document Type',
  idDocumentNumber: 'Document Number',
  phoneCountryCode: 'Country Code',
  phoneNumber: 'Phone Number',
  expPeriodStart: 'Start Date',
  expPeriodEnd: 'End Date',
};

/**
 * 把 section.fields 按 group_code 合并成「一行」。
 * 顺序保持不变：group 第一次出现的位置就是整组的位置。
 */
export function groupFields(fields: readonly FormFieldConfig[]): FieldGroup[] {
  const groups: FieldGroup[] = [];
  const byKey = new Map<string, FieldGroup>();

  for (const field of fields) {
    const key = field.groupCode ?? field.code;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        label: field.groupCode ? (GROUP_LABELS[field.groupCode] ?? field.labelEn) : field.labelEn,
        fields: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    group.fields.push(field);
  }

  return groups;
}

export const subFieldLabel = (field: FormFieldConfig): string =>
  SUB_LABELS[field.code] ?? field.labelEn;

/** 可重复小节的列：组合字段合并为一列（如 Period Start/End） */
export const tableColumns = (fields: readonly FormFieldConfig[]): FieldGroup[] => groupFields(fields);
