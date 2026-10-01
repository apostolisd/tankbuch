import { describe, it, expect } from 'vitest';
import { niceTicks, linear, baueLegende, zeitTicks, tage } from '../src/ui/charts/Punkte';
import { balkenLayout } from '../src/ui/charts/MonatsBalken';

describe('niceTicks', () => {
  it('liefert runde Werte, die den Bereich umschliessen', () => {
    const t = niceTicks(1.75, 1.95, 5);
    expect(t.min).toBeLessThanOrEqual(1.75);
    expect(t.max).toBeGreaterThanOrEqual(1.95);
    expect(t.ticks.length).toBeGreaterThanOrEqual(3);
    expect(t.ticks[0]).toBe(t.min);
  });
  it('kommt mit gleichen Werten zurecht', () => {
    const t = niceTicks(1.8, 1.8);
    expect(t.max).toBeGreaterThan(t.min);
  });
});

describe('linear', () => {
  it('skaliert und invertiert', () => {
    expect(linear(5, 0, 10, 0, 100)).toBe(50);
    expect(linear(0, 0, 10, 200, 0)).toBe(200);
    expect(linear(3, 3, 3, 0, 10)).toBe(5);
  });
});

describe('Legende', () => {
  it('zeigt immer alle Gruppen mit Form und Farbe, auch ohne Punkte', () => {
    const l = baueLegende(['Migrol', 'Coop', 'Übrige'], [{ gruppe: 'Migrol' }, { gruppe: 'Migrol' }, { gruppe: 'Coop' }]);
    expect(l.map((x) => x.gruppe)).toEqual(['Migrol', 'Coop', 'Übrige']);
    expect(l.map((x) => x.anzahl)).toEqual([2, 1, 0]);
    expect(new Set(l.map((x) => x.form)).size).toBe(3);
    expect(new Set(l.map((x) => x.farbe)).size).toBe(3);
  });
});

describe('zeitTicks', () => {
  it('Monatsanfänge im Bereich', () => {
    const t = zeitTicks(tage('2026-01-01'), tage('2026-09-30'), 12);
    expect(t.length).toBe(9);
  });
  it('dünnt aus', () => {
    expect(zeitTicks(tage('2025-01-01'), tage('2026-12-31'), 6).length).toBeLessThanOrEqual(6);
  });
});

describe('balkenLayout', () => {
  it('Nullwerte ohne Höhe, Maximum skaliert auf Achse', () => {
    const l = balkenLayout([10, null, 20, ...Array(9).fill(null)], 640, 240);
    expect(l.balken).toHaveLength(12);
    expect(l.balken[1].hoehe).toBe(0);
    expect(l.balken[2].hoehe).toBeGreaterThan(l.balken[0].hoehe);
    expect(l.max).toBeGreaterThanOrEqual(20);
  });
  it('alle leer: kein Absturz', () => {
    const l = balkenLayout(Array(12).fill(null), 640, 240);
    expect(l.ticks.length).toBeGreaterThan(0);
  });
});
