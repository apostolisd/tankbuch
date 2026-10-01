import { describe, it, expect } from 'vitest';
import { zahl, chf, lPro100, rp, km, datum, parseZahl, runde } from '../src/lib/format';

describe('format', () => {
  it('Apostroph-Tausender', () => {
    expect(zahl(1234.5, 2)).toBe("1'234.50");
    expect(zahl(1234567, 0)).toBe("1'234'567");
    expect(zahl(999, 0)).toBe('999');
    expect(km(92470)).toBe("92'470");
    expect(chf(1041.29)).toBe("1'041.29");
  });
  it('Rundung', () => {
    expect(zahl(1.005, 2)).toBe('1.01');
    expect(zahl(6.925, 2)).toBe('6.93');
    expect(zahl(2.5, 0)).toBe('3');
    expect(lPro100(6.9285)).toBe('6.93');
    expect(rp(11.5649)).toBe('11.6');
    expect(runde(1.005, 2)).toBe(1.01);
  });
  it('negativ, null, NaN', () => {
    expect(zahl(-1234.5, 2)).toBe("−1'234.50");
    expect(zahl(-0.001, 2)).toBe('0.00');
    expect(zahl(null)).toBe('–');
    expect(zahl(NaN)).toBe('–');
  });
  it('datum', () => {
    expect(datum('2026-09-24')).toBe('24.09.2026');
    expect(datum(null)).toBe('–');
  });
  it('parseZahl', () => {
    expect(parseZahl('40,62')).toBe(40.62);
    expect(parseZahl('40.62')).toBe(40.62);
    expect(parseZahl("1'234.50")).toBe(1234.5);
    expect(parseZahl('1.234,50')).toBe(1234.5);
    expect(parseZahl('1,234.50')).toBe(1234.5);
    expect(parseZahl(' 92470 ')).toBe(92470);
    expect(parseZahl('-3,5')).toBe(-3.5);
    expect(parseZahl('')).toBeNull();
    expect(parseZahl('abc')).toBeNull();
    expect(parseZahl('1,2,3')).toBeNull();
    expect(parseZahl(null)).toBeNull();
  });
});
