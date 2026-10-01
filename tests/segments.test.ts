import { describe, expect, it } from 'vitest';
import { berechneSegmente, rundeZahl, segmentZuEintrag, sortiereEintraege, zaehltImDurchschnitt } from '../src/core/segments';
import { belegKennzahlen, eintraegeImZeitraum, segmentKennzahlen } from '../src/core/kennzahlen';
import { EINST, TESTDATEN, ZEITRAUM_2026, eintrag } from './fixture';

const seg = berechneSegmente(TESTDATEN, EINST);

describe('Segmente (SPEC 10)', () => {
  it('12 Segmente, 11 gültig', () => {
    expect(seg).toHaveLength(12);
    expect(seg.filter((s) => s.status === 'gueltig')).toHaveLength(11);
  });

  it('Segment mit Ende 29.05. ist unplausibel (1270 km, 43.6 l, 3.4)', () => {
    const s = seg.find((x) => x.enddatum === '2026-05-29')!;
    expect(s.status).toBe('unplausibel');
    expect(s.km).toBe(1270);
    expect(s.liter).toBe(43.6);
    expect(s.verbrauch).toBeNull();
    expect((s.liter / s.km) * 100).toBeCloseTo(3.43, 2);
    expect(s.grund).toContain('vermutlich fehlt ein Beleg');
  });

  it('Segment 24.03. enthält die Teilbetankung: 882 km, 59.9 l, 6.79', () => {
    const s = seg.find((x) => x.enddatum === '2026-03-24')!;
    expect(s.km).toBe(882);
    expect(s.liter).toBe(59.9);
    expect(s.verbrauch!).toBeCloseTo(6.79, 2);
    expect(s.teilIds).toEqual(['e05']);
    expect(s.eintragIds).toEqual(['e05', 'e06']);
    expect(s.kosten).toBe(109.82);
    expect(s.startId).toBe('e04');
    expect(s.endId).toBe('e06');
  });

  it('Segmente aufsteigend nach Enddatum, erste Volltankung in keinem Segment', () => {
    const daten = seg.map((s) => s.enddatum);
    expect([...daten].sort()).toEqual(daten);
    expect(segmentZuEintrag(seg, 'e01')).toBeNull();
    expect(segmentZuEintrag(seg, 'e05')?.endId).toBe('e06'); // Teilbetankung -> Segment, das sie enthält
    expect(segmentZuEintrag(seg, 'e14')?.enddatum).toBe('2026-09-24');
  });

  it('Kennzahlen 01.01.–30.09.: Verbrauch, km, Segmentzahlen', () => {
    const k = segmentKennzahlen(seg, ZEITRAUM_2026, EINST);
    expect(k.km).toBe(8260);
    expect(k.kmGueltig).toBe(6990);
    expect(k.literGueltig).toBe(484.4);
    expect(k.verbrauch!).toBeCloseTo(6.93, 2);
    expect(k.segmenteGesamt).toBe(12);
    expect(k.segmenteGueltig).toBe(11);
    expect(k.ausgeschlossen).toHaveLength(1);
    expect(k.ausgeschlossen[0].segment.enddatum).toBe('2026-05-29');
    // Kosten pro 100 km: ohne unplausibles Segment (Σ Kosten 889.65 / 6990 km)
    expect(k.kostenPro100km!).toBeCloseTo((889.65 / 6990) * 100, 6);
    expect(k.rpProKm).toBe(k.kostenPro100km);
  });

  it('Belegkennzahlen: 1041.29 CHF, 570.3 l, Ø 1.826', () => {
    const b = belegKennzahlen(TESTDATEN, ZEITRAUM_2026);
    expect(b.ausgaben).toBe(1041.29);
    expect(b.liter).toBe(570.3);
    expect(b.preisProLiter!).toBeCloseTo(1.826, 3);
    expect(b.anzahl).toBe(14);
    expect(b.teilbetankungen).toBe(1);
    expect(b.geschaetzt).toBe(0);
    expect(b.fremdwaehrung).toEqual([]);
  });

  it('September: 1270 km, 82.5 l, 146.82 CHF, 11.56 CHF/100 km', () => {
    const z = { von: '2026-09-01', bis: '2026-09-30' };
    const k = segmentKennzahlen(seg, z, EINST);
    expect(k.km).toBe(1270);
    expect(k.literGueltig).toBe(82.5);
    expect(k.kostenPro100km!).toBeCloseTo(11.56, 2);
    // SPEC nennt 6.57 l/100 km; 82.5 / 1270 × 100 = 6.496 -> 6.50 (SPEC-Zahl stimmt nicht mit den Rohdaten)
    expect(k.verbrauch!).toBeCloseTo(6.5, 2);
    const kosten = seg.filter((s) => s.enddatum.startsWith('2026-09')).reduce((a, s) => a + s.kosten, 0);
    expect(rundeZahl(kosten, 2)).toBe(146.82);
  });

  it('August: 640 km, 41.0 l, 77.08 CHF, 6.41, 12.04', () => {
    const k = segmentKennzahlen(seg, { von: '2026-08-01', bis: '2026-08-31' }, EINST);
    expect(k.km).toBe(640);
    expect(k.literGueltig).toBe(41);
    expect(k.verbrauch!).toBeCloseTo(6.41, 2);
    expect(k.kostenPro100km!).toBeCloseTo(12.04, 2);
  });
});

describe('Segmentstatus', () => {
  const basis = [
    eintrag({ id: 'a', datum: '2026-01-01', km_stand: 1000, liter: 40, betrag: 70 }),
    eintrag({ id: 'b', datum: '2026-01-10', km_stand: 1600, liter: 40, betrag: 70 }),
  ];

  it('gültig', () => {
    const s = berechneSegmente(basis, EINST)[0];
    expect(s.status).toBe('gueltig');
    expect(s.grund).toBeNull();
    expect(s.verbrauch!).toBeCloseTo(6.667, 3);
  });

  it('geschätzt: Verbrauch berechnet, aber nicht im Durchschnitt (ausser Einstellung)', () => {
    const d = [basis[0], { ...basis[1], geschaetzt: true }];
    const s = berechneSegmente(d, EINST)[0];
    expect(s.status).toBe('geschaetzt');
    expect(s.verbrauch).not.toBeNull();
    expect(zaehltImDurchschnitt(s, EINST)).toBe(false);
    expect(zaehltImDurchschnitt(s, { ...EINST, geschaetzteMitrechnen: true })).toBe(true);
    const k1 = segmentKennzahlen([s], { von: '2026-01-01', bis: '2026-01-31' }, EINST);
    expect(k1.verbrauch).toBeNull();
    expect(k1.segmenteGueltig).toBe(0);
    expect(k1.kostenPro100km).toBeNull();
    expect(k1.km).toBe(600);
    const k2 = segmentKennzahlen([s], { von: '2026-01-01', bis: '2026-01-31' }, { ...EINST, geschaetzteMitrechnen: true });
    expect(k2.verbrauch!).toBeCloseTo(6.667, 3);
    expect(k2.segmenteGueltig).toBe(1);
  });

  it('unvollständig (Nutzer): kein Verbrauch, aber Kosten pro 100 km', () => {
    const einst = { ...EINST, unvollstaendigeSegmente: ['b'] };
    const s = berechneSegmente(basis, einst)[0];
    expect(s.status).toBe('unvollstaendig');
    expect(s.verbrauch).toBeNull();
    const k = segmentKennzahlen([s], { von: '2026-01-01', bis: '2026-01-31' }, einst);
    expect(k.verbrauch).toBeNull();
    expect(k.segmenteGueltig).toBe(0);
    expect(k.kostenPro100km!).toBeCloseTo((70 / 600) * 100, 6);
    expect(k.ausgeschlossen[0].grund).toContain('unvollständig');
  });

  it('unplausibel: zu hoch, zu tief, Grenzen inklusiv, km nicht gestiegen', () => {
    const mk = (km: number, liter: number) => [
      basis[0],
      { ...basis[1], km_stand: 1000 + km, liter },
    ];
    expect(berechneSegmente(mk(100, 20), EINST)[0].status).toBe('unplausibel'); // 20
    expect(berechneSegmente(mk(1000, 20), EINST)[0].status).toBe('unplausibel'); // 2.0
    expect(berechneSegmente(mk(1000, 35), EINST)[0].status).toBe('gueltig'); // 3.5 (untere Grenze, inklusiv)
    expect(berechneSegmente(mk(1000, 34), EINST)[0].status).toBe('unplausibel'); // 3.4
    expect(berechneSegmente(mk(200, 30), EINST)[0].status).toBe('gueltig'); // 15.0
    const gleich = berechneSegmente(mk(0, 30), EINST)[0];
    expect(gleich.status).toBe('unplausibel');
    expect(gleich.verbrauch).toBeNull();
    expect(Number.isNaN(gleich.km)).toBe(false);
  });

  it('unplausibel hat Vorrang vor geschätzt', () => {
    const d = [basis[0], { ...basis[1], km_stand: 1100, geschaetzt: true }];
    expect(berechneSegmente(d, EINST)[0].status).toBe('unplausibel');
  });
});

describe('Teilbetankung, Sortierung, Fremdwährung', () => {
  it('Teilbetankung schliesst kein Segment ab; nach letzter Volltankung und vor erster: kein Segment', () => {
    const d = [
      eintrag({ id: 'p0', km_stand: 900, volltankung: false, liter: 10, betrag: 18 }),
      eintrag({ id: 'a', km_stand: 1000 }),
      eintrag({ id: 'p1', km_stand: 1300, volltankung: false, liter: 20, betrag: 36 }),
      eintrag({ id: 'b', km_stand: 1600, liter: 20, betrag: 36 }),
      eintrag({ id: 'p2', km_stand: 1700, volltankung: false, liter: 10, betrag: 18 }),
    ];
    const s = berechneSegmente(d, EINST);
    expect(s).toHaveLength(1);
    expect(s[0].liter).toBe(40);
    expect(s[0].teilIds).toEqual(['p1']);
    expect(segmentZuEintrag(s, 'p0')).toBeNull();
    expect(segmentZuEintrag(s, 'p2')).toBeNull();
  });

  it('sortiert nach km_stand (Eingabereihenfolge egal)', () => {
    const rev = [...TESTDATEN].reverse();
    expect(sortiereEintraege(rev).map((x) => x.id)).toEqual(TESTDATEN.map((x) => x.id));
    expect(berechneSegmente(rev, EINST)).toEqual(seg);
  });

  it('Fremdwährung: EUR mit Kurs, Auswertung in betrag_chf', () => {
    const d = [
      eintrag({ id: 'a', datum: '2026-06-01', km_stand: 1000, liter: 40, betrag: 70 }),
      eintrag({ id: 'b', datum: '2026-06-10', km_stand: 1600, liter: 40, betrag: 70, waehrung: 'EUR', wechselkurs: 0.9342, preis_pro_liter: 1.75 }),
    ];
    expect(d[1].betrag_chf).toBe(65.39);
    const z = { von: '2026-06-01', bis: '2026-06-30' };
    const b = belegKennzahlen(d, z);
    expect(b.ausgaben).toBe(135.39);
    expect(b.liter).toBe(80);
    expect(b.fremdwaehrung).toEqual([{ waehrung: 'EUR', betragOriginal: 70, betragChf: 65.39, anzahl: 1 }]);
    // einheitliche Definition: Σ betrag_chf / Σ liter über alle Belege (Fremdwährung in CHF umgerechnet)
    expect(b.preisProLiter!).toBeCloseTo(b.ausgaben / b.liter, 10);
    expect(b.preisProLiter!).toBeCloseTo(135.39 / 80, 6);
    const s = berechneSegmente(d, EINST)[0];
    expect(s.kosten).toBe(65.39);
  });

  it('nur Fremdwährung: preisProLiter aus umgerechnetem Betrag, Fremdwährung ausgewiesen', () => {
    const d = [eintrag({ id: 'x', datum: '2026-06-01', liter: 40, betrag: 70, waehrung: 'EUR', wechselkurs: 0.95 })];
    const b = belegKennzahlen(d, { von: '2026-06-01', bis: '2026-06-30' });
    expect(b.preisProLiter!).toBeCloseTo(66.5 / 40, 6);
    expect(b.fremdwaehrung).toHaveLength(1);
  });

  it('Float-Fallen: Summen sauber gerundet', () => {
    const d = [0.1, 0.2, 0.3].map((x, i) => eintrag({ id: `f${i}`, datum: '2026-06-01', liter: x, betrag: x, betrag_chf: x }));
    const b = belegKennzahlen(d, { von: '2026-06-01', bis: '2026-06-30' });
    expect(b.ausgaben).toBe(0.6);
    expect(b.liter).toBe(0.6);
    expect(rundeZahl(1.005, 2)).toBe(1.01);
  });
});

describe('leere Datenbestände', () => {
  it('keine NaN, keine Division durch 0', () => {
    expect(berechneSegmente([], EINST)).toEqual([]);
    const k = segmentKennzahlen([], ZEITRAUM_2026, EINST);
    expect(k).toMatchObject({ km: 0, verbrauch: null, kostenPro100km: null, rpProKm: null, segmenteGesamt: 0, segmenteGueltig: 0, literGueltig: 0, kmGueltig: 0 });
    const b = belegKennzahlen([], ZEITRAUM_2026);
    expect(b).toMatchObject({ ausgaben: 0, liter: 0, preisProLiter: null, anzahl: 0 });
    expect(eintraegeImZeitraum([], ZEITRAUM_2026)).toEqual([]);
  });

  it('nur eine Volltankung: kein Segment', () => {
    expect(berechneSegmente([TESTDATEN[0]], EINST)).toEqual([]);
  });

  it('Zeitraum ohne Einträge', () => {
    const b = belegKennzahlen(TESTDATEN, { von: '2025-01-01', bis: '2025-12-31' });
    expect(b.anzahl).toBe(0);
    expect(b.preisProLiter).toBeNull();
  });

  it('eintraegeImZeitraum ist inklusiv', () => {
    const l = eintraegeImZeitraum(TESTDATEN, { von: '2026-01-04', bis: '2026-01-22' });
    expect(l.map((x) => x.id)).toEqual(['e01', 'e02']);
  });
});
