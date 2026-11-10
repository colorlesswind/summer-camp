// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import StatusHistoryTable from '@/features/staff/components/StatusHistoryTable.vue';
import ApplicationFilterBar from '@/features/staff/components/ApplicationFilterBar.vue';
import { STAFF_STATUS_OPTIONS } from '@/constants/application';
import type { TimelineEntry } from '@/types/application';
import type { FilterBarTexts } from '@/features/staff/types';
import { AButtonStub, AInputStub, ASelectStub, antdStubs } from '../../../helpers/stubs';

const texts: FilterBarTexts = {
  statusLabel: 'Status',
  all: 'All',
  searchPlaceholder: 'Application No. / name / email',
  reset: 'Reset',
};

describe('StatusHistoryTable', () => {
  function makeTimeline(): TimelineEntry[] {
    return [
      {
        action: 'submit',
        fromStatus: null,
        toStatus: 'PendingForPreliminaryScreening',
        actorRole: 'student',
        remark: null,
        at: '2026-01-02T03:04:05',
      },
      {
        action: 'approve',
        fromStatus: 'PendingForPreliminaryScreening',
        toStatus: 'PendingSupervisorReview',
        actorRole: 'admin',
        remark: 'Looks good',
        at: '2026-01-03T04:05:06',
      },
    ];
  }

  function mountHistory(timeline: TimelineEntry[]) {
    return mount(StatusHistoryTable, { props: { timeline } });
  }

  it('shows the newest entry first without mutating the input array', () => {
    const timeline = makeTimeline();
    const wrapper = mountHistory(timeline);
    const rows = wrapper.findAll('tbody tr');

    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('2026-01-03 04:05:06');
    expect(rows[1].text()).toContain('2026-01-02 03:04:05');
    expect(timeline[0].action).toBe('submit');
  });

  it('translates actions, statuses and capitalises the actor role', () => {
    const wrapper = mountHistory(makeTimeline());
    const cells = wrapper.findAll('tbody tr')[0].findAll('td');

    expect(cells[0].text()).toBe('Approve');
    expect(cells[1].text()).toBe('Pending For Preliminary Screening');
    expect(cells[2].text()).toBe('Pending Supervisor Review');
    expect(cells[3].text()).toBe('Admin');
    expect(cells[4].text()).toBe('Looks good');
    expect(cells[5].text()).toBe('2026-01-03 04:05:06');
  });

  it('uses em dashes for a missing previous status, actor or remark', () => {
    const wrapper = mountHistory(makeTimeline());
    const cells = wrapper.findAll('tbody tr')[1].findAll('td');

    expect(cells[1].text()).toBe('—');
    expect(cells[3].text()).toBe('Student');
    expect(cells[4].text()).toBe('—');
  });

  it('keeps an unknown action and status readable', () => {
    const wrapper = mountHistory([
      {
        action: 'legacy_action',
        fromStatus: 'SomeOldStatus',
        toStatus: 'SupervisorRecommended',
        actorRole: null,
        remark: '',
        at: '2026-01-04T00:00:00',
      },
    ]);
    const cells = wrapper.findAll('tbody tr')[0].findAll('td');

    expect(cells[0].text()).toBe('legacy_action');
    expect(cells[1].text()).toBe('SomeOldStatus');
    expect(cells[3].text()).toBe('—');
    expect(cells[4].text()).toBe('—');
  });

  it('shows the empty state with a full-width row', () => {
    const wrapper = mountHistory([]);
    const empty = wrapper.find('.staff-history__empty');

    expect(empty.text()).toBe('No status changes yet.');
    expect(empty.attributes('colspan')).toBe('6');
  });

  it('renders all the history column captions', () => {
    const headers = mountHistory([]).findAll('thead th').map((node) => node.text());

    expect(headers).toEqual(['Action', 'From', 'To', 'Actor', 'Remark', 'Time']);
  });
});

describe('ApplicationFilterBar', () => {
  function mountBar(
    overrides: Partial<{
      status: string | null;
      keyword: string;
      busy: boolean;
    }> = {},
  ) {
    return mount(ApplicationFilterBar, {
      props: {
        status: null,
        keyword: '',
        statusOptions: STAFF_STATUS_OPTIONS,
        texts,
        busy: false,
        ...overrides,
      } as never,
      global: { stubs: antdStubs },
      slots: { actions: '<button class="batch">Send Offer (2)</button>' },
    });
  }

  it('renders the status filter, the search box and the reset button', () => {
    const wrapper = mountBar();
    const select = wrapper.findComponent(ASelectStub);
    const input = wrapper.findComponent(AInputStub);

    expect(wrapper.find('.staff-toolbar__label').text()).toBe('Status');
    expect(select.props('options')).toEqual(STAFF_STATUS_OPTIONS);
    expect(select.props('placeholder')).toBe('All');
    expect(select.props('value')).toBe('');
    expect(input.props('value')).toBe('');
    expect(input.props('placeholder')).toBe('Application No. / name / email');
    expect(wrapper.findComponent(AButtonStub).text()).toBe('Reset');
  });

  it('shows the selected status', () => {
    const wrapper = mountBar({ status: 'Returned' });

    expect(wrapper.findComponent(ASelectStub).props('value')).toBe('Returned');
  });

  it('emits the chosen status and null when cleared', () => {
    const wrapper = mountBar();
    const select = wrapper.findComponent(ASelectStub);

    select.vm.$emit('update:value', 'Draft');
    select.vm.$emit('update:value', '');
    select.vm.$emit('update:value', undefined);

    expect(wrapper.emitted('change-status')).toEqual([['Draft'], [null], [null]]);
  });

  it('forwards keyword edits', () => {
    const wrapper = mountBar();

    wrapper.findComponent(AInputStub).vm.$emit('update:value', 'alice');

    expect(wrapper.emitted('update:keyword')).toEqual([['alice']]);
  });

  it('emits reset when the reset button is clicked', async () => {
    const wrapper = mountBar();

    await wrapper.findComponent(AButtonStub).trigger('click');

    expect(wrapper.emitted('reset')).toHaveLength(1);
  });

  it('disables the controls while an action is running', () => {
    const wrapper = mountBar({ busy: true });

    expect(wrapper.findComponent(ASelectStub).props('disabled')).toBe(true);
    expect(wrapper.findComponent(AInputStub).props('disabled')).toBe(true);
    expect(wrapper.findComponent(AButtonStub).props('disabled')).toBe(true);
  });

  it('renders the role-specific action slot', () => {
    const wrapper = mountBar();

    expect(wrapper.find('.staff-toolbar .batch').text()).toBe('Send Offer (2)');
  });
});
