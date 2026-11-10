// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { flushPromises, mount } from '@vue/test-utils';
import dayjs from 'dayjs';
import type { FormFieldConfig, FormSchema } from '@/types/application';
import FormField from '@/features/application/components/FormField.vue';
import SupervisorSelect from '@/features/application/components/SupervisorSelect.vue';
import {
  ACheckboxStub,
  ADatePickerStub,
  AInputNumberStub,
  AInputStub,
  ASelectStub,
  ATextareaStub,
  antdStubs,
} from '../../../helpers/stubs';
import { makeField, makeSchema, makeSupervisorOption } from '../../../helpers/fixtures';

const api = vi.hoisted(() => ({ searchSupervisors: vi.fn() }));
vi.mock('@/api/application', () => ({ applicationApi: api }));

const SupervisorSelectStub = defineComponent({
  name: 'SupervisorSelectStub',
  props: {
    modelValue: { type: Number, default: null },
    programCode: { type: String, default: null },
    excludeId: { type: Number, default: null },
    disabled: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  setup() {
    return () => h('div', { class: 'supervisor-select-stub' });
  },
});

const schema: FormSchema = makeSchema();

interface FieldProps {
  field: FormFieldConfig;
  modelValue: unknown;
  schema?: FormSchema;
  disabled?: boolean;
  compact?: boolean;
  programCode?: string | null;
  excludeSupervisorId?: number | null;
  excludeOptionValue?: string | number | null;
  presentation?: 'control' | 'text';
  valueLabel?: string | null;
}

function mountField(props: FieldProps) {
  return mount(FormField, {
    props: { schema, ...props },
    global: {
      stubs: {
        ...antdStubs,
        SupervisorSelect: SupervisorSelectStub,
      },
    },
  });
}

describe('FormField (control mode)', () => {
  it('binds a free-text field and forwards the max length', async () => {
    const field = makeField({ code: 'nameEn', widget: 'free_text', maxLength: 50 });
    const wrapper = mountField({ field, modelValue: 'Alice' });
    const input = wrapper.findComponent(AInputStub);

    expect(input.props('value')).toBe('Alice');
    expect(input.props('maxlength')).toBe(50);
    expect(input.props('disabled')).toBe(false);

    await input.find('input').setValue('Bob');

    expect(wrapper.emitted('update:modelValue')).toEqual([['Bob']]);
  });

  it('binds a long-text field to a textarea', async () => {
    const field = makeField({ code: 'question1', widget: 'long_text', maxLength: 200 });
    const wrapper = mountField({ field, modelValue: 'Because' });
    const textarea = wrapper.findComponent(ATextareaStub);

    expect(textarea.props('value')).toBe('Because');
    expect(textarea.props('maxlength')).toBe(200);

    await textarea.find('textarea').setValue('Because I like it');

    expect(wrapper.emitted('update:modelValue')).toEqual([['Because I like it']]);
  });

  it('parses numbers and maps invalid or empty input to null', async () => {
    const field = makeField({ code: 'gpa', widget: 'number', valueType: 'number' });
    const wrapper = mountField({ field, modelValue: 3.5 });

    expect(wrapper.findComponent(AInputNumberStub).props('value')).toBe(3.5);

    await wrapper.findComponent(AInputNumberStub).find('input').setValue('4.25');
    await wrapper.findComponent(AInputNumberStub).find('input').setValue('abc');
    await wrapper.findComponent(AInputNumberStub).find('input').setValue('');

    expect(wrapper.emitted('update:modelValue')).toEqual([[4.25], [null], [null]]);
  });

  it('formats the date for the picker and emits the YYYY-MM-DD string', async () => {
    const field = makeField({ code: 'birthDate', widget: 'date', valueType: 'date' });
    const wrapper = mountField({ field, modelValue: '2026-01-02T10:00:00.000Z' });
    const picker = wrapper.findComponent(ADatePickerStub);

    expect(wrapper.find('.stub-date-picker').attributes('data-value')).toBe('2026-01-02');

    picker.vm.$emit('update:value', dayjs('2026-03-04'));
    picker.vm.$emit('update:value', null);

    expect(wrapper.emitted('update:modelValue')).toEqual([['2026-03-04'], [null]]);
  });

  it('ignores invalid dates instead of showing an invalid picker value', () => {
    const field = makeField({ code: 'birthDate', widget: 'date', valueType: 'date' });
    const wrapper = mountField({ field, modelValue: 'not-a-date' });

    expect(wrapper.find('.stub-date-picker').attributes('data-value')).toBe('');
  });

  it('renders the schema options for a single choice', () => {
    const field = makeField({
      code: 'exam',
      widget: 'single_choice',
      options: [
        { value: 'ielts', labelEn: 'IELTS' },
        { value: 'toefl', labelEn: 'TOEFL' },
      ],
    });
    const wrapper = mountField({ field, modelValue: 'ielts' });
    const select = wrapper.findComponent(ASelectStub);

    expect(select.props('options')).toEqual([
      { label: 'IELTS', value: 'ielts' },
      { label: 'TOEFL', value: 'toefl' },
    ]);
    expect(select.props('value')).toBe('ielts');
  });

  it('builds the program options from the schema and drops the excluded one', () => {
    const field = makeField({
      code: 'programSecondId',
      widget: 'single_choice',
      optionsSource: 'programs',
    });
    const wrapper = mountField({ field, modelValue: 'P1', excludeOptionValue: 'P1' });
    const select = wrapper.findComponent(ASelectStub);

    expect(select.props('options')).toEqual([{ label: 'Program Two', value: 'P2' }]);
  });

  it('emits a string for choices and null when the selection is cleared', () => {
    const field = makeField({
      code: 'exam',
      widget: 'single_choice',
      options: [{ value: 'ielts', labelEn: 'IELTS' }],
    });
    const wrapper = mountField({ field, modelValue: null });
    const select = wrapper.findComponent(ASelectStub);

    select.vm.$emit('update:value', 'ielts');
    select.vm.$emit('update:value', undefined);

    expect(wrapper.emitted('update:modelValue')).toEqual([['ielts'], [null]]);
  });

  it('converts a boolean choice between the string options and real booleans', () => {
    const field = makeField({
      code: 'hasScholarship',
      widget: 'single_choice',
      valueType: 'boolean',
      options: [
        { value: 'true', labelEn: 'Yes' },
        { value: 'false', labelEn: 'No' },
      ],
    });
    const wrapper = mountField({ field, modelValue: true });
    const select = wrapper.findComponent(ASelectStub);

    expect(select.props('value')).toBe('true');

    select.vm.$emit('update:value', 'false');
    select.vm.$emit('update:value', 'true');
    select.vm.$emit('update:value', undefined);

    expect(wrapper.emitted('update:modelValue')).toEqual([[false], [true], [null]]);
  });

  it('shows an unchecked boolean choice as empty', () => {
    const field = makeField({ code: 'flag', widget: 'single_choice', valueType: 'boolean' });
    const wrapper = mountField({ field, modelValue: null });

    expect(wrapper.findComponent(ASelectStub).props('value')).toBeUndefined();
  });

  it('renders a checkbox and emits its checked state', async () => {
    const field = makeField({ code: 'statementAccepted', widget: 'checkbox', valueType: 'boolean' });
    const wrapper = mountField({ field, modelValue: true });
    const checkbox = wrapper.findComponent(ACheckboxStub);

    expect(checkbox.props('checked')).toBe(true);

    await checkbox.find('input').setValue(false);

    expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
  });

  it('renders the read-only email input always disabled', () => {
    const field = makeField({ code: 'email', widget: 'readonly' });
    const wrapper = mountField({ field, modelValue: 'alice@example.com', disabled: false });
    const input = wrapper.findComponent(AInputStub);

    expect(input.props('disabled')).toBe(true);
    expect(input.props('value')).toBe('alice@example.com');
  });

  it('falls back to a disabled placeholder for unsupported widgets', () => {
    const field = makeField({ code: 'attachment', widget: 'upload' });
    const wrapper = mountField({ field, modelValue: 'file.pdf' });
    const input = wrapper.findComponent(AInputStub);

    expect(input.props('disabled')).toBe(true);
    expect(input.props('value')).toBe('file.pdf');
    expect(input.attributes('placeholder')).toBe('This field type is not supported yet');
  });

  it('hints the expected URL format', () => {
    const field = makeField({ code: 'portfolio', widget: 'url' });
    const wrapper = mountField({ field, modelValue: '' });

    expect(wrapper.findComponent(AInputStub).attributes('placeholder')).toBe('https://');
  });

  it('delegates supervisor fields to SupervisorSelect with the program context', () => {
    const field = makeField({
      code: 'supervisorFirstId',
      widget: 'single_choice',
      optionsSource: 'supervisors_by_thrust',
    });
    const wrapper = mountField({
      field,
      modelValue: 5,
      programCode: 'P1',
      excludeSupervisorId: 3,
    });
    const select = wrapper.findComponent(SupervisorSelectStub);

    expect(select.props('modelValue')).toBe(5);
    expect(select.props('programCode')).toBe('P1');
    expect(select.props('excludeId')).toBe(3);

    select.vm.$emit('update:modelValue', 8);

    expect(wrapper.emitted('update:modelValue')).toEqual([[8]]);
  });

  it('forwards the disabled state to the underlying control', () => {
    const field = makeField({ code: 'nameEn', widget: 'free_text' });
    const wrapper = mountField({ field, modelValue: 'Alice', disabled: true });

    expect(wrapper.findComponent(AInputStub).props('disabled')).toBe(true);
  });
});

describe('FormField (text presentation)', () => {
  function mountText(field: FormFieldConfig, modelValue: unknown, valueLabel: string | null = null) {
    return mountField({ field, modelValue, presentation: 'text', valueLabel });
  }

  it('shows an em dash for an empty value', () => {
    const wrapper = mountText(makeField({ code: 'nameEn' }), null);

    expect(wrapper.text()).toBe('—');
    expect(wrapper.find('.form-field__text--empty').exists()).toBe(true);
  });

  it('shows plain text for free-text fields', () => {
    const wrapper = mountText(makeField({ code: 'nameEn' }), 'Alice');

    expect(wrapper.text()).toBe('Alice');
    expect(wrapper.find('a').exists()).toBe(false);
  });

  it('resolves the option label for single choices', () => {
    const field = makeField({
      code: 'exam',
      widget: 'single_choice',
      options: [{ value: 'ielts', labelEn: 'IELTS' }],
    });

    expect(mountText(field, 'ielts').text()).toBe('IELTS');
    expect(mountText(field, 'legacy').text()).toBe('legacy');
  });

  it('resolves program labels from the schema', () => {
    const field = makeField({
      code: 'programFirstId',
      widget: 'single_choice',
      optionsSource: 'programs',
    });

    expect(mountText(field, 'P1').text()).toBe('Program One');
  });

  it('renders booleans as Yes / No', () => {
    const field = makeField({
      code: 'hasScholarship',
      widget: 'single_choice',
      valueType: 'boolean',
    });

    expect(mountText(field, true).text()).toBe('Yes');
    expect(mountText(field, 'true').text()).toBe('Yes');
    expect(mountText(field, 'false').text()).toBe('No');

    const checkbox = makeField({ code: 'agreed', widget: 'checkbox', valueType: 'boolean' });
    expect(mountText(checkbox, true).text()).toBe('Yes');
    expect(mountText(checkbox, false).text()).toBe('No');
  });

  it('shows only the date part of a date field', () => {
    const field = makeField({ code: 'birthDate', widget: 'date', valueType: 'date' });

    expect(mountText(field, '2026-01-02T10:00:00.000Z').text()).toBe('2026-01-02');
  });

  it('turns a valid URL into a safe external link', () => {
    const wrapper = mountText(makeField({ code: 'portfolio', widget: 'url' }), 'https://example.com/x');
    const link = wrapper.find('a');

    expect(link.attributes('href')).toBe('https://example.com/x');
    expect(link.attributes('target')).toBe('_blank');
    expect(link.attributes('rel')).toBe('noopener noreferrer');
  });

  it('keeps an invalid URL as plain text', () => {
    const wrapper = mountText(makeField({ code: 'portfolio', widget: 'url' }), 'example.com/x');

    expect(wrapper.find('a').exists()).toBe(false);
    expect(wrapper.text()).toBe('example.com/x');
  });

  it('prefers the explicit value label (e.g. supervisor name)', () => {
    const field = makeField({
      code: 'supervisorFirstId',
      widget: 'single_choice',
      optionsSource: 'supervisors_by_thrust',
    });

    expect(mountText(field, 5, 'Prof. One').text()).toBe('Prof. One');
  });
});

describe('SupervisorSelect', () => {
  function mountSelect(
    props: Partial<{
      modelValue: number | null;
      programCode: string | null;
      excludeId: number | null;
      disabled: boolean;
    }> = {},
  ) {
    return mount(SupervisorSelect, {
      props: { modelValue: null, programCode: null, ...props },
      global: { stubs: antdStubs },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    api.searchSupervisors.mockResolvedValue([
      makeSupervisorOption({ id: 1, name: 'Prof. One' }),
      makeSupervisorOption({ id: 2, name: 'Prof. Two' }),
    ]);
  });

  it('stays disabled until a program is chosen', () => {
    const wrapper = mountSelect({ programCode: null });

    expect(wrapper.findComponent(ASelectStub).props('disabled')).toBe(true);
    expect(wrapper.findComponent(ASelectStub).props('placeholder')).toBe(
      'Please select a program first',
    );
    expect(api.searchSupervisors).not.toHaveBeenCalled();
  });

  it('loads the supervisors of the chosen program on mount', async () => {
    const wrapper = mountSelect({ programCode: 'P1' });
    await flushPromises();

    expect(api.searchSupervisors).toHaveBeenCalledWith('P1', '', 50);
    expect(wrapper.findComponent(ASelectStub).props('options')).toEqual([
      { label: 'Prof. One', value: 1 },
      { label: 'Prof. Two', value: 2 },
    ]);
    expect(wrapper.findComponent(ASelectStub).props('placeholder')).toBe(
      'Type a name to search',
    );
  });

  it('hides the supervisor already chosen as first choice', async () => {
    const wrapper = mountSelect({ programCode: 'P1', excludeId: 1 });
    await flushPromises();

    expect(wrapper.findComponent(ASelectStub).props('options')).toEqual([
      { label: 'Prof. Two', value: 2 },
    ]);
  });

  it('marks supervisors whose quota is full as disabled', async () => {
    api.searchSupervisors.mockResolvedValue([
      makeSupervisorOption({ id: 1, name: 'Prof. One', isFull: true, remaining: 0 }),
      makeSupervisorOption({ id: 2, name: 'Prof. Two', isFull: false, remaining: 3 }),
    ]);
    const wrapper = mountSelect({ programCode: 'P1' });
    await flushPromises();

    expect(wrapper.findComponent(ASelectStub).props('options')).toEqual([
      { label: 'Prof. One (Full)', value: 1, disabled: true },
      { label: 'Prof. Two', value: 2 },
    ]);
  });

  it('clears the selection when the excluded supervisor is selected', async () => {
    const wrapper = mountSelect({ programCode: 'P1', modelValue: 1 });
    await flushPromises();

    await wrapper.setProps({ excludeId: 1 });

    expect(wrapper.emitted('update:modelValue')).toContainEqual([null]);
  });

  it('keeps a current value that is not part of the search results', async () => {
    const wrapper = mountSelect({ programCode: 'P1', modelValue: 99 });
    await flushPromises();

    expect(wrapper.findComponent(ASelectStub).props('options')).toContainEqual({
      label: 'Supervisor #99',
      value: 99,
    });
  });

  it('refetches and clears the value when the program changes', async () => {
    const wrapper = mountSelect({ programCode: 'P1', modelValue: 2 });
    await flushPromises();
    api.searchSupervisors.mockResolvedValue([makeSupervisorOption({ id: 7, name: 'Prof. Seven' })]);

    await wrapper.setProps({ programCode: 'P2' });
    await flushPromises();

    expect(wrapper.emitted('update:modelValue')).toContainEqual([null]);
    expect(api.searchSupervisors).toHaveBeenLastCalledWith('P2', '', 50);
    // 旧 program 的候选列表被新结果替换（当前值 2 仍由父组件持有，故会补一条占位）
    const optionValues = (
      wrapper.findComponent(ASelectStub).props('options') as Array<{ value: number }>
    ).map((option) => option.value);
    expect(optionValues).toContain(7);
    expect(optionValues).not.toContain(1);
  });

  it('debounces the keyword search by 300ms', async () => {
    const wrapper = mountSelect({ programCode: 'P1' });
    await flushPromises();
    api.searchSupervisors.mockClear();

    vi.useFakeTimers();
    const select = wrapper.findComponent(ASelectStub);
    select.vm.$emit('search', 'Pro');
    select.vm.$emit('search', 'Prof');
    vi.advanceTimersByTime(299);
    expect(api.searchSupervisors).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    vi.useRealTimers();
    await flushPromises();

    expect(api.searchSupervisors).toHaveBeenCalledTimes(1);
    expect(api.searchSupervisors).toHaveBeenCalledWith('P1', 'Prof', 50);
  });

  it('shows a retry hint when the search fails', async () => {
    api.searchSupervisors.mockRejectedValue(new Error('boom'));
    const wrapper = mountSelect({ programCode: 'P1' });
    await flushPromises();

    expect(wrapper.find('.supervisor-select__error').text()).toBe(
      'Unable to load supervisors. Try again.',
    );
  });

  it('emits the selected supervisor id and null when cleared', async () => {
    const wrapper = mountSelect({ programCode: 'P1' });
    await flushPromises();
    const select = wrapper.findComponent(ASelectStub);

    select.vm.$emit('update:value', 2);
    select.vm.$emit('update:value', undefined);

    expect(wrapper.emitted('update:modelValue')).toEqual([[2], [null]]);
  });

  it('loads once more on focus when there are no options yet', async () => {
    api.searchSupervisors.mockResolvedValue([]);
    const wrapper = mountSelect({ programCode: 'P1' });
    await flushPromises();
    api.searchSupervisors.mockClear();

    wrapper.findComponent(ASelectStub).vm.$emit('focus');
    await flushPromises();

    expect(api.searchSupervisors).toHaveBeenCalledWith('P1', '', 50);
  });
});
