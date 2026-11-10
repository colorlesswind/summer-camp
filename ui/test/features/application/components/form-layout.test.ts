// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { defineComponent, h, reactive } from 'vue';
import { mount, RouterLinkStub } from '@vue/test-utils';
import type { FormSectionConfig, FormValues } from '@/types/application';
import FormFieldGroup from '@/features/application/components/FormFieldGroup.vue';
import RepeatableSection from '@/features/application/components/RepeatableSection.vue';
import SectionNav from '@/features/application/components/SectionNav.vue';
import StudentSidebar from '@/features/application/components/StudentSidebar.vue';
import { groupFields } from '@/features/application/field-groups';
import type { RepeatableRow } from '@/features/application/form-values';
import { makeField, makeSchema, makeSection } from '../../../helpers/fixtures';
import { AInputStub, ASelectStub, antdStubs } from '../../../helpers/stubs';

const schema = makeSchema();

const SupervisorSelectStub = defineComponent({
  name: 'SupervisorSelectStub',
  props: {
    modelValue: { type: Number, default: null },
    programCode: { type: String, default: null },
    excludeId: { type: Number, default: null },
  },
  emits: ['update:modelValue'],
  setup() {
    return () => h('div', { class: 'supervisor-select-stub' });
  },
});

const fieldStubs = { ...antdStubs, SupervisorSelect: SupervisorSelectStub };

function makeGroup(fields: ReturnType<typeof makeField>[]) {
  return groupFields(fields)[0];
}

describe('FormFieldGroup', () => {
  it('renders the group label and a short label per sub-control', () => {
    const group = makeGroup([
      makeField({ code: 'lastNameEn', groupCode: 'nameEn' }),
      makeField({ code: 'firstNameEn', groupCode: 'nameEn' }),
    ]);
    const wrapper = mount(FormFieldGroup, {
      props: { group, values: reactive<FormValues>({}), schema, errors: {} },
      global: { stubs: fieldStubs },
    });

    expect(wrapper.find('.form-field__label').text()).toBe('Name in English');
    expect(wrapper.findAll('.form-field__sub-label').map((node) => node.text())).toEqual([
      'Last Name',
      'First Name',
    ]);
  });

  it('omits the sub label for a single-control group', () => {
    const group = makeGroup([makeField({ code: 'email', labelEn: 'Email Address' })]);
    const wrapper = mount(FormFieldGroup, {
      props: { group, values: reactive<FormValues>({}), schema, errors: {} },
      global: { stubs: fieldStubs },
    });

    expect(wrapper.find('.form-field__sub-label').exists()).toBe(false);
  });

  it('marks a required group and hides the star in text presentation', () => {
    const group = makeGroup([makeField({ code: 'nameEn', isRequired: true })]);
    const control = mount(FormFieldGroup, {
      props: { group, values: reactive<FormValues>({}), schema, errors: {}, required: true },
      global: { stubs: fieldStubs },
    });
    const text = mount(FormFieldGroup, {
      props: {
        group,
        values: reactive<FormValues>({}),
        schema,
        errors: {},
        required: true,
        presentation: 'text',
      },
      global: { stubs: fieldStubs },
    });

    expect(control.find('.form-field__required').text()).toBe('*');
    expect(text.find('.form-field__required').exists()).toBe(false);
  });

  it('makes a group containing a long text field full width', () => {
    const group = makeGroup([makeField({ code: 'question', widget: 'long_text' })]);
    const wrapper = mount(FormFieldGroup, {
      props: { group, values: reactive<FormValues>({}), schema, errors: {} },
      global: { stubs: fieldStubs },
    });

    expect(wrapper.classes()).toContain('form-field--wide');
  });

  it('shows the guide text until the group has an error', async () => {
    const group = makeGroup([
      makeField({ code: 'nameEn', guideTextEn: 'As printed on your passport' }),
    ]);
    const errors = reactive<Record<string, string>>({});
    const wrapper = mount(FormFieldGroup, {
      props: { group, values: reactive<FormValues>({}), schema, errors },
      global: { stubs: fieldStubs },
    });

    expect(wrapper.find('.form-field__hint').text()).toBe('As printed on your passport');

    errors.nameEn = 'Name in English is required.';
    await wrapper.vm.$nextTick();

    expect(wrapper.find('.form-field__hint').exists()).toBe(false);
    expect(wrapper.find('.form-field__error').text()).toBe('Name in English is required.');
  });

  it('hides the guide text in text presentation', () => {
    const group = makeGroup([makeField({ code: 'nameEn', guideTextEn: 'Hint' })]);
    const wrapper = mount(FormFieldGroup, {
      props: {
        group,
        values: reactive<FormValues>({ nameEn: 'Alice' }),
        schema,
        errors: {},
        presentation: 'text',
      },
      global: { stubs: fieldStubs },
    });

    expect(wrapper.find('.form-field__hint').exists()).toBe(false);
    expect(wrapper.text()).toContain('Alice');
  });

  it('writes edits into the shared values object and clears that field error', async () => {
    const fields = [makeField({ code: 'nameEn' }), makeField({ code: 'email', widget: 'readonly' })];
    const values = reactive<FormValues>({ nameEn: '' });
    const errors = reactive<Record<string, string>>({ nameEn: 'Required' });
    const wrapper = mount(FormFieldGroup, {
      props: { group: makeGroup(fields), values, schema, errors },
      global: { stubs: fieldStubs },
    });

    await wrapper.findComponent(AInputStub).find('input').setValue('Bob');

    expect(values.nameEn).toBe('Bob');
    expect(errors.nameEn).toBeUndefined();
  });

  it('feeds the selected program into dependent supervisor fields', () => {
    const group = makeGroup([
      makeField({
        code: 'supervisorFirstId',
        widget: 'single_choice',
        optionsSource: 'supervisors_by_thrust',
        dependsOnField: 'programFirstId',
      }),
    ]);
    const wrapper = mount(FormFieldGroup, {
      props: {
        group,
        values: reactive<FormValues>({ supervisorFirstId: 3, programFirstId: 'P1' }),
        schema,
        errors: {},
      },
      global: { stubs: fieldStubs },
    });

    expect(wrapper.findComponent(SupervisorSelectStub).props('programCode')).toBe('P1');
  });

  it('prevents choosing the same program twice', () => {
    const group = makeGroup([
      makeField({ code: 'programSecondId', widget: 'single_choice', optionsSource: 'programs' }),
    ]);
    const wrapper = mount(FormFieldGroup, {
      props: {
        group,
        values: reactive<FormValues>({ programSecondId: 'P2', programFirstId: 'P1' }),
        schema,
        errors: {},
      },
      global: { stubs: fieldStubs },
    });

    expect(wrapper.findComponent(ASelectStub).props('options')).toEqual([
      { label: 'Program Two', value: 'P2' },
    ]);
  });

  it('prevents choosing the same supervisor twice', () => {
    const group = makeGroup([
      makeField({
        code: 'supervisorSecondId',
        widget: 'single_choice',
        optionsSource: 'supervisors_by_thrust',
        dependsOnField: 'programSecondId',
      }),
    ]);
    const wrapper = mount(FormFieldGroup, {
      props: {
        group,
        values: reactive<FormValues>({
          supervisorFirstId: 5,
          supervisorSecondId: 6,
          programSecondId: 'P2',
        }),
        schema,
        errors: {},
      },
      global: { stubs: fieldStubs },
    });

    expect(wrapper.findComponent(SupervisorSelectStub).props('excludeId')).toBe(5);
  });

  it('passes an explicit value label to the read-only field', () => {
    const group = makeGroup([
      makeField({ code: 'supervisorFirstId', widget: 'single_choice' }),
    ]);
    const wrapper = mount(FormFieldGroup, {
      props: {
        group,
        values: reactive<FormValues>({ supervisorFirstId: 5 }),
        schema,
        errors: {},
        presentation: 'text',
        valueLabels: { supervisorFirstId: 'Prof. One' },
      },
      global: { stubs: fieldStubs },
    });

    expect(wrapper.text()).toContain('Prof. One');
  });
});

describe('RepeatableSection', () => {
  const section: FormSectionConfig = makeSection({
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
  });

  function rows(): RepeatableRow[] {
    return [
      { _key: 'r1', organisation: 'HKUST', year: 2024 },
      { _key: 'r2', organisation: 'CUHK', year: 2023 },
    ];
  }

  function mountSection(overrides: Partial<{ rows: RepeatableRow[]; disabled: boolean; rowErrors: Record<string, string> }> = {}) {
    return mount(RepeatableSection, {
      props: {
        section,
        schema,
        rows: rows(),
        rowErrors: {},
        disabled: false,
        ...overrides,
      },
      global: { stubs: fieldStubs },
    });
  }

  it('renders one column per field plus the action column', () => {
    const wrapper = mountSection();
    const headers = wrapper.findAll('thead th').map((node) => node.text());

    expect(headers).toEqual(['Action', 'Organisation', 'Year']);
    expect(wrapper.findAll('tbody tr')).toHaveLength(2);
  });

  it('renders the stored row values', () => {
    const wrapper = mountSection();
    const inputs = wrapper.findAllComponents(AInputStub).map((input) => input.props('value'));

    expect(inputs).toEqual(['HKUST', 'CUHK']);
  });

  it('emits add from the footer button', async () => {
    const wrapper = mountSection();

    await wrapper.find('.repeat-table__footer button').trigger('click');

    expect(wrapper.emitted('add')).toHaveLength(1);
  });

  it('emits remove with the row index', async () => {
    const wrapper = mountSection();

    const removeButtons = wrapper.findAll('tbody .repeat-table__action button');
    expect(removeButtons).toHaveLength(2);

    await removeButtons[1].trigger('click');

    expect(wrapper.emitted('remove')).toEqual([[1]]);
  });

  it('hides the action column and the add button when read-only', () => {
    const wrapper = mountSection({ disabled: true });
    const headers = wrapper.findAll('thead th').map((node) => node.text());

    expect(headers).toEqual(['Organisation', 'Year']);
    expect(wrapper.find('.repeat-table__footer').exists()).toBe(false);
    expect(wrapper.find('tbody .repeat-table__action').exists()).toBe(false);
  });

  it('shows the empty state with a full-width cell', () => {
    const wrapper = mountSection({ rows: [] });
    const cell = wrapper.find('.repeat-table__empty');

    expect(cell.text()).toBe('No entries yet.');
    expect(cell.attributes('colspan')).toBe('3');
  });

  it('shows the publications ordering hint', () => {
    const publications = makeSection({
      code: 'PUBLICATIONS',
      titleEn: 'Publications',
      isRepeatable: true,
      payloadKey: 'publications',
      fields: [makeField({ code: 'title', labelEn: 'Title', sectionCode: 'PUBLICATIONS' })],
    });
    const wrapper = mount(RepeatableSection, {
      props: {
        section: publications,
        schema,
        rows: [],
        rowErrors: {},
      },
      global: { stubs: fieldStubs },
    });

    expect(wrapper.find('.form-section__hint').text()).toBe(
      'In descending order of importance.',
    );
  });

  it('marks a required column', () => {
    const requiredSection = makeSection({
      code: 'EXP',
      titleEn: 'Experience',
      isRepeatable: true,
      payloadKey: 'experiences',
      fields: [makeField({ code: 'organisation', isRequired: true, sectionCode: 'EXP' })],
    });
    const wrapper = mount(RepeatableSection, {
      props: { section: requiredSection, schema, rows: [], rowErrors: {} },
      global: { stubs: fieldStubs },
    });

    expect(wrapper.find('thead .form-field__required').text()).toBe('*');
  });

  it('renders a row-level error next to the offending field', () => {
    const wrapper = mountSection({
      rowErrors: { 'EXPERIENCE:0:organisation': 'Organisation is required.' },
    });

    expect(wrapper.find('.repeat-table__empty').exists()).toBe(false);
    expect(wrapper.find('.form-field__error').text()).toBe('Organisation is required.');
  });

  it('stops offering new rows at the 20-row limit', () => {
    const many = Array.from({ length: 20 }, (_, index) => ({
      _key: `r${index}`,
      organisation: `Org ${index}`,
      year: 2020,
    }));

    const wrapper = mountSection({ rows: many });

    expect(wrapper.find('.repeat-table__footer').exists()).toBe(false);
  });

  it('renders values as labels in text presentation', () => {
    const wrapper = mount(RepeatableSection, {
      props: {
        section,
        schema,
        rows: rows(),
        rowErrors: {},
        disabled: true,
        presentation: 'text',
        valueLabels: {},
      },
      global: { stubs: fieldStubs },
    });

    expect(wrapper.text()).toContain('HKUST');
    expect(wrapper.text()).toContain('2024');
    expect(wrapper.find('.repeat-table__footer').exists()).toBe(false);
  });
});

describe('SectionNav', () => {
  const sections = [
    makeSection({ code: 'A', titleEn: 'Personal' }),
    makeSection({ code: 'B', titleEn: 'Experience' }),
  ];

  it('renders one item per section and marks the active one', () => {
    const wrapper = mount(SectionNav, { props: { sections, activeCode: 'B' } });
    const items = wrapper.findAll('.section-nav__item');

    expect(items.map((item) => item.text())).toEqual(['Personal', 'Experience']);
    expect(items[0].classes()).not.toContain('is-active');
    expect(items[1].classes()).toContain('is-active');
    expect(items[1].attributes('aria-current')).toBe('true');
    expect(items[0].attributes('aria-current')).toBeUndefined();
  });

  it('emits the section code when clicked', async () => {
    const wrapper = mount(SectionNav, { props: { sections, activeCode: 'A' } });

    await wrapper.findAll('.section-nav__item')[1].trigger('click');

    expect(wrapper.emitted('select')).toEqual([['B']]);
  });

  it('marks nothing when the active code is unknown', () => {
    const wrapper = mount(SectionNav, { props: { sections, activeCode: 'Z' } });

    expect(wrapper.findAll('.is-active')).toHaveLength(0);
  });

  it('exposes the section title as a tooltip', () => {
    const wrapper = mount(SectionNav, { props: { sections, activeCode: 'A' } });

    expect(wrapper.findAll('.section-nav__item')[0].attributes('title')).toBe('Personal');
  });
});

describe('StudentSidebar', () => {
  function mountSidebar(props: { active: 'status' | 'form'; formTarget?: string | null }) {
    return mount(StudentSidebar, {
      props,
      global: { stubs: { RouterLink: RouterLinkStub } },
    });
  }

  it('shows the brand and highlights the status entry', () => {
    const wrapper = mountSidebar({ active: 'status' });
    const items = wrapper.findAll('.application-sidebar__item');

    expect(wrapper.find('.application-sidebar__brand').text()).toBe('SUMMER CAMP');
    expect(items[0].text()).toBe('Application Status');
    expect(items[0].classes()).toContain('is-active');
  });

  it('does not link the status page while already on it', () => {
    const wrapper = mountSidebar({ active: 'status' });

    expect(wrapper.findAllComponents(RouterLinkStub)).toHaveLength(0);
  });

  it('links back to the status page from the form', () => {
    const wrapper = mountSidebar({ active: 'form' });
    const link = wrapper.findComponent(RouterLinkStub);

    expect(link.props('to')).toEqual({ name: 'student-applications' });
    expect(wrapper.findAll('.application-sidebar__item')[1].classes()).toContain('is-active');
  });

  it('links to the form only when a target is provided', () => {
    const withTarget = mountSidebar({ active: 'status', formTarget: '/applications/new' });
    const withoutTarget = mountSidebar({ active: 'status', formTarget: null });

    expect(withTarget.findComponent(RouterLinkStub).props('to')).toBe('/applications/new');
    expect(withoutTarget.findAllComponents(RouterLinkStub)).toHaveLength(0);
  });

  it('does not link the form while already on the form', () => {
    const wrapper = mountSidebar({ active: 'form', formTarget: '/applications/new' });

    expect(wrapper.findAllComponents(RouterLinkStub)).toHaveLength(1);
    expect(wrapper.findAll('.application-sidebar__item')[1].element.tagName).toBe('SPAN');
  });
});
