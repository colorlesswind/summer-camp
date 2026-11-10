import { describe, expect, it } from 'vitest';
import {
  hydrateValue,
  isNil,
  makeRow,
  makeRowKey,
  payloadValue,
} from '@/features/application/form-values';
import { makeField, makeSection } from '../../helpers/fixtures';

describe('isNil', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty string', ''],
    ['a whitespace-only string', '   '],
  ])('treats %s as empty', (_label, value) => {
    expect(isNil(value)).toBe(true);
  });

  it.each([['0', 0], ['false', false], ['a space inside text', ' a '], ['an empty array', []]])(
    'treats %s as present',
    (_label, value) => {
      expect(isNil(value)).toBe(false);
    },
  );
});

describe('hydrateValue', () => {
  it('returns null for empty server values', () => {
    expect(hydrateValue(makeField(), null)).toBeNull();
    expect(hydrateValue(makeField(), undefined)).toBeNull();
  });

  it('coerces boolean fields from real booleans and the string "true"', () => {
    const field = makeField({ valueType: 'boolean' });

    expect(hydrateValue(field, true)).toBe(true);
    expect(hydrateValue(field, 'true')).toBe(true);
    expect(hydrateValue(field, false)).toBe(false);
    expect(hydrateValue(field, 'false')).toBe(false);
    expect(hydrateValue(field, 1)).toBe(false);
  });

  it('parses number fields and rejects non-numeric input', () => {
    const field = makeField({ valueType: 'number' });

    expect(hydrateValue(field, '42')).toBe(42);
    expect(hydrateValue(field, 7)).toBe(7);
    expect(hydrateValue(field, 'not-a-number')).toBeNull();
    expect(hydrateValue(field, '')).toBe(0);
  });

  it('keeps only the date part of a date field', () => {
    const field = makeField({ valueType: 'date' });

    expect(hydrateValue(field, '2026-01-02T03:04:05.000Z')).toBe('2026-01-02');
    expect(hydrateValue(field, '2026-01-02')).toBe('2026-01-02');
    expect(hydrateValue(field, '2026-1')).toBeNull();
  });

  it('stringifies text values without trimming them', () => {
    const field = makeField({ valueType: 'string' });

    expect(hydrateValue(field, '  keep me  ')).toBe('  keep me  ');
    expect(hydrateValue(field, 12)).toBe('12');
  });
});

describe('payloadValue', () => {
  it('keeps null for empty values', () => {
    expect(payloadValue(makeField(), null)).toBeNull();
    expect(payloadValue(makeField(), undefined)).toBeNull();
  });

  it('normalises text: trims and maps an empty result to null', () => {
    const field = makeField();

    expect(payloadValue(field, '  hello  ')).toBe('hello');
    expect(payloadValue(field, '   ')).toBeNull();
    expect(payloadValue(field, 0)).toBe('0');
  });

  it('coerces boolean fields like hydrateValue', () => {
    const field = makeField({ valueType: 'boolean' });

    expect(payloadValue(field, 'true')).toBe(true);
    expect(payloadValue(field, true)).toBe(true);
    expect(payloadValue(field, 'false')).toBe(false);
  });

  it('parses numbers and maps invalid ones to null', () => {
    const field = makeField({ valueType: 'number' });

    expect(payloadValue(field, '3.5')).toBe(3.5);
    expect(payloadValue(field, 3.5)).toBe(3.5);
    expect(payloadValue(field, 'abc')).toBeNull();
  });

  it('accepts only complete YYYY-MM-DD dates', () => {
    const field = makeField({ valueType: 'date' });

    expect(payloadValue(field, '2026-01-02T03:04:05.000Z')).toBe('2026-01-02');
    expect(payloadValue(field, '2026-1-2')).toBeNull();
    expect(payloadValue(field, 'not-a-date')).toBeNull();
  });
});

describe('makeRow', () => {
  const section = makeSection({
    code: 'EXPERIENCE',
    isRepeatable: true,
    payloadKey: 'experiences',
    fields: [
      makeField({ code: 'organisation', valueType: 'string' }),
      makeField({ code: 'year', valueType: 'number' }),
      makeField({ code: 'current', valueType: 'boolean' }),
    ],
  });

  it('creates a row containing exactly the section fields plus the frontend-only key', () => {
    const row = makeRow(section, {
      organisation: 'HKUST',
      year: '2025',
      current: 'true',
      unknownServerField: 'ignored',
    });

    expect(Object.keys(row).sort()).toEqual(['_key', 'current', 'organisation', 'year']);
    expect(row.organisation).toBe('HKUST');
    expect(row.year).toBe(2025);
    expect(row.current).toBe(true);
  });

  it('produces an all-null row when there is no stored value', () => {
    const row = makeRow(section, null);

    expect(row.organisation).toBeNull();
    expect(row.year).toBeNull();
    expect(row.current).toBeNull();
  });

  it('tolerates a primitive stored value', () => {
    const row = makeRow(section, 'garbage');

    expect(row.organisation).toBeNull();
  });

  it('generates a unique _key per row', () => {
    const first = makeRow(section, null);
    const second = makeRow(section, null);

    expect(first._key).not.toBe(second._key);
    expect(first._key).toMatch(/^[a-z0-9]+-[a-z0-9]+$/);
  });
});

describe('makeRowKey', () => {
  it('is time-prefixed and unique across rapid calls', () => {
    const keys = new Set(Array.from({ length: 50 }, () => makeRowKey()));

    expect(keys.size).toBe(50);
    expect(makeRowKey().split('-')).toHaveLength(2);
  });
});
