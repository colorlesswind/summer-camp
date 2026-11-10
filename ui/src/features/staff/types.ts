import type { ApplicationStatus } from '@/types/application';

/** 筛选下拉的选项；`value: ''` 表示 All */
export interface StatusFilterOption {
  value: ApplicationStatus | '';
  label: string;
}

/** 筛选栏文案（管理端 / 导师端各传各的） */
export interface FilterBarTexts {
  statusLabel: string;
  all: string;
  searchPlaceholder: string;
  reset: string;
}
