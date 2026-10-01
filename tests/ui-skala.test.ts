import { describe, it, expect } from 'vitest';
import { ySkala, schoeneSchritt, baender, linienStuecke, xBeschriftungen, abbilden } from '../src/ui/charts/skala';

describe('skala', () => {
  it('schöne Schritte', () => {
    expect(schoeneSchritt(10, 5)).toBe(2);
    expect(schoeneSchritt(7.2, 4)).toBe(2);
  });
  it('ySkala beginnt bei 0 und umfasst max', () => {
    const s = ySkala([3.4, 6.9, null, 7.3]);
    expect(s.min).toBe(0);
    expect(s.max).toBeGreaterThanOrEqual(7.3);
    expect(s.ticks[0]).toBe(0);
    expect(s.ticks[s.ticks.length - 1]).toBe(s.max);
  });
  it('ySkala leer', () => { expect(ySkala([]).ticks.length).toBe(2); });
  it('abbilden', () => {
    const s = { min: 0, max: 10, ticks: [] };
    expect(abbilden(0, s, 0, 100)).toBe(100);
    expect(abbilden(10, s, 0, 100)).toBe(0);
  });
  it('Bänder', () => {
    const b = baender(4, 0, 100, 0.5);
    expect(b).toHaveLength(4);
    expect(b[0].mitte).toBe(12.5);
    expect(b[0].breite).toBe(12.5);
  });
  it('Linie wird an Lücken getrennt', () => {
    const st = linienStuecke([{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: null }, { x: 3, y: 3 }]);
    expect(st.map((s) => s.length)).toEqual([2, 1]);
  });
  it('x-Beschriftungen', () => {
    expect(xBeschriftungen(3, 5)).toEqual([0, 1, 2]);
    const l = xBeschriftungen(20, 5);
    expect(l.length).toBeLessThanOrEqual(5);
    expect(l[l.length - 1]).toBe(19);
  });
});
