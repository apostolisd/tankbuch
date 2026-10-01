import { describe, it, expect } from 'vitest';
import { csvExport, schuetzeZelle, BOM } from '../src/ui/views/csv';
import type { Segment, Tankvorgang } from '../src/core/types';

const e = (p: Partial<Tankvorgang>): Tankvorgang => ({
  id: 'a', fahrzeug_id: 'f', datum: '2026-09-24', uhrzeit: null, km_stand: 92470, liter: 40.6, betrag: 73.08,
  waehrung: 'CHF', wechselkurs: 1, betrag_chf: 73.08, preis_pro_liter: 1.8, tankstelle: 'Coop; "Pronto"', kraftstoff: null,
  volltankung: true, geschaetzt: false, notiz: null, konfidenz: null, roh_erkennung: null, beleg_foto_pfad: null, tacho_foto_pfad: null, ...p,
});
const seg: Segment = {
  startId: 'x', endId: 'a', eintragIds: ['a'], teilIds: [], kmStart: 91845, kmEnde: 92470, km: 625, liter: 40.6, kosten: 73.08,
  verbrauch: 6.496, enddatum: '2026-09-24', status: 'gueltig', grund: null,
};

describe('csvExport', () => {
  it('BOM, Semikolon, Schweizer Datum, neueste zuerst', () => {
    const csv = csvExport([e({ id: 'b', datum: '2026-09-02', km_stand: 91845 }), e({})], [seg]);
    expect(csv.startsWith(BOM)).toBe(true);
    const z = csv.trim().split('\r\n');
    expect(z[0].split(';')[0].replace(BOM, '')).toBe('Datum');
    expect(z[1].startsWith('24.09.2026;')).toBe(true);
    expect(z[2].startsWith('02.09.2026;')).toBe(true);
    expect(z[1]).toContain('6.50');
    expect(z[1]).toContain('"Coop; ""Pronto"""');
  });
  it('wehrt CSV-Injection ab', () => {
    for (const s of ['=1+1', '+49', '-2', '@SUM(A1)']) expect(schuetzeZelle(s)).toBe(`'${s}`);
    expect(schuetzeZelle('Migrol')).toBe('Migrol');
    const csv = csvExport([e({ notiz: '=HYPERLINK("x")', tankstelle: '@evil' })], []);
    expect(csv).toContain("'@evil");
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
