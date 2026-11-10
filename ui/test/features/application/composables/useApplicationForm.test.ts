// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { ApiError } from '@/api/problem';
import type { ApplicationDetail, FormSchema } from '@/types/application';

vi.mock('@/api/application', () => ({
  applicationApi: {
    schema: vi.fn(),
    mine: vi.fn(),
    detail: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    submit: vi.fn(),
    resubmit: vi.fn(),
  },
}));

import { applicationApi } from '@/api/application';
import { useApplicationForm } from '@/features/application/composables/useApplicationForm';
import { useAuthStore } from '@/stores/auth';
import { makeDetail, makeField, makeSchema, makeSection, makeUser } from '../../../helpers/fixtures';

const api = {
  schema: vi.mocked(applicationApi.schema),
  mine: vi.mocked(applicationApi.mine),
  detail: vi.mocked(applicationApi.detail),
  create: vi.mocked(applicationApi.create),
  save: vi.mocked(applicationApi.save),
  submit: vi.mocked(applicationApi.submit),
  resubmit: vi.mocked(applicationApi.resubmit),
};

const schema: FormSchema = makeSchema({
  sections: [
    makeSection({
      code: 'PERSONAL',
      titleEn: 'Personal Information',
      fields: [
        makeField({ code: 'email', labelEn: 'Email Address', widget: 'readonly' }),
        makeField({
          code: 'nameEn',
          labelEn: 'Name in English',
          widget: 'free_text',
          isRequired: true,
          maxLength: 100,
        }),
        makeField({
          code: 'programFirstId',
          labelEn: 'First Choice Program',
          widget: 'single_choice',
          optionsSource: 'programs',
        }),
        makeField({
          code: 'programSecondId',
          labelEn: 'Second Choice Program',
          widget: 'single_choice',
          optionsSource: 'programs',
        }),
        makeField({
          code: 'supervisorFirstId',
          labelEn: 'First Choice Supervisor',
          widget: 'single_choice',
          optionsSource: 'supervisors_by_thrust',
        }),
        makeField({
          code: 'supervisorSecondId',
          labelEn: 'Second Choice Supervisor',
          widget: 'single_choice',
          optionsSource: 'supervisors_by_thrust',
        }),
        makeField({
          code: 'hasScholarship',
          labelEn: 'Scholarship',
          widget: 'checkbox',
          valueType: 'boolean',
        }),
        makeField({
          code: 'scholarshipAmount',
          labelEn: 'Scholarship Amount',
          widget: 'number',
          valueType: 'number',
          dependsOnField: 'hasScholarship',
        }),
        makeField({ code: 'gpa', labelEn: 'GPA', widget: 'number', valueType: 'number' }),
        makeField({
          code: 'birthDate',
          labelEn: 'Date of Birth',
          widget: 'date',
          valueType: 'date',
        }),
      ],
    }),
    makeSection({
      code: 'EXPERIENCE',
      titleEn: 'Experience',
      isRepeatable: true,
      payloadKey: 'experiences',
      fields: [
        makeField({ code: 'organisation', labelEn: 'Organisation', sectionCode: 'EXPERIENCE' }),
        makeField({
          code: 'year',
          labelEn: 'Year',
          sectionCode: 'EXPERIENCE',
          widget: 'number',
          valueType: 'number',
        }),
      ],
    }),
  ],
});

function storedValues(): Record<string, unknown> {
  return {
    email: 'stored@example.com',
    nameEn: ' Alice ',
    gpa: '3.5',
    birthDate: '2026-01-02T00:00:00.000Z',
    experiences: [{ organisation: 'HKUST', year: '2024' }],
  };
}

function editableDetail(overrides: Partial<ApplicationDetail> = {}): ApplicationDetail {
  return makeDetail({
    id: 'app-1',
    applicationNumber: 'SC-2026-0001',
    status: 'Draft',
    displayStatus: 'Draft',
    editable: true,
    actions: ['save', 'submit'],
    values: storedValues(),
    ...overrides,
  });
}

function createForm() {
  setActivePinia(createPinia());
  const auth = useAuthStore();
  auth.status = 'authenticated';
  auth.user = makeUser();
  return { auth, form: useApplicationForm() };
}

describe('useApplicationForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.schema.mockResolvedValue(schema);
  });

  it('hydrates the form from the server and starts clean', async () => {
    api.detail.mockResolvedValue(editableDetail());
    const { form } = createForm();

    const result = await form.initialize('app-1');

    expect(result).toEqual({ redirectTo: null });
    expect(form.loading.value).toBe(false);
    expect(form.isNew.value).toBe(false);
    expect(form.editable.value).toBe(true);
    expect(form.isReadonly.value).toBe(false);
    expect(form.status.value).toBe('Draft');
    expect(form.applicationNumber.value).toBe('SC-2026-0001');

    expect(form.values.email).toBe('stored@example.com');
    expect(form.values.nameEn).toBe(' Alice ');
    expect(form.values.gpa).toBe(3.5);
    expect(form.values.birthDate).toBe('2026-01-02');

    const rows = form.values.experiences as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].organisation).toBe('HKUST');
    expect(rows[0].year).toBe(2024);
    expect(typeof rows[0]._key).toBe('string');

    expect(form.dirty.value).toBe(false);
    expect(form.canSave.value).toBe(true);
    expect(form.canSubmit.value).toBe(true);
    expect(form.canResubmit.value).toBe(false);
  });

  it('starts a new application with the login email and one empty repeatable row', async () => {
    api.mine.mockResolvedValue(null);
    const { form } = createForm();

    await form.initialize(null);

    expect(form.isNew.value).toBe(true);
    expect(form.detail.value).toBeNull();
    expect(form.editable.value).toBe(true);
    expect(form.canSave.value).toBe(true);
    expect(form.canSubmit.value).toBe(true);
    expect(form.applicationNumber.value).toBe('—');
    expect(form.values.email).toBe('alice@example.com');

    const rows = form.values.experiences as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0].organisation).toBeNull();
    expect(form.dirty.value).toBe(false);
  });

  it('does not create a blank row when drafting is not allowed', async () => {
    api.schema.mockResolvedValue(makeSchema({ sections: schema.sections, canSaveDraft: false }));
    api.mine.mockResolvedValue(null);
    const { form } = createForm();

    await form.initialize(null);

    expect(form.editable.value).toBe(false);
    expect(form.canSave.value).toBe(false);
    expect(form.canSubmit.value).toBe(false);
    expect(form.values.experiences).toEqual([]);
  });

  it('redirects to the existing application when opening /applications/new', async () => {
    api.mine.mockResolvedValue(editableDetail({ id: 'existing-id' }));
    const { form } = createForm();

    const result = await form.initialize(null);

    expect(result).toEqual({ redirectTo: 'existing-id' });
    expect(form.detail.value).toBeNull();
    expect(form.loading.value).toBe(false);
  });

  it('exposes a readable load error instead of throwing', async () => {
    api.detail.mockRejectedValue(new ApiError('not_found', 404, 'The requested resource was not found.'));
    const { form } = createForm();

    const result = await form.initialize('missing');

    expect(result).toEqual({ redirectTo: null });
    expect(form.loadError.value).toBe('The requested resource was not found.');
    expect(form.loading.value).toBe(false);
    expect(form.detail.value).toBeNull();
  });

  it('requires a field only when its dependency is filled', async () => {
    api.mine.mockResolvedValue(null);
    const { form } = createForm();
    await form.initialize(null);

    const amount = makeField({
      code: 'scholarshipAmount',
      isRequired: false,
      dependsOnField: 'hasScholarship',
    });

    expect(form.isFieldRequired(amount)).toBe(false);

    form.values.hasScholarship = true;
    expect(form.isFieldRequired(amount)).toBe(true);

    form.values.hasScholarship = '';
    expect(form.isFieldRequired(amount)).toBe(false);
  });

  it('saves an existing application with a normalised payload', async () => {
    const detail = editableDetail();
    api.detail.mockResolvedValue(detail);
    api.save.mockResolvedValue({ ...detail, updatedAt: '2026-02-02T00:00:00.000Z' });
    const { form } = createForm();
    await form.initialize('app-1');

    form.values.nameEn = '  Bob  ';
    form.values.experiences = [];
    expect(form.dirty.value).toBe(true);

    const saved = await form.save();

    expect(saved).toBe(true);
    expect(api.save).toHaveBeenCalledTimes(1);
    const [id, payload] = api.save.mock.calls[0];
    expect(id).toBe('app-1');
    expect(payload.nameEn).toBe('Bob');
    expect(payload).not.toHaveProperty('email');
    expect(payload.experiences).toEqual([]);
    expect(payload.gpa).toBe(3.5);
    expect(payload.birthDate).toBe('2026-01-02');
    expect(form.dirty.value).toBe(false);
    expect(form.lastSavedAt.value).not.toBeNull();
  });

  it('creates a draft on the first save', async () => {
    api.mine.mockResolvedValue(null);
    const created = editableDetail({ id: 'created-id', values: { nameEn: 'Alice' } });
    api.create.mockResolvedValue(created);
    const { form } = createForm();
    await form.initialize(null);

    form.values.nameEn = 'Alice';
    const saved = await form.save();

    expect(saved).toBe(true);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.save).not.toHaveBeenCalled();
    expect(form.detail.value?.id).toBe('created-id');
    expect(form.isNew.value).toBe(false);
  });

  it('refuses to save a read-only application', async () => {
    api.detail.mockResolvedValue(
      editableDetail({ editable: false, actions: [], status: 'OfferAccepted' }),
    );
    const { form } = createForm();
    await form.initialize('app-1');

    expect(form.canSave.value).toBe(false);
    await expect(form.save()).resolves.toBe(false);
    expect(api.save).not.toHaveBeenCalled();
  });

  it('maps server field issues onto the matching fields and rows', async () => {
    const detail = editableDetail();
    api.detail.mockResolvedValue(detail);
    api.save.mockRejectedValue(
      new ApiError('validation_failed', 422, 'Please check the information you entered.', [
        { path: 'values.nameEn', code: 'required', message: 'nameEn 不能为空' },
        { path: 'Experience[0].organisation', code: 'too_long', message: '太长' },
        { path: 'unknown[0].x', code: 'required', message: '其他错误' },
      ]),
    );
    const { form } = createForm();
    await form.initialize('app-1');

    await expect(form.save()).resolves.toBe(false);

    expect(form.formError.value).toBe('Please check the information you entered.');
    expect(form.fieldErrors.nameEn).toBe('Name in English is required.');
    expect(form.rowErrors['EXPERIENCE:0:organisation']).toBe('Organisation is too long.');
    expect(form.errorSummary.value).toEqual([
      'Name in English is required.',
      'Experience 1: Organisation is too long.',
      'This field is required.',
    ]);
  });

  it('validates required fields and cross-field choices before submitting', async () => {
    api.detail.mockResolvedValue(editableDetail({ values: {} }));
    const { form } = createForm();
    await form.initialize('app-1');

    form.values.programSecondId = 'P2';
    form.values.supervisorFirstId = 7;
    form.values.supervisorSecondId = 7;

    const ok = await form.submit();

    expect(ok).toBe(false);
    expect(api.save).not.toHaveBeenCalled();
    expect(api.submit).not.toHaveBeenCalled();
    expect(form.fieldErrors.nameEn).toBe('Name in English is required.');
    const summary = form.errorSummary.value.join(' | ');
    expect(summary).toContain('Please select a first choice program before a second choice.');
    expect(summary).toContain('The two supervisor choices must be different.');
    expect(summary).toContain('Please select a first choice program first.');
    expect(form.formError.value).toBe('Please fix the highlighted fields.');
  });

  it('rejects two identical program choices', async () => {
    api.detail.mockResolvedValue(editableDetail({ values: {} }));
    const { form } = createForm();
    await form.initialize('app-1');

    form.values.nameEn = 'Alice';
    form.values.programFirstId = 'P1';
    form.values.programSecondId = 'P1';

    await expect(form.submit()).resolves.toBe(false);

    expect(form.errorSummary.value.join(' | ')).toContain(
      'The two program choices must be different.',
    );
    expect(api.submit).not.toHaveBeenCalled();
  });

  it('saves then submits, and reflects the new status', async () => {
    const detail = editableDetail();
    api.detail.mockResolvedValue(detail);
    api.save.mockResolvedValue(detail);
    api.submit.mockResolvedValue({
      ...detail,
      status: 'PendingForPreliminaryScreening',
      displayStatus: 'Pending For Preliminary Screening',
      actions: [],
      editable: false,
    });
    const { form } = createForm();
    await form.initialize('app-1');

    const ok = await form.submit();

    expect(ok).toBe(true);
    expect(api.save).toHaveBeenCalledTimes(1);
    expect(api.submit).toHaveBeenCalledWith('app-1');
    expect(form.status.value).toBe('PendingForPreliminaryScreening');
    expect(form.editable.value).toBe(false);
    expect(form.submitting.value).toBe(false);
  });

  it('resubmits a returned application', async () => {
    const detail = editableDetail({ status: 'Returned', actions: ['save', 'resubmit'] });
    api.detail.mockResolvedValue(detail);
    api.save.mockResolvedValue(detail);
    api.resubmit.mockResolvedValue({
      ...detail,
      status: 'PendingForPreliminaryScreening',
      actions: [],
      editable: false,
    });
    const { form } = createForm();
    await form.initialize('app-1');

    expect(form.canResubmit.value).toBe(true);
    const ok = await form.resubmit();

    expect(ok).toBe(true);
    expect(api.resubmit).toHaveBeenCalledWith('app-1');
    expect(form.status.value).toBe('PendingForPreliminaryScreening');
  });

  it('clears the summary without touching the inline field errors', async () => {
    const detail = editableDetail();
    api.detail.mockResolvedValue(detail);
    api.save.mockRejectedValue(
      new ApiError('validation_failed', 422, 'Please check the information you entered.', [
        { path: 'values.nameEn', code: 'required', message: 'nameEn 不能为空' },
      ]),
    );
    const { form } = createForm();
    await form.initialize('app-1');
    await form.save();

    form.clearSummary();

    expect(form.formError.value).toBeNull();
    expect(form.errorSummary.value).toEqual([]);
    expect(form.fieldErrors.nameEn).toBe('Name in English is required.');
  });

  it('clears all errors before the next attempt', async () => {
    const detail = editableDetail();
    api.detail.mockResolvedValue(detail);
    api.save.mockRejectedValueOnce(
      new ApiError('validation_failed', 422, 'Please check the information you entered.', [
        { path: 'values.nameEn', code: 'required', message: 'nameEn 不能为空' },
      ]),
    );
    api.save.mockResolvedValue(detail);
    const { form } = createForm();
    await form.initialize('app-1');
    await form.save();

    await form.save();

    expect(form.formError.value).toBeNull();
    expect(form.fieldErrors.nameEn).toBeUndefined();
    expect(form.errorSummary.value).toEqual([]);
  });
});
