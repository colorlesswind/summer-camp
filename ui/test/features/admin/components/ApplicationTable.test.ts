// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount, RouterLinkStub } from '@vue/test-utils';
import ApplicationTable from '@/features/admin/components/ApplicationTable.vue';
import { STAFF_STATUS_META } from '@/constants/application';
import { ADMIN_MESSAGES } from '@/features/admin/messages';
import type { ApplicationSummary } from '@/types/application';
import { makeSummary } from '../../../helpers/fixtures';
import {
  AButtonStub,
  ACheckboxStub,
  ASpinStub,
  ATagStub,
  antdStubs,
} from '../../../helpers/stubs';

const pending = makeSummary({
  id: 'a1',
  applicationNumber: 'SC-0001',
  nameEn: 'Alice',
  email: 'alice@example.com',
  status: 'PendingForPreliminaryScreening',
  displayStatus: 'Pending For Preliminary Screening',
  firstProgramCode: 'P1',
  firstSupervisorName: 'Prof. One',
  secondProgramCode: 'P2',
  secondSupervisorName: 'Prof. Two',
  updatedAt: '2026-01-02T03:04:05',
});

const recommended = makeSummary({
  id: 'a2',
  applicationNumber: 'SC-0002',
  status: 'SupervisorRecommended',
  displayStatus: 'Supervisor Recommended',
  firstProgramCode: 'P1',
  firstSupervisorName: null,
  secondProgramCode: null,
  secondSupervisorName: 'Prof. Two',
});

const accepted = makeSummary({
  id: 'a3',
  applicationNumber: 'SC-0003',
  status: 'OfferAccepted',
  displayStatus: 'Offer Accepted',
  firstProgramCode: null,
  firstSupervisorName: null,
  secondProgramCode: null,
  secondSupervisorName: null,
});

function mountTable(
  overrides: Partial<{
    items: ApplicationSummary[];
    loading: boolean;
    selectedIds: string[];
    busy: boolean;
    hasFilters: boolean;
  }> = {},
) {
  return mount(ApplicationTable, {
    props: {
      items: [pending, recommended, accepted],
      loading: false,
      selectedIds: [],
      busy: false,
      hasFilters: false,
      ...overrides,
    },
    global: { stubs: { ...antdStubs, RouterLink: RouterLinkStub } },
  });
}

describe('ApplicationTable', () => {
  it('shows a spinner while the first page is loading', () => {
    const wrapper = mountTable({ items: [], loading: true });

    expect(wrapper.findComponent(ASpinStub).exists()).toBe(true);
    expect(wrapper.find('.staff-table__state-text').text()).toBe(ADMIN_MESSAGES.loading);
    expect(wrapper.find('table').exists()).toBe(false);
  });

  it('keeps the table while a refresh is running in the background', () => {
    const wrapper = mountTable({ loading: true });

    expect(wrapper.find('table').exists()).toBe(true);
    expect(wrapper.findComponent(ASpinStub).exists()).toBe(false);
  });

  it('renders the applicant, choices, status tag and last update', () => {
    const wrapper = mountTable();
    const firstRow = wrapper.findAll('tbody tr')[0];

    expect(wrapper.findComponent(RouterLinkStub).props('to')).toEqual({
      name: 'admin-application-detail',
      params: { id: 'a1' },
    });
    expect(firstRow.find('.staff-table__link').text()).toBe('SC-0001');
    expect(firstRow.text()).toContain('Alice');
    expect(firstRow.text()).toContain('alice@example.com');
    expect(firstRow.text()).toContain('P1 · Prof. One');
    expect(firstRow.text()).toContain('P2 · Prof. Two');
    expect(firstRow.text()).toContain('2026-01-02 03:04');
    expect(firstRow.findComponent(ATagStub).props('color')).toBe(
      STAFF_STATUS_META.PendingForPreliminaryScreening.color,
    );
    expect(firstRow.findComponent(ATagStub).text()).toBe('Pending For Preliminary Screening');
  });

  it('formats the two-choice cells for every combination', () => {
    const wrapper = mountTable();
    const rows = wrapper.findAll('tbody tr');

    // 只有 program code
    expect(rows[1].findAll('td')[3].text()).toBe('P1');
    // 只有 supervisor
    expect(rows[1].findAll('td')[4].text()).toBe('Prof. Two');
    // 两者都没有
    expect(rows[2].findAll('td')[3].text()).toBe('—');
    expect(rows[2].findAll('td')[4].text()).toBe('—');
  });

  it('offers Approve and Return only for applications awaiting screening', async () => {
    const wrapper = mountTable();
    const firstRow = wrapper.findAll('tbody tr')[0];
    const buttons = firstRow.findAllComponents(AButtonStub);

    expect(buttons.map((button) => button.text())).toEqual(['Approve', 'Return']);

    await buttons[0].trigger('click');
    await buttons[1].trigger('click');

    expect(wrapper.emitted('approve')).toEqual([[pending]]);
    expect(wrapper.emitted('request-return')).toEqual([[pending]]);
  });

  it('offers Send Offer only for recommended applications', async () => {
    const wrapper = mountTable();
    const recommendedRow = wrapper.findAll('tbody tr')[1];
    const buttons = recommendedRow.findAllComponents(AButtonStub);

    expect(buttons.map((button) => button.text())).toEqual(['Send Offer']);

    await buttons[0].trigger('click');

    expect(wrapper.emitted('send-offer')).toEqual([[recommended]]);
  });

  it('shows no action for terminal statuses', () => {
    const wrapper = mountTable();
    const acceptedRow = wrapper.findAll('tbody tr')[2];

    expect(acceptedRow.findAllComponents(AButtonStub)).toHaveLength(0);
    expect(acceptedRow.findAll('td')[7].text()).toBe('—');
  });

  it('disables the action buttons while a request is running', () => {
    const wrapper = mountTable({ busy: true });
    const buttons = wrapper.findAllComponents(AButtonStub);

    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.props('disabled')).toBe(true);
    }
  });

  it('only enables row selection for applications that can receive an offer', () => {
    const wrapper = mountTable();
    const checkboxes = wrapper.findAllComponents(ACheckboxStub).slice(1);

    expect(checkboxes[0].props('disabled')).toBe(true);
    expect(checkboxes[0].attributes('title')).toBe(ADMIN_MESSAGES.filter.batchHint);
    expect(checkboxes[1].props('disabled')).toBe(false);
    expect(checkboxes[2].props('disabled')).toBe(true);
  });

  it('emits the new selection when a row is checked or unchecked', async () => {
    const wrapper = mountTable({ selectedIds: [] });
    const rowCheckbox = wrapper.findAllComponents(ACheckboxStub)[2];

    await rowCheckbox.find('input').setValue(true);
    expect(wrapper.emitted('update:selectedIds')).toEqual([[['a2']]]);

    const withSelection = mountTable({ selectedIds: ['a2'] });
    await withSelection.findAllComponents(ACheckboxStub)[2].find('input').setValue(false);
    expect(withSelection.emitted('update:selectedIds')).toEqual([[[]]]);
  });

  it('checks the header box only when every eligible row is selected', () => {
    const none = mountTable({ selectedIds: [] });
    const all = mountTable({ selectedIds: ['a2'] });

    expect(none.findComponent(ACheckboxStub).props('checked')).toBe(false);
    expect(all.findComponent(ACheckboxStub).props('checked')).toBe(true);
  });

  it('reports an indeterminate header when only some eligible rows are selected', () => {
    const eligibleTwo = makeSummary({ id: 'a4', status: 'SupervisorRecommended' });
    const wrapper = mountTable({
      items: [recommended, eligibleTwo],
      selectedIds: ['a2'],
    });
    const header = wrapper.findComponent(ACheckboxStub);

    expect(header.props('checked')).toBe(false);
    expect(header.props('indeterminate')).toBe(true);
  });

  it('disables the header checkbox when no row is eligible', () => {
    const wrapper = mountTable({ items: [pending, accepted] });

    expect(wrapper.findComponent(ACheckboxStub).props('disabled')).toBe(true);
  });

  it('selects all eligible rows from the header box', async () => {
    const eligibleTwo = makeSummary({ id: 'a4', status: 'SupervisorRecommended' });
    const wrapper = mountTable({ items: [pending, recommended, eligibleTwo] });

    await wrapper.findComponent(ACheckboxStub).find('input').setValue(true);
    expect(wrapper.emitted('update:selectedIds')).toEqual([[['a2', 'a4']]]);

    await wrapper.findComponent(ACheckboxStub).find('input').setValue(false);
    expect(wrapper.emitted('update:selectedIds')).toHaveLength(2);
    expect(wrapper.emitted('update:selectedIds')?.[1]).toEqual([[]]);
  });

  it('marks selected rows as checked', () => {
    const wrapper = mountTable({ selectedIds: ['a2'] });

    expect(wrapper.findAllComponents(ACheckboxStub)[2].props('checked')).toBe(true);
  });

  it('shows the empty state for an empty result set', () => {
    const wrapper = mountTable({ items: [], hasFilters: false });
    const empty = wrapper.find('.staff-table__empty');

    expect(empty.text()).toContain(ADMIN_MESSAGES.filter.emptyAll);
    expect(empty.findComponent(AButtonStub).exists()).toBe(false);
  });

  it('offers to clear filters when the empty result is filtered', async () => {
    const wrapper = mountTable({ items: [], hasFilters: true });
    const empty = wrapper.find('.staff-table__empty');

    expect(empty.text()).toContain(ADMIN_MESSAGES.filter.empty);
    await empty.findComponent(AButtonStub).trigger('click');

    expect(wrapper.emitted('clear-filters')).toHaveLength(1);
  });

  it('renders the table headings', () => {
    const headers = mountTable()
      .findAll('thead th')
      .map((node) => node.text())
      .filter(Boolean);

    expect(headers).toEqual([
      'Application No.',
      'Applicant',
      'First Choice',
      'Second Choice',
      'Status',
      'Last Updated',
      'Action',
    ]);
  });
});
