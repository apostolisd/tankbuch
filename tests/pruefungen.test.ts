import { describe, expect, it } from 'vitest';
import type { PruefKontext } from '../src/core/pruefungen';
import { ergaenzeFehlendenWert, kannSpeichern, pruefeEntwurf, vorschauSegment } from '../src/core/pruefungen';
import type { EintragEntwurf } from '../src/core/types';
import { EINST, FAHRZEUG, TESTDATEN } from './fixture';

const kontext: PruefKontext = { fahrzeug: FAHRZEUG, bestehende: TESTDATEN, heute: '2026-09-30', einst: EINST };
const codes = (e: EintragEntwurf, k = kontext) => pruefeEntwurf(e, k).map((p) => p.code);

// Gültiger Eintrag nach dem letzten: 640 km, 40 l -> 6.25 l/100 km
const gut: EintragEntwurf = {
  datum: '2026-09-29',
  km_stand: 93110,
  liter: 40,
  preis_pro_liter: 1.8,
  betrag: 72,
  waehrung: 'CHF',
  wechselkurs: 1,
  volltankung: true,
};

describe('Plausibilitätsprüfungen (SPEC 5.3)', () => {
  it('gültiger Entwurf: keine Meldungen, speicherbar', () => {
    const p = pruefeEntwurf(gut, kontext);
    expect(p).toEqual([]);
    expect(kannSpeichern(p)).toBe(true);
  });

  it('Pflichtfelder fehlen -> Fehler', () => {
    const p = pruefeEntwurf({}, kontext);
    expect(p.filter((x) => x.code === 'pflichtfeld').map((x) => x.feld).sort()).toEqual(['betrag', 'datum', 'km_stand', 'liter']);
    expect(kannSpeichern(p)).toBe(false);
  });

  it('Betrag stimmt nicht: Warnung mit Schnellkorrektur', () => {
    const p = pruefeEntwurf({ ...gut, liter: 41, betrag: 72 }, kontext); // 41 × 1.8 = 73.8
    const w = p.find((x) => x.code === 'betrag_abweichung')!;
    expect(w.stufe).toBe('warnung');
    expect(w.korrektur).toEqual({ label: 'Liter aus Betrag ÷ Preis übernehmen', feld: 'liter', wert: 40 });
    expect(kannSpeichern(p)).toBe(true);
  });

  it('Betragstoleranz 0.05 inklusiv (Rappenrundung)', () => {
    expect(codes({ ...gut, liter: 42.3, preis_pro_liter: 1.75, betrag: 74.03 })).not.toContain('betrag_abweichung'); // 74.025
    expect(codes({ ...gut, liter: 40, preis_pro_liter: 1.8, betrag: 72.05 })).not.toContain('betrag_abweichung');
    expect(codes({ ...gut, liter: 40, preis_pro_liter: 1.8, betrag: 72.06 })).toContain('betrag_abweichung');
  });

  it('km-Stand nicht steigend (nach letztem Eintrag) -> Fehler', () => {
    const p = pruefeEntwurf({ ...gut, km_stand: 92470 }, kontext);
    expect(p.some((x) => x.code === 'km_nicht_steigend' && x.stufe === 'fehler')).toBe(true);
    expect(kannSpeichern(p)).toBe(false);
  });

  it('Einfügen zwischen zwei Einträgen: nur zwischen den Nachbarn gültig', () => {
    // zwischen 09.02. (85351) und 27.02. (85930)
    const z = { ...gut, datum: '2026-02-18', liter: 10, betrag: 18, volltankung: false };
    expect(codes({ ...z, km_stand: 85600 })).not.toContain('km_nicht_steigend');
    const zuTief = pruefeEntwurf({ ...z, km_stand: 85300 }, kontext);
    expect(zuTief.find((x) => x.code === 'km_nicht_steigend')!.text).toContain('vorangehenden');
    const zuHoch = pruefeEntwurf({ ...z, km_stand: 86000 }, kontext);
    expect(zuHoch.find((x) => x.code === 'km_nicht_steigend')!.text).toContain('nachfolgenden');
    expect(kannSpeichern(zuHoch)).toBe(false);
  });

  it('Bearbeiten: eigener Eintrag (id) wird ausgeschlossen', () => {
    const e14 = TESTDATEN[13];
    const p = pruefeEntwurf({ ...e14 }, kontext);
    expect(p.some((x) => x.code === 'km_nicht_steigend')).toBe(false);
    expect(p.some((x) => x.code === 'pflichtfeld')).toBe(false);
  });

  it('Tankvolumen überschritten -> Fehler; ohne Tankvolumen kein Fehler', () => {
    const e = { ...gut, liter: 46, preis_pro_liter: 1.8, betrag: 82.8 };
    const p = pruefeEntwurf(e, kontext);
    expect(p.find((x) => x.code === 'tankvolumen')!.stufe).toBe('fehler');
    expect(codes(e, { ...kontext, fahrzeug: { ...FAHRZEUG, tankvolumen_l: null } })).not.toContain('tankvolumen');
    expect(codes(e, { ...kontext, fahrzeug: null })).not.toContain('tankvolumen');
    expect(codes({ ...gut, liter: 45, betrag: 81 })).not.toContain('tankvolumen'); // Grenze inklusiv
  });

  it('Preis unplausibel (1.00–3.50), in CHF gerechnet', () => {
    expect(codes({ ...gut, preis_pro_liter: 0.9, betrag: 36 })).toContain('preis_unplausibel');
    expect(codes({ ...gut, preis_pro_liter: 3.6, betrag: 144 })).toContain('preis_unplausibel');
    expect(codes({ ...gut, preis_pro_liter: 1.0, betrag: 40 })).not.toContain('preis_unplausibel');
    // EUR 1.05 × 0.93 = 0.977 CHF -> Warnung
    expect(codes({ ...gut, waehrung: 'EUR', wechselkurs: 0.93, preis_pro_liter: 1.05, betrag: 42 })).toContain('preis_unplausibel');
    const w = pruefeEntwurf({ ...gut, preis_pro_liter: 0.9, betrag: 36 }, kontext).find((x) => x.code === 'preis_unplausibel')!;
    expect(w.stufe).toBe('warnung');
  });

  it('Datum: Zukunft und vor dem vorangehenden Eintrag -> Warnungen', () => {
    expect(codes({ ...gut, datum: '2026-10-05' })).toContain('datum_zukunft');
    expect(codes({ ...gut, datum: '2026-09-30' })).not.toContain('datum_zukunft');
    // km nach 92470 (24.09.), Datum davor
    const p = pruefeEntwurf({ ...gut, datum: '2026-09-10' }, kontext);
    const w = p.find((x) => x.code === 'datum_vor_vorgaenger')!;
    expect(w.stufe).toBe('warnung');
    expect(kannSpeichern(p.filter((x) => x.code === 'datum_vor_vorgaenger'))).toBe(true);
  });

  it('Verbrauch des entstehenden Segments: Warnung «Beleg fehlt?»', () => {
    const p = pruefeEntwurf({ ...gut, km_stand: 94000, liter: 40, betrag: 72 }, kontext); // 1530 km / 40 l = 2.6
    const w = p.find((x) => x.code === 'verbrauch_unplausibel')!;
    expect(w.stufe).toBe('warnung');
    expect(w.text).toContain('Beleg fehlt?');
    expect(kannSpeichern(p)).toBe(true);
    // Teilbetankung: keine Verbrauchswarnung
    expect(codes({ ...gut, km_stand: 94000, volltankung: false })).not.toContain('verbrauch_unplausibel');
  });

  it('Liter/Betrag <= 0 -> Fehler', () => {
    expect(codes({ ...gut, liter: 0 })).toContain('wert_ungueltig');
    expect(codes({ ...gut, betrag: -5 })).toContain('wert_ungueltig');
  });

  it('kannSpeichern: Warnungen blockieren nicht', () => {
    expect(kannSpeichern([{ code: 'x', stufe: 'warnung', text: '' }])).toBe(true);
    expect(kannSpeichern([{ code: 'x', stufe: 'fehler', text: '' }])).toBe(false);
    expect(kannSpeichern([])).toBe(true);
  });

  it('leere Bestandsdaten: keine Fehler bei vollständigem Entwurf', () => {
    const p = pruefeEntwurf(gut, { ...kontext, bestehende: [] });
    expect(p).toEqual([]);
  });

  it('Fixture-Beobachtung: 46.5 l (Gotthard) überschreiten das 45-l-Tankvolumen', () => {
    const p = pruefeEntwurf(TESTDATEN[10], kontext);
    expect(p.map((x) => x.code)).toContain('tankvolumen');
  });
});

describe('ergaenzeFehlendenWert', () => {
  it('Liter fehlt: aus Betrag ÷ Preis', () => {
    const r = ergaenzeFehlendenWert({ preis_pro_liter: 1.799, betrag: 73.08, konfidenz: { betrag: 'sicher' } });
    expect(r.berechnet).toEqual(['liter']);
    expect(r.entwurf.liter).toBe(40.62);
    expect(r.entwurf.konfidenz).toEqual({ betrag: 'sicher', liter: 'berechnet' });
  });
  it('Preis fehlt: Betrag ÷ Liter (3 Dezimalen)', () => {
    const r = ergaenzeFehlendenWert({ liter: 40.62, betrag: 73.08 });
    expect(r.berechnet).toEqual(['preis_pro_liter']);
    expect(r.entwurf.preis_pro_liter).toBe(1.799);
    expect(r.entwurf.konfidenz?.preis_pro_liter).toBe('berechnet');
  });
  it('Betrag fehlt: Liter × Preis (2 Dezimalen)', () => {
    const r = ergaenzeFehlendenWert({ liter: 41.9, preis_pro_liter: 1.76 });
    expect(r.berechnet).toEqual(['betrag']);
    expect(r.entwurf.betrag).toBe(73.74);
  });
  it('alle vorhanden oder zwei fehlen: unverändert', () => {
    const a = { liter: 40, preis_pro_liter: 1.8, betrag: 72 };
    expect(ergaenzeFehlendenWert(a)).toEqual({ entwurf: a, berechnet: [] });
    const b = { liter: 40 };
    expect(ergaenzeFehlendenWert(b)).toEqual({ entwurf: b, berechnet: [] });
    expect(ergaenzeFehlendenWert({})).toEqual({ entwurf: {}, berechnet: [] });
  });
  it('keine Division durch 0', () => {
    const r = ergaenzeFehlendenWert({ preis_pro_liter: 0, betrag: 50 });
    expect(r.berechnet).toEqual([]);
    const r2 = ergaenzeFehlendenWert({ liter: 0, betrag: 50 });
    expect(r2.berechnet).toEqual([]);
    expect(Number.isFinite(r2.entwurf.preis_pro_liter ?? 0)).toBe(true);
  });
});

describe('vorschauSegment', () => {
  it('Volltankung: neues Segment (645 km-ähnlich)', () => {
    const v = vorschauSegment(gut, kontext);
    expect(v.teilbetankung).toBe(false);
    expect(v.segment!.km).toBe(640);
    expect(v.segment!.verbrauch!).toBeCloseTo(6.25, 2);
    expect(v.segment!.status).toBe('gueltig');
  });
  it('Teilbetankung: kein Segment', () => {
    expect(vorschauSegment({ ...gut, volltankung: false }, kontext)).toEqual({ segment: null, teilbetankung: true });
  });
  it('unvollständiger Entwurf: kein Segment, kein Absturz', () => {
    expect(vorschauSegment({ volltankung: true }, kontext)).toEqual({ segment: null, teilbetankung: false });
  });
  it('Bearbeiten: eigener Eintrag wird ersetzt', () => {
    const v = vorschauSegment({ ...TESTDATEN[13], liter: 50 }, kontext);
    expect(v.segment!.liter).toBe(50);
    expect(v.segment!.endId).toBe('e14');
  });
  it('Fremdwährung fliesst mit Kurs in die Kosten', () => {
    const v = vorschauSegment({ ...gut, waehrung: 'EUR', wechselkurs: 0.9342, betrag: 70 }, kontext);
    expect(v.segment!.kosten).toBe(65.39);
  });
});
