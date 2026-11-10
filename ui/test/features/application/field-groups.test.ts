import { describe, expect, it } from 'vitest';
import {
  groupFields,
  subFieldLabel,
  tableColumns,
} from '@/features/application/field-groups';
import { makeField } from '../../helpers/fixtures';

describe('groupFields', () => {
  it('keeps a standalone field as its own group keyed by code', () => {
    const field = makeField({ code: 'email', labelEn: 'Email' });

    const groups = groupFields([field]);

    expect(groups).toEqual([{ key: 'email', label: 'Email', fields: [field] }]);
  });

  it('merges consecutive fields sharing a group code into one row', () => {
    const last = makeField({ code: 'lastNameEn', groupCode: 'nameEn' });
    const first = makeField({ code: 'firstNameEn', groupCode: 'nameEn' });

    const groups = groupFields([last, first]);

    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('nameEn');
    expect(groups[0].label).toBe('Name in English');
    expect(groups[0].fields.map((field) => field.code)).toEqual(['lastNameEn', 'firstNameEn']);
  });

  it('uses a curated label for known composite rows', () => {
    const groups = groupFields([
      makeField({ code: 'idDocumentType', groupCode: 'idDocument' }),
      makeField({ code: 'expPeriodStart', groupCode: 'expPeriod' }),
      makeField({ code: 'phoneCountryCode', groupCode: 'phone' }),
    ]);

    expect(groups.map((group) => group.label)).toEqual([
      'I.D. Document',
      'Period',
      'Phone Number',
    ]);
  });

  it('falls back to the first field label for an unknown group code', () => {
    const groups = groupFields([
      makeField({ code: 'startDate', groupCode: 'unknownGroup', labelEn: 'Start Date' }),
    ]);

    expect(groups[0].label).toBe('Start Date');
  });

  it('places a group where it first appears, even if it is not contiguous', () => {
    const a = makeField({ code: 'a', groupCode: 'g' });
    const middle = makeField({ code: 'middle' });
    const b = makeField({ code: 'b', groupCode: 'g' });

    const groups = groupFields([a, middle, b]);

    expect(groups.map((group) => group.key)).toEqual(['g', 'middle']);
    expect(groups[0].fields.map((field) => field.code)).toEqual(['a', 'b']);
  });

  it('returns no groups for an empty field list', () => {
    expect(groupFields([])).toEqual([]);
  });
});

describe('subFieldLabel', () => {
  it('uses the short label for known composite sub-controls', () => {
    expect(subFieldLabel(makeField({ code: 'firstNameEn' }))).toBe('First Name');
    expect(subFieldLabel(makeField({ code: 'phoneCountryCode' }))).toBe('Country Code');
    expect(subFieldLabel(makeField({ code: 'expPeriodEnd' }))).toBe('End Date');
  });

  it('falls back to the schema label', () => {
    expect(subFieldLabel(makeField({ code: 'gpa', labelEn: 'GPA' }))).toBe('GPA');
  });
});

describe('tableColumns', () => {
  it('uses the same grouping as the form layout', () => {
    const fields = [
      makeField({ code: 'expPeriodStart', groupCode: 'expPeriod' }),
      makeField({ code: 'expPeriodEnd', groupCode: 'expPeriod' }),
      makeField({ code: 'organisation' }),
    ];

    expect(tableColumns(fields)).toEqual(groupFields(fields));
    expect(tableColumns(fields)).toHaveLength(2);
  });
});
