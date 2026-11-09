import { computed, reactive, ref, type ComputedRef, type Ref } from 'vue';
import { applicationApi } from '@/api/application';
import { ApiError } from '@/api/problem';
import { useAuthStore } from '@/stores/auth';
import type {
  ApplicationDetail,
  ApplicationStatus,
  FormFieldConfig,
  FormSchema,
  FormValues,
} from '@/types/application';
import type { FieldIssue } from '@/types/api';
import {
  hydrateValue,
  isNil,
  makeRow,
  payloadValue,
  type RepeatableRow,
} from '../form-values';
import { APPLICATION_MESSAGES, issueMessage } from '../messages';

export type { RepeatableRow } from '../form-values';

interface IssueLike {
  path: string;
  code: string;
  message: string;
}

type ParsedIssuePath =
  | { kind: 'scalar'; code: string }
  | { kind: 'row'; sectionCode: string; index: number; code: string }
  | null;

export interface UseApplicationForm {
  schema: Ref<FormSchema | null>;
  detail: Ref<ApplicationDetail | null>;
  values: FormValues;
  loading: Ref<boolean>;
  saving: Ref<boolean>;
  submitting: Ref<boolean>;
  loadError: Ref<string | null>;
  formError: Ref<string | null>;
  errorSummary: Ref<string[]>;
  fieldErrors: Record<string, string>;
  rowErrors: Record<string, string>;
  lastSavedAt: Ref<string | null>;
  dirty: ComputedRef<boolean>;
  isNew: ComputedRef<boolean>;
  editable: ComputedRef<boolean>;
  isReadonly: ComputedRef<boolean>;
  canSave: ComputedRef<boolean>;
  canSubmit: ComputedRef<boolean>;
  canResubmit: ComputedRef<boolean>;
  status: ComputedRef<ApplicationStatus>;
  displayStatus: ComputedRef<string>;
  applicationNumber: ComputedRef<string>;
  fieldMap: ComputedRef<Map<string, FormFieldConfig>>;
  initialize: (targetId: string | null) => Promise<{ redirectTo: string | null }>;
  save: () => Promise<boolean>;
  submit: () => Promise<boolean>;
  resubmit: () => Promise<boolean>;
  isFieldRequired: (field: FormFieldConfig) => boolean;
  clearSummary: () => void;
}

/**
 * 学生申请表的单一状态源：加载、hydrate、校验、Save/Submit/Resubmit。
 * 视图只负责布局、路由和提示，不直接拼 request body。
 */
export function useApplicationForm(): UseApplicationForm {
  const auth = useAuthStore();

  const schema = ref<FormSchema | null>(null);
  const detail = ref<ApplicationDetail | null>(null);
  const values = reactive<FormValues>({});
  const loading = ref(true);
  const saving = ref(false);
  const submitting = ref(false);
  const loadError = ref<string | null>(null);
  const formError = ref<string | null>(null);
  const errorSummary = ref<string[]>([]);
  const fieldErrors = reactive<Record<string, string>>({});
  const rowErrors = reactive<Record<string, string>>({});
  const lastSavedAt = ref<string | null>(null);
  const baseline = ref('{}');

  const fieldMap = computed(() => {
    const map = new Map<string, FormFieldConfig>();
    for (const section of schema.value?.sections ?? []) {
      for (const field of section.fields) map.set(field.code, field);
    }
    return map;
  });

  const isNew = computed(() => detail.value === null);
  const editable = computed(() =>
    detail.value ? detail.value.editable : (schema.value?.meta.canSaveDraft ?? false),
  );
  const isReadonly = computed(() => !editable.value);
  const actions = computed(() => detail.value?.actions ?? []);

  const canSave = computed(() => {
    if (!editable.value) return false;
    return isNew.value
      ? (schema.value?.meta.canSaveDraft ?? false)
      : actions.value.includes('save');
  });

  const canSubmit = computed(() => {
    if (!editable.value) return false;
    return isNew.value
      ? Boolean(schema.value?.meta.canSaveDraft && schema.value?.meta.submissionWindow.isOpen)
      : actions.value.includes('submit');
  });

  const canResubmit = computed(() => editable.value && actions.value.includes('resubmit'));
  const status = computed<ApplicationStatus>(() => detail.value?.status ?? 'Draft');
  const displayStatus = computed(() => detail.value?.displayStatus ?? 'Draft');
  const applicationNumber = computed(
    () => detail.value?.applicationNumber ?? APPLICATION_MESSAGES.applicationNoPending,
  );

  function isFieldRequired(field: FormFieldConfig): boolean {
    if (field.isRequired) return true;
    if (!field.dependsOnField) return false;
    return !isNil(values[field.dependsOnField]);
  }

  function buildPayload(): FormValues {
    const currentSchema = schema.value;
    if (!currentSchema) return {};

    const payload: FormValues = {};
    for (const section of currentSchema.sections) {
      if (section.isRepeatable) {
        const key = section.payloadKey;
        if (!key) continue;
        const rows = Array.isArray(values[key]) ? (values[key] as RepeatableRow[]) : [];
        payload[key] = rows
          .map((row) => {
            const output: Record<string, unknown> = {};
            for (const field of section.fields) {
              output[field.code] = payloadValue(field, row[field.code]);
            }
            return output;
          })
          .filter((row) => Object.values(row).some((value) => !isNil(value)));
      } else {
        for (const field of section.fields) {
          // readonly 字段（登录邮箱）由账号派生，不能回写服务端
          if (field.widget === 'readonly') continue;
          payload[field.code] = payloadValue(field, values[field.code]);
        }
      }
    }
    return payload;
  }

  const dirty = computed(() => JSON.stringify(buildPayload()) !== baseline.value);

  function markClean(): void {
    baseline.value = JSON.stringify(buildPayload());
  }

  function hydrate(): void {
    for (const key of Object.keys(values)) delete values[key];
    const currentSchema = schema.value;
    if (!currentSchema) {
      markClean();
      return;
    }

    const source = detail.value?.values ?? {};
    const canEdit = detail.value ? detail.value.editable : currentSchema.meta.canSaveDraft;

    for (const section of currentSchema.sections) {
      if (section.isRepeatable) {
        const key = section.payloadKey;
        if (!key) continue;
        const rawRows = source[key];
        const rows = Array.isArray(rawRows) ? rawRows.map((raw) => makeRow(section, raw)) : [];
        if (rows.length === 0 && canEdit) rows.push(makeRow(section, null));
        values[key] = rows;
      } else {
        for (const field of section.fields) {
          const raw = source[field.code];
          values[field.code] = field.widget === 'readonly'
            ? (raw ?? auth.user?.email ?? null)
            : hydrateValue(field, raw);
        }
      }
    }

    markClean();
  }

  function clearErrors(): void {
    formError.value = null;
    errorSummary.value = [];
    for (const key of Object.keys(fieldErrors)) delete fieldErrors[key];
    for (const key of Object.keys(rowErrors)) delete rowErrors[key];
  }

  /** 用户开始改字段时只收起顶部汇总，保留其他字段的行内错误 */
  function clearSummary(): void {
    formError.value = null;
    errorSummary.value = [];
  }

  function parseIssuePath(path: string): ParsedIssuePath {
    if (path.startsWith('values.')) return { kind: 'scalar', code: path.slice('values.'.length) };
    const match = /^(.*?)\[(\d+)\]\.(.+)$/.exec(path);
    if (!match || !schema.value) return null;
    const section = schema.value.sections.find((item) => item.titleEn === match[1]);
    if (!section) return null;
    return {
      kind: 'row',
      sectionCode: section.code,
      index: Number(match[2]),
      code: match[3] as string,
    };
  }

  function applyIssues(issues: readonly IssueLike[], fromServer = false): void {
    const summary: string[] = [];
    for (const issue of issues) {
      const target = parseIssuePath(issue.path);
      const field = target ? fieldMap.value.get(target.code) : undefined;
      const label = field?.labelEn;
      const text = fromServer ? issueMessage(issue.code, label) : issue.message;

      if (target?.kind === 'scalar') {
        fieldErrors[target.code] = text;
        summary.push(
          label && !text.toLowerCase().includes(label.toLowerCase()) ? `${label}: ${text}` : text,
        );
      } else if (target?.kind === 'row') {
        rowErrors[`${target.sectionCode}:${target.index}:${target.code}`] = text;
        const section = schema.value?.sections.find((item) => item.code === target.sectionCode);
        summary.push(`${section?.titleEn ?? 'Section'} ${target.index + 1}: ${text}`);
      } else {
        summary.push(text);
      }
    }

    errorSummary.value = summary;
    if (summary.length > 0 && !formError.value) {
      formError.value = 'Please fix the highlighted fields.';
    }
  }

  function applyError(error: unknown): void {
    if (error instanceof ApiError) {
      formError.value = error.message;
      if (error.fieldIssues.length > 0) applyIssues(error.fieldIssues, true);
      return;
    }
    formError.value = APPLICATION_MESSAGES.saveFailed;
  }

  function validateForSubmit(): FieldIssue[] {
    const currentSchema = schema.value;
    if (!currentSchema) return [];

    const issues: FieldIssue[] = [];
    for (const section of currentSchema.sections) {
      if (section.isRepeatable) continue;
      for (const field of section.fields) {
        if (field.widget === 'readonly') continue;
        if (isFieldRequired(field) && isNil(values[field.code])) {
          issues.push({
            path: `values.${field.code}`,
            code: 'required',
            message: `${field.labelEn} is required.`,
          });
        }
      }
    }

    const firstProgram = values['programFirstId'];
    const secondProgram = values['programSecondId'];
    const firstSupervisor = values['supervisorFirstId'];
    const secondSupervisor = values['supervisorSecondId'];

    if (!isNil(secondProgram) && isNil(firstProgram)) {
      issues.push({
        path: 'values.programSecondId',
        code: 'missing_dependency',
        message: 'Please select a first choice program before a second choice.',
      });
    }
    if (
      !isNil(firstProgram) &&
      !isNil(secondProgram) &&
      String(firstProgram) === String(secondProgram)
    ) {
      issues.push({
        path: 'values.programSecondId',
        code: 'duplicate_program',
        message: 'The two program choices must be different.',
      });
    }
    if (!isNil(firstSupervisor) && isNil(firstProgram)) {
      issues.push({
        path: 'values.supervisorFirstId',
        code: 'missing_dependency',
        message: 'Please select a first choice program first.',
      });
    }
    if (!isNil(secondSupervisor) && isNil(secondProgram)) {
      issues.push({
        path: 'values.supervisorSecondId',
        code: 'missing_dependency',
        message: 'Please select a second choice program first.',
      });
    }
    if (
      !isNil(firstSupervisor) &&
      !isNil(secondSupervisor) &&
      Number(firstSupervisor) === Number(secondSupervisor)
    ) {
      issues.push({
        path: 'values.supervisorSecondId',
        code: 'duplicate_supervisor',
        message: 'The two supervisor choices must be different.',
      });
    }

    return issues;
  }

  async function initialize(targetId: string | null): Promise<{ redirectTo: string | null }> {
    loading.value = true;
    loadError.value = null;
    formError.value = null;
    clearErrors();

    try {
      const schemaPromise = schema.value ? Promise.resolve(schema.value) : applicationApi.schema();
      const dataPromise = targetId ? applicationApi.detail(targetId) : applicationApi.mine();
      const [loadedSchema, data] = await Promise.all([schemaPromise, dataPromise]);
      schema.value = loadedSchema;

      // schema 刚加载、values 还没 hydrate 时，buildPayload 会得到一份全空表单；
      // 这里先标记 clean，避免 /new → 已有申请详情 的自动跳转被「未保存修改」拦截。
      markClean();

      // /applications/new：账号下已有申请 -> 让调用方 replace 到详情 URL
      if (!targetId && data) return { redirectTo: data.id };

      detail.value = data ?? null;
      hydrate();
      lastSavedAt.value = detail.value?.updatedAt ?? null;
      return { redirectTo: null };
    } catch (error) {
      loadError.value = error instanceof ApiError
        ? error.message
        : 'Unable to load this application.';
      return { redirectTo: null };
    } finally {
      loading.value = false;
    }
  }

  async function persist(): Promise<ApplicationDetail | null> {
    if (!canSave.value) return null;
    saving.value = true;
    clearErrors();
    try {
      const payload = buildPayload();
      const result = detail.value
        ? await applicationApi.save(detail.value.id, payload)
        : await applicationApi.create(payload);
      detail.value = result;
      lastSavedAt.value = new Date().toISOString();
      markClean();
      return result;
    } catch (error) {
      applyError(error);
      return null;
    } finally {
      saving.value = false;
    }
  }

  async function save(): Promise<boolean> {
    if (!canSave.value || saving.value || submitting.value) return false;
    return (await persist()) !== null;
  }

  async function submit(): Promise<boolean> {
    if (!canSubmit.value || saving.value || submitting.value) return false;
    clearErrors();
    const issues = validateForSubmit();
    if (issues.length > 0) {
      applyIssues(issues);
      return false;
    }

    const saved = await persist();
    if (!saved) return false;

    submitting.value = true;
    try {
      const result = await applicationApi.submit(saved.id);
      detail.value = result;
      lastSavedAt.value = new Date().toISOString();
      markClean();
      return true;
    } catch (error) {
      applyError(error);
      return false;
    } finally {
      submitting.value = false;
    }
  }

  async function resubmit(): Promise<boolean> {
    if (!canResubmit.value || saving.value || submitting.value) return false;
    clearErrors();
    const issues = validateForSubmit();
    if (issues.length > 0) {
      applyIssues(issues);
      return false;
    }

    const saved = await persist();
    if (!saved) return false;

    submitting.value = true;
    try {
      const result = await applicationApi.resubmit(saved.id);
      detail.value = result;
      lastSavedAt.value = new Date().toISOString();
      markClean();
      return true;
    } catch (error) {
      applyError(error);
      return false;
    } finally {
      submitting.value = false;
    }
  }

  return {
    schema,
    detail,
    values,
    loading,
    saving,
    submitting,
    loadError,
    formError,
    errorSummary,
    fieldErrors,
    rowErrors,
    lastSavedAt,
    dirty,
    isNew,
    editable,
    isReadonly,
    canSave,
    canSubmit,
    canResubmit,
    status,
    displayStatus,
    applicationNumber,
    fieldMap,
    initialize,
    save,
    submit,
    resubmit,
    isFieldRequired,
    clearSummary,
  };
}
