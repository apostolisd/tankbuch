import { describe, it, expect } from 'vitest';
import { kostenBasis, kostenBasisText } from '../src/ui/views/herleitung';
import { segmentKennzahlen } from '../src/core/kennzahlen';
import type { Einstellungen, Segment } from '../src/core/types';

const s = (p: Partial<Segment>): Segment => ({
  startId: 'a', endId: 'b', eintragIds: [], teilIds: [], kmStart: 0, kmEnde: 0, km: 100, liter: 6, kosten: 12,
  verbrauch: 6, enddatum: '2026-09-01', status: 'gueltig', grund: null, ...p,
});
const EINST: Einstellungen = { geschaetzteMitrechnen: false, unvollstaendigeSegmente: [] };

describe('kostenBasis (gleiche Regel wie die Fachlogik)', () => {
  const z = { von: '2026-09-01', bis: '2026-09-30' };
  const segs = [
    s({}),
    s({ km: 300, kosten: 3, status: 'unplausibel', verbrauch: null, enddatum: '2026-09-10' }),
    s({ km: 200, kosten: 30, status: 'unvollstaendig', verbrauch: null, enddatum: '2026-09-12' }),
    s({ km: 100, kosten: 15, status: 'geschaetzt', enddatum: '2026-09-15' }),
    s({ km: 100, kosten: 9, enddatum: '2026-10-05' }), // ausserhalb des Zeitraums
  ];

  it('nimmt gültige + unvollständige Segmente, listet fehlende (unplausible, geschätzte) auf', () => {
    const b = kostenBasis(segs, z, EINST);
    expect(b).toMatchObject({ kosten: 42, km: 300, n: 2, kmFehlend: 400, kmAlle: 700 });
    expect(b.fehlend.map((x) => x.status).sort()).toEqual(['geschaetzt', 'unplausibel']);
  });

  it('mit Einstellung «geschätzte mitrechnen» zählt das geschätzte Segment', () => {
    const b = kostenBasis(segs, z, { ...EINST, geschaetzteMitrechnen: true });
    expect(b).toMatchObject({ kosten: 57, km: 400, n: 3, kmFehlend: 300 });
    expect(kostenBasisText({ ...EINST, geschaetzteMitrechnen: true })).toContain('geschätzte');
  });

  it('Bruch der Herleitung ergibt exakt das Ergebnis der Fachlogik (beide Einstellungen)', () => {
    for (const einst of [EINST, { ...EINST, geschaetzteMitrechnen: true }]) {
      const b = kostenBasis(segs, z, einst);
      const k = segmentKennzahlen(segs, z, einst);
      expect((b.kosten / b.km) * 100).toBe(k.kostenPro100km);
    }
  });

  it('keine Segmente: Basis leer', () => {
    const b = kostenBasis([], z, EINST);
    expect(b).toMatchObject({ kosten: 0, km: 0, n: 0, kmAlle: 0 });
  });
});
