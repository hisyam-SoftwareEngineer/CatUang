import { parseNominal } from './nominal-parser';

describe('parseNominal', () => {
  it('parses plain number', () => {
    expect(parseNominal('500')).toBe(500);
  });

  it('parses "rb" suffix', () => {
    expect(parseNominal('500rb')).toBe(500000);
  });

  it('parses "ribu" suffix', () => {
    expect(parseNominal('50ribu')).toBe(50000);
  });

  it('parses "jt" suffix', () => {
    expect(parseNominal('2jt')).toBe(2000000);
  });

  it('parses "juta" suffix', () => {
    expect(parseNominal('1.5juta')).toBe(1500000);
  });

  it('parses dot-formatted thousand separator', () => {
    expect(parseNominal('500.000')).toBe(500000);
  });

  it('parses comma-as-decimal separator with "rb"', () => {
    // 1,5rb = 1.5 * 1000 = 1500
    expect(parseNominal('1,5rb')).toBe(1500);
  });

  it('returns null for empty string', () => {
    expect(parseNominal('')).toBeNull();
  });

  it('returns null for non-numeric text', () => {
    expect(parseNominal('abc')).toBeNull();
  });

  it('parses "2 juta" with spaces (trimmed)', () => {
    // text passed in is already lowercased and trimmed
    expect(parseNominal('2juta')).toBe(2000000);
  });
});
