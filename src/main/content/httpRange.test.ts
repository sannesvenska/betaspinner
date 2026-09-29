import { describe, expect, it } from 'vitest';
import { parseRangeHeader } from './httpRange';

describe('parseRangeHeader', () => {
  const size = 1000;

  it('returns null without a usable header', () => {
    expect(parseRangeHeader(null, size)).toBeNull();
    expect(parseRangeHeader('items=0-1', size)).toBeNull();
    expect(parseRangeHeader('bytes=0-1,5-9', size)).toBeNull();
    expect(parseRangeHeader('bytes=-', size)).toBeNull();
  });

  it('parses open, closed and suffix ranges', () => {
    expect(parseRangeHeader('bytes=0-', size)).toEqual({ start: 0, end: 999 });
    expect(parseRangeHeader('bytes=100-199', size)).toEqual({ start: 100, end: 199 });
    expect(parseRangeHeader('bytes=900-5000', size)).toEqual({ start: 900, end: 999 });
    expect(parseRangeHeader('bytes=-200', size)).toEqual({ start: 800, end: 999 });
  });

  it('flags unsatisfiable ranges', () => {
    expect(parseRangeHeader('bytes=1000-', size)).toBe('unsatisfiable');
    expect(parseRangeHeader('bytes=500-100', size)).toBe('unsatisfiable');
    expect(parseRangeHeader('bytes=-0', size)).toBe('unsatisfiable');
  });
});
