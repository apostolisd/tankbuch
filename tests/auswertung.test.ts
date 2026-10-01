import { describe, expect, it } from 'vitest';
import { berechneSegmente } from '../src/core/segments';
import { zeitraumVonPreset, monatsZeitraum, vorherigerZeitraum } from '../src/core/zeitraum';
import { preisAnalyse } from '../src/core/preise';
import { ausgabenProMonat, saisonvergleich, verbrauchsReihe, vergleicheZeitraeume } from '../src/core/verlauf';
import { monatsBericht } from '../src/core/bericht';
import { EINST, TESTDATEN, ZEITRAUM_2026, eintrag } from './fixture';

const seg = berechneSegmente(TESTDATEN, EINST);

describe('Zeiträume', () => {
  it('Presets relativ zu heute', () => {
    expect(zeitraumVonPreset('30tage', '2026-09-30')).toEqual({ von: '2026-09-01', bis: '2026-09-30' });
    expect(zeitraumVonPreset('quartal', '2026-09-30')).toEqual({ von: '2026-07-01', bis: '2026-09-30' });
    expect(zeitraumVonPreset('quartal', '2026-11-15')).toEqual({ von: '2026-10-01', bis: '2026-11-15' });
    expect(zeitraumVonPreset('jahr', '2026-09-30')).toEqual({ von: '2026-01-01', bis: '2026-09-30' });
    expect(zeitraumVonPreset('12monate', '2026-09-30')).toEqual({ von: '2025-10-01', bis: '2026-09-30' });
    expect(zeitraumVonPreset('12monate', '2028-02-29')).toEqual({ von: '2027-03-01', bis: '2028-02-29' });
    expect(zeitraumVonPreset('30tage', '2026-03-10')).toEqual({ von: '2026-02-09', bis: '2026-03-10' });
  });
  it('benutzerdefiniert', () => {
    const c = { von: '2026-02-01', bis: '2026-03-15' };
    expect(zeitraumVonPreset('benutzerdefiniert', '2026-09-30', c)).toEqual(c);
    expect(zeitraumVonPreset('benutzerdefiniert', '2026-09-30', { von: c.bis, bis: c.von })).toEqual(c);
    expect(zeitraumVonPreset('benutzerdefiniert', '2026-09-30')).toEqual({ von: '2026-01-01', bis: '2026-09-30' });
  });
  it('monatsZeitraum inkl. Schaltjahr', () => {
    expect(monatsZeitraum(2026, 9)).toEqual({ von: '2026-09-01', bis: '2026-09-30' });
    expect(monatsZeitraum(2028, 2)).toEqual({ von: '2028-02-01', bis: '2028-02-29' });
    expect(monatsZeitraum(2026, 2).bis).toBe('2026-02-28');
  });
  it('vorherigerZeitraum', () => {
    expect(vorherigerZeitraum(monatsZeitraum(2026, 3))).toEqual(monatsZeitraum(2026, 2));
    expect(vorherigerZeitraum(monatsZeitraum(2026, 1))).toEqual(monatsZeitraum(2025, 12));
    expect(vorherigerZeitraum({ von: '2026-07-01', bis: '2026-09-30' })).toEqual({ von: '2026-04-01', bis: '2026-06-30' });
    expect(vorherigerZeitraum({ von: '2026-09-01', bis: '2026-09-10' })).toEqual({ von: '2026-08-22', bis: '2026-08-31' });
  });
});

describe('Preise (SPEC 8.3)', () => {
  const a = preisAnalyse(TESTDATEN, ZEITRAUM_2026);
  it('Migrol 6 Belege 253.4 l Ø 1.785; Coop 6 Belege 250.4 l Ø 1.840', () => {
    const m = a.tabelle.find((t) => t.tankstelle === 'Migrol Dietikon')!;
    const c = a.tabelle.find((t) => t.tankstelle === 'Coop Pronto Birmensdorf')!;
    expect(m.anzahl).toBe(6);
    expect(m.liter).toBe(253.4);
    expect(m.preisSchnitt).toBeCloseTo(1.785, 3);
    expect(c.anzahl).toBe(6);
    expect(c.liter).toBe(250.4);
    expect(c.preisSchnitt).toBeCloseTo(1.84, 3);
    expect(m.diffZurGuenstigsten).toBe(0);
    expect(m.mehrkosten).toBe(0);
  });
  it('günstigste Migrol, Gruppen, Durchschnitt', () => {
    expect(a.guenstigste).toBe('Migrol Dietikon');
    expect(a.gruppen).toEqual(['Migrol Dietikon', 'Coop Pronto Birmensdorf', 'Übrige']);
    expect(a.durchschnitt!).toBeCloseTo(1.826, 3);
    expect(a.punkte).toHaveLength(14);
    expect(a.punkte.find((p) => p.tankstelle === 'Tamoil Urdorf')!.gruppe).toBe('Übrige');
  });
  it('Mehrkosten gegenüber Migrol total ≈ 23.40 (exakt 23.43)', () => {
    expect(a.ersparnis).toBeCloseTo(23.4, 1);
    expect(a.ersparnis).toBeGreaterThan(23.3);
    expect(a.ersparnis).toBeLessThan(23.5);
    expect(a.ersparnis).toBe(23.43);
  });
  it('leer', () => {
    const l = preisAnalyse([], ZEITRAUM_2026);
    expect(l).toEqual({ punkte: [], durchschnitt: null, gruppen: [], tabelle: [], guenstigste: null, ersparnis: 0, geschaetztAusgenommen: 0, fremdBerechnet: 0 });
  });
  it('nur eine Tankstelle: Ersparnis 0, keine «Übrige»', () => {
    const l = preisAnalyse(TESTDATEN.filter((x) => x.tankstelle === 'Migrol Dietikon'), ZEITRAUM_2026);
    expect(l.ersparnis).toBe(0);
    expect(l.gruppen).toEqual(['Migrol Dietikon']);
  });
  it('Fremdwährung: Preis über betrag_chf / liter', () => {
    const l = preisAnalyse([eintrag({ id: 'x', datum: '2026-06-01', liter: 40, betrag: 70, waehrung: 'EUR', wechselkurs: 0.9, tankstelle: 'Shell' })], ZEITRAUM_2026);
    expect(l.punkte[0].preisChf).toBeCloseTo(63 / 40, 6);
  });
});

describe('Verlauf (SPEC 8.2)', () => {
  const reihe = verbrauchsReihe(seg, EINST, TESTDATEN);
  it('Lücke bei 29.05., gleitendes Mittel setzt neu an', () => {
    const l = reihe.find((r) => r.segment.enddatum === '2026-05-29')!;
    expect(l.luecke).toBe(true);
    expect(l.wert).toBeNull();
    expect(l.gleitend).toBeNull();
    const n = reihe.find((r) => r.segment.enddatum === '2026-06-20')!;
    expect(n.gleitend).toBeCloseTo(n.wert!, 10); // nur 1 Wert seit der Lücke
    const n2 = reihe.find((r) => r.segment.enddatum === '2026-07-11')!;
    expect(n2.gleitend).toBeCloseTo((n.wert! + n2.wert!) / 2, 10);
    const n3 = reihe.find((r) => r.segment.enddatum === '2026-07-18')!;
    expect(n3.gleitend).toBeCloseTo((n.wert! + n2.wert! + n3.wert!) / 3, 10);
    const n4 = reihe.find((r) => r.segment.enddatum === '2026-08-09')!;
    expect(n4.gleitend).toBeCloseTo((n2.wert! + n3.wert! + n4.wert!) / 3, 10); // Fenster 3
  });
  it('Ausreisser: Ferienfahrt 18.07. mit Notiz', () => {
    const a = reihe.filter((r) => r.ausreisser);
    expect(a.map((r) => r.segment.enddatum)).toEqual(['2026-07-18']);
    expect(a[0].notiz).toBe('Ferienfahrt, Dachbox');
    expect(a[0].wert!).toBeCloseTo(8.02, 2);
  });
  it('Reihe ohne Einträge: keine Notizen', () => {
    expect(verbrauchsReihe(seg, EINST).every((r) => r.notiz === null)).toBe(true);
  });
  it('geschätztes Segment ist Lücke, ausser Einstellung', () => {
    const d = TESTDATEN.map((x) => (x.id === 'e13' ? { ...x, geschaetzt: true } : x));
    const s = berechneSegmente(d, EINST);
    expect(verbrauchsReihe(s, EINST).find((r) => r.segment.enddatum === '2026-09-02')!.luecke).toBe(true);
    expect(verbrauchsReihe(s, { ...EINST, geschaetzteMitrechnen: true }).find((r) => r.segment.enddatum === '2026-09-02')!.luecke).toBe(false);
  });
  it('leer', () => {
    expect(verbrauchsReihe([], EINST)).toEqual([]);
  });

  it('ausgabenProMonat: alle Monate, belegbasiert', () => {
    const m = ausgabenProMonat(TESTDATEN, ZEITRAUM_2026);
    expect(m.map((x) => x.monat)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']);
    expect(m[0].ausgaben).toBe(154.73);
    expect(m[2].ausgaben).toBe(109.82);
    expect(m[8].ausgaben).toBe(146.82);
    expect(m.reduce((a, x) => a + x.ausgaben, 0)).toBeCloseTo(1041.29, 6);
    expect(ausgabenProMonat([], { von: '2026-01-01', bis: '2026-02-28' })).toEqual([
      { monat: '2026-01', ausgaben: 0 },
      { monat: '2026-02', ausgaben: 0 },
    ]);
  });

  it('Saisonvergleich', () => {
    const s = saisonvergleich(seg, EINST, 2026);
    // Winter: Segmente mit Ende Jan–Mär 2026 (22.01., 09.02., 27.02., 24.03.)
    expect(s.winter.n).toBe(4);
    expect(s.winter.verbrauch!).toBeCloseTo(((44.1 + 43.0 + 41.8 + 59.9) / (578 + 563 + 579 + 882)) * 100, 6);
    // Sommer: Mai–Sep gültig (ohne 29.05.): 20.06., 11.07., 18.07., 09.08., 02.09., 24.09.
    expect(s.sommer.n).toBe(6);
    expect(s.sommer.verbrauch!).toBeCloseTo(((41.2 + 43.9 + 46.5 + 41.0 + 41.9 + 40.6) / (645 + 645 + 580 + 640 + 645 + 625)) * 100, 6);
    const leer = saisonvergleich([], EINST, 2026);
    expect(leer).toEqual({ winter: { verbrauch: null, n: 0 }, sommer: { verbrauch: null, n: 0 } });
  });

  it('Vergleich zweier Zeiträume', () => {
    const v = vergleicheZeitraeume(TESTDATEN, seg, { von: '2026-08-01', bis: '2026-08-31' }, { von: '2026-09-01', bis: '2026-09-30' }, EINST);
    expect(v.a.beleg.ausgaben).toBe(77.08);
    expect(v.a.seg.km).toBe(640);
    expect(v.b.beleg.ausgaben).toBe(146.82);
    expect(v.b.seg.km).toBe(1270);
  });
});

describe('Monatsbericht (SPEC 8.4)', () => {
  it('September 2026 vs. August', () => {
    const b = monatsBericht(TESTDATEN, seg, 2026, 9, EINST);
    expect(b.km).toBe(1270);
    expect(b.ausgaben).toBe(146.82);
    expect(b.verbrauch!).toBeCloseTo(6.5, 2);
    expect(b.kostenPro100km!).toBeCloseTo(11.56, 2);
    expect(b.vormonat!.km).toBe(640);
    expect(b.vormonat!.kostenPro100km!).toBeCloseTo(12.04, 2);
    expect(b.vorjahr).toBeNull();
    expect(b.veraenderung.vorjahr).toBeNull();
    expect(b.veraenderung.vormonat!.km!).toBeCloseTo(98.4375, 3);
    expect(b.veraenderung.vormonat!.kostenPro100km!).toBeLessThan(0);
    expect(b.treiber).toBe('Fahrleistung');
    expect(b.jahresverlauf).toHaveLength(12);
    expect(b.jahresverlauf[8].kostenPro100km!).toBeCloseTo(11.56, 2);
    expect(b.jahresverlauf[4].kostenPro100km).toBeNull(); // Mai: nur unplausibles Segment
    expect(b.jahresverlauf[5].kostenPro100km).not.toBeNull();
    expect(b.jahresverlauf[9].kostenPro100km).toBeNull();
    expect(b.text).toContain("1'270 km");
    expect(b.text).toContain('Fahrleistung');
    expect(b.methode.length).toBeGreaterThan(20);
    expect(b.luecken.join(' ')).toContain('Vorjahresmonat');
  });

  it('Mai 2026: unplausibles Segment wird als Lücke gemeldet', () => {
    const b = monatsBericht(TESTDATEN, seg, 2026, 5, EINST);
    expect(b.km).toBe(1270);
    expect(b.verbrauch).toBeNull();
    expect(b.kostenPro100km).toBeNull();
    expect(b.segmenteGueltig).toBe(0);
    expect(b.luecken.some((l) => l.includes('vermutlich fehlt ein Beleg'))).toBe(true);
  });

  it('Monat ohne Segment: keine NaN, Hinweis', () => {
    const b = monatsBericht(TESTDATEN, seg, 2026, 10, EINST);
    expect(b).toMatchObject({ km: 0, ausgaben: 0, verbrauch: null, kostenPro100km: null, treiber: null });
    expect(b.luecken[0]).toContain('kein Segment');
    expect(b.text).toContain('keine Kennzahlen');
  });

  it('Januar: Vormonat = Dezember des Vorjahrs; Vorjahresvergleich', () => {
    const d = [
      eintrag({ id: 'a', datum: '2025-12-01', km_stand: 1000, liter: 40, betrag: 70 }),
      eintrag({ id: 'b', datum: '2025-12-20', km_stand: 1600, liter: 40, betrag: 70 }),
      eintrag({ id: 'c', datum: '2026-01-10', km_stand: 2200, liter: 42, betrag: 84 }),
    ];
    const s = berechneSegmente(d, EINST);
    const b = monatsBericht(d, s, 2026, 1, EINST);
    expect(b.vormonat!.monat).toBe(12);
    expect(b.vormonat!.jahr).toBe(2025);
    expect(b.treiber).toBe('Preis'); // gleiche km, ähnlicher Verbrauch, Preis +20 %
    expect(b.veraenderung.vormonat!.kostenPro100km!).toBeGreaterThan(0);
  });

  it('leerer Bestand', () => {
    const b = monatsBericht([], [], 2026, 9, EINST);
    expect(b.km).toBe(0);
    expect(b.jahresverlauf.every((x) => x.kostenPro100km === null)).toBe(true);
    expect(b.vormonat).toBeNull();
    expect(JSON.stringify(b)).not.toContain('NaN');
  });
});
