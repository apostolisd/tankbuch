import { describe, expect, it } from 'vitest';
import type { EintragEntwurf, Erkennung, Tankvorgang } from '../src/core/types';
import {
  aendereFeld, betragInChf, bildeHinweise, erkennungZuEntwurf, feldStatus, leererEntwurf,
  letzterKursAus, rueckmeldung, tankstellenVorschlaege, wendeKorrekturAn, zusatzPruefungen,
  standardZuordnung, zuordnungAusErkennung, zuordnungOhneErkennung, tauscheZuordnung, waehleArt, fotoPfade,
  freiePlaetze, zuordnungStatusText, MAX_FOTOS, HINWEIS_ZUORDNUNG_UNBEKANNT, HINWEIS_ZUORDNUNG_UNBEKANNT_EINS, HINWEIS_ZUORDNUNG_UNSICHER,
  type ErgaenzeFn,
} from '../src/ui/capture/logik';

const erk = (teil: Partial<Erkennung> = {}): Erkennung => ({
  datum: { wert: '2026-09-24', konfidenz: 'sicher' },
  uhrzeit: { wert: '17:42', konfidenz: 'unsicher' },
  liter: { wert: 40.62, konfidenz: 'sicher' },
  preis_pro_liter: { wert: 1.799, konfidenz: 'sicher' },
  betrag: { wert: 73.08, konfidenz: 'sicher' },
  waehrung: { wert: 'CHF', konfidenz: 'sicher' },
  tankstelle: { wert: 'Coop Pronto Birmensdorf', konfidenz: 'unsicher' },
  kraftstoff: { wert: 'Bleifrei 95', konfidenz: 'sicher' },
  km_stand: { wert: 92470, konfidenz: 'sicher' },
  hinweise: ['Beleg unten abgeschnitten'],
  ...teil,
});

// Injizierter Ersatz für core.ergaenzeFehlendenWert
const ergaenze: ErgaenzeFn = (e) => {
  const fehlt = (['liter', 'preis_pro_liter', 'betrag'] as const).filter((f) => typeof e[f] !== 'number');
  if (fehlt.length !== 1) return { entwurf: e, berechnet: [] };
  const o = { ...e, konfidenz: { ...(e.konfidenz ?? {}) } } as EintragEntwurf;
  const f = fehlt[0];
  if (f === 'betrag') o.betrag = Math.round(e.liter! * e.preis_pro_liter! * 100) / 100;
  if (f === 'liter') o.liter = Math.round((e.betrag! / e.preis_pro_liter!) * 100) / 100;
  if (f === 'preis_pro_liter') o.preis_pro_liter = Math.round((e.betrag! / e.liter!) * 1000) / 1000;
  return { entwurf: o, berechnet: [f] };
};

describe('erkennungZuEntwurf', () => {
  it('übernimmt Werte und Konfidenz je Feld', () => {
    const z = erkennungZuEntwurf(erk(), { fahrzeugId: 'f1', ergaenze });
    expect(z.entwurf.fahrzeug_id).toBe('f1');
    expect(z.entwurf.km_stand).toBe(92470);
    expect(z.entwurf.liter).toBe(40.62);
    expect(z.entwurf.konfidenz).toMatchObject({ km_stand: 'sicher', uhrzeit: 'unsicher', tankstelle: 'unsicher', liter: 'sicher' });
    expect(z.entwurf.waehrung).toBe('CHF');
    expect(z.entwurf.wechselkurs).toBe(1);
    expect(z.entwurf.volltankung).toBe(true);
    expect(z.hinweise).toEqual(['Beleg unten abgeschnitten']);
    expect(z.entwurf.roh_erkennung).toBeTruthy();
  });

  it('nur Beleg: km_stand fehlt (kein Erfinden)', () => {
    const z = erkennungZuEntwurf(erk({ km_stand: { wert: null, konfidenz: 'fehlt' } }), { ergaenze });
    expect(z.entwurf.km_stand).toBeUndefined();
    expect(z.entwurf.konfidenz?.km_stand).toBe('fehlt');
    expect(feldStatus(z.entwurf, 'km_stand').typ).toBe('fehlt');
  });

  it('optionale Felder ohne Wert sind kein Fehler', () => {
    const z = erkennungZuEntwurf(erk({ uhrzeit: { wert: null, konfidenz: 'fehlt' } }));
    expect(z.entwurf.konfidenz?.uhrzeit).toBeUndefined();
    expect(feldStatus(z.entwurf, 'uhrzeit').typ).toBe('neutral');
  });

  it('Wert mit Konfidenz fehlt gilt als unsicher', () => {
    const z = erkennungZuEntwurf(erk({ liter: { wert: 40, konfidenz: 'fehlt' } }));
    expect(z.entwurf.konfidenz?.liter).toBe('unsicher');
  });

  it('berechnet einen fehlenden Wert mit Konfidenz berechnet', () => {
    const z = erkennungZuEntwurf(erk({ betrag: { wert: null, konfidenz: 'fehlt' } }), { ergaenze });
    expect(z.berechnet).toEqual(['betrag']);
    expect(z.entwurf.betrag).toBeCloseTo(73.07, 1);
    expect(z.entwurf.konfidenz?.betrag).toBe('berechnet');
    expect(feldStatus(z.entwurf, 'betrag').typ).toBe('berechnet');
  });

  it('zwei fehlende Werte werden nicht berechnet', () => {
    const z = erkennungZuEntwurf(
      erk({ betrag: { wert: null, konfidenz: 'fehlt' }, liter: { wert: null, konfidenz: 'fehlt' } }),
      { ergaenze },
    );
    expect(z.berechnet).toEqual([]);
    expect(z.entwurf.konfidenz?.betrag).toBe('fehlt');
    expect(z.entwurf.konfidenz?.liter).toBe('fehlt');
  });

  it('Fremdwährung: Vorschlag = letzter Kurs, unsicher', () => {
    const z = erkennungZuEntwurf(erk({ waehrung: { wert: 'eur', konfidenz: 'sicher' } }), {
      letzterKurs: (w) => (w === 'EUR' ? 0.94 : null),
    });
    expect(z.entwurf.waehrung).toBe('EUR');
    expect(z.entwurf.wechselkurs).toBe(0.94);
    expect(z.entwurf.konfidenz?.wechselkurs).toBe('unsicher');
    expect(z.hinweise.some((h) => h.includes('0.94'))).toBe(true);
  });

  it('Fremdwährung ohne bekannten Kurs: Kurs fehlt, blockiert', () => {
    const z = erkennungZuEntwurf(erk({ waehrung: { wert: 'EUR', konfidenz: 'sicher' } }), { letzterKurs: () => null });
    expect(z.entwurf.wechselkurs).toBeUndefined();
    expect(z.entwurf.konfidenz?.wechselkurs).toBe('fehlt');
    expect(zusatzPruefungen(z.entwurf).map((p) => p.feld)).toContain('wechselkurs');
  });

  it('fehlende Währung: CHF, aber unsicher', () => {
    const z = erkennungZuEntwurf(erk({ waehrung: { wert: null, konfidenz: 'fehlt' } }));
    expect(z.entwurf.waehrung).toBe('CHF');
    expect(z.entwurf.konfidenz?.waehrung).toBe('unsicher');
  });

  it('null-Erkennung liefert leeres Formular ohne erfundene Werte', () => {
    const z = erkennungZuEntwurf(null, { fahrzeugId: 'f1' });
    expect(z.entwurf.datum).toBeUndefined();
    expect(z.entwurf.km_stand).toBeUndefined();
    expect(z.entwurf.liter).toBeUndefined();
    expect(feldStatus(z.entwurf, 'liter').typ).toBe('fehlt');
  });
});

describe('aendereFeld: Konfidenz -> manuell', () => {
  const basis = () => erkennungZuEntwurf(erk(), { ergaenze }).entwurf;

  it('Änderung setzt manuell', () => {
    const neu = aendereFeld(basis(), 'liter', 40.5);
    expect(neu.liter).toBe(40.5);
    expect(neu.konfidenz?.liter).toBe('manuell');
    expect(neu.konfidenz?.betrag).toBe('sicher');
    expect(feldStatus(neu, 'liter')).toMatchObject({ typ: 'manuell', symbol: '✎' });
  });
  it('gleicher Wert ändert nichts', () => {
    const b = basis();
    expect(aendereFeld(b, 'liter', 40.62)).toBe(b);
  });
  it('unsicheres Feld wird nach Eingabe manuell', () => {
    const neu = aendereFeld(basis(), 'tankstelle', 'Migrol Dietikon');
    expect(neu.konfidenz?.tankstelle).toBe('manuell');
  });
  it('berechnetes Feld wird nach Eingabe manuell', () => {
    const z = erkennungZuEntwurf(erk({ betrag: { wert: null, konfidenz: 'fehlt' } }), { ergaenze });
    expect(aendereFeld(z.entwurf, 'betrag', 73.1).konfidenz?.betrag).toBe('manuell');
  });
  it('Leeren: Pflichtfeld -> fehlt; optionales -> kein Status', () => {
    const b = basis();
    expect(aendereFeld(b, 'liter', '').konfidenz?.liter).toBe('fehlt');
    expect(aendereFeld(b, 'liter', null).liter).toBeUndefined();
    expect(aendereFeld(b, 'uhrzeit', '').konfidenz?.uhrzeit).toBeUndefined();
  });
  it('Währungswechsel: CHF -> Kurs 1; Fremd -> letzter Kurs oder fehlt', () => {
    const b = basis();
    const eur = aendereFeld(b, 'waehrung', 'eur', { letzterKurs: () => 0.95 });
    expect(eur.waehrung).toBe('EUR');
    expect(eur.wechselkurs).toBe(0.95);
    expect(eur.konfidenz?.wechselkurs).toBe('unsicher');
    const zurueck = aendereFeld(eur, 'waehrung', 'CHF');
    expect(zurueck.wechselkurs).toBe(1);
    expect(zurueck.konfidenz?.wechselkurs).toBeUndefined();
    const unbekannt = aendereFeld(b, 'waehrung', 'USD', { letzterKurs: () => null });
    expect(unbekannt.wechselkurs).toBeUndefined();
  });
  it('Schnellkorrektur wird manuell', () => {
    const neu = wendeKorrekturAn(basis(), { label: 'x', feld: 'liter', wert: 41.62 });
    expect(neu.konfidenz?.liter).toBe('manuell');
  });
});

describe('Hilfsfunktionen', () => {
  const t = (p: Partial<Tankvorgang>): Tankvorgang => ({
    id: Math.random().toString(), fahrzeug_id: 'f', datum: '2026-01-01', uhrzeit: null, km_stand: 1000, liter: 40,
    betrag: 70, waehrung: 'CHF', wechselkurs: 1, betrag_chf: 70, preis_pro_liter: 1.75, tankstelle: null,
    kraftstoff: null, volltankung: true, geschaetzt: false, notiz: null, konfidenz: null, roh_erkennung: null,
    beleg_foto_pfad: null, tacho_foto_pfad: null, ...p,
  });
  const liste = [
    t({ datum: '2026-01-04', km_stand: 100, tankstelle: 'Migrol Dietikon' }),
    t({ datum: '2026-02-01', km_stand: 700, tankstelle: 'Coop Pronto', waehrung: 'EUR', wechselkurs: 0.93 }),
    t({ datum: '2026-03-01', km_stand: 1300, tankstelle: 'Migrol Dietikon', waehrung: 'EUR', wechselkurs: 0.95 }),
  ];
  it('letzter Kurs der Währung', () => {
    expect(letzterKursAus(liste, 'eur')).toBe(0.95);
    expect(letzterKursAus(liste, 'USD')).toBeNull();
    expect(letzterKursAus(liste, 'CHF')).toBe(1);
  });
  it('Hinweise für die Erkennung', () => {
    expect(bildeHinweise(liste)).toEqual({ letzter_km_stand: 1300, letzte_tankstellen: ['Migrol Dietikon', 'Coop Pronto'] });
    expect(bildeHinweise([])).toEqual({});
  });
  it('Tankstellenvorschläge nach Häufigkeit, inkl. Aliase', () => {
    const v = tankstellenVorschlaege(liste, { 'Migrol DTK': 'Migrol Dietikon' });
    expect(v[0]).toBe('Migrol Dietikon');
    expect(v).toContain('Migrol DTK');
    expect(tankstellenVorschlaege(liste, [{ von: 'X', nach: 'Coop Pronto' }])).toContain('X');
  });
  it('Betrag in CHF', () => {
    expect(betragInChf({ betrag: 100, waehrung: 'EUR', wechselkurs: 0.945 })).toBe(94.5);
    expect(betragInChf({ betrag: 100, waehrung: 'EUR' })).toBeNull();
    expect(betragInChf({ betrag: 73.08, waehrung: 'CHF' })).toBe(73.08);
  });
  it('leerer Entwurf bei Fotolos-Eintrag ist geschätzt', () => {
    expect(leererEntwurf('f', true).entwurf.geschaetzt).toBe(true);
  });
  it('zusatzPruefungen: km ganzzahlig', () => {
    expect(zusatzPruefungen({ km_stand: 100.5, preis_pro_liter: 1.8 }).map((p) => p.feld)).toContain('km_stand');
  });
});

describe('rueckmeldung (Gespeichert)', () => {
  it('Segment', () => {
    expect(rueckmeldung({ segment: { km: 645, verbrauch: 6.5, status: 'gueltig' }, teilbetankung: false }))
      .toEqual({ art: 'segment', km: 645, verbrauch: 6.5 });
  });
  it('Teilbetankung', () => {
    expect(rueckmeldung({ segment: null, teilbetankung: true }).art).toBe('teil');
  });
  it('unplausibel: Warnung statt Verbrauch', () => {
    const r = rueckmeldung({ segment: { km: 1270, verbrauch: null, status: 'unplausibel' }, teilbetankung: false });
    expect(r).toEqual({ art: 'unplausibel', km: 1270 });
  });
  it('geschätzt und erste Volltankung', () => {
    expect(rueckmeldung({ segment: { km: 600, verbrauch: 7, status: 'geschaetzt' }, teilbetankung: false }).art).toBe('segment-geschaetzt');
    expect(rueckmeldung({ segment: null, teilbetankung: false }).art).toBe('erste');
    expect(rueckmeldung(null).art).toBe('erste');
  });
});

describe('Fotos: Zuordnung Beleg / Kilometerzähler', () => {
  const P = ['u/1.jpg', 'u/2.jpg'];
  const z = (pfad: string, art: string, konfidenz: 'sicher' | 'unsicher' | 'fehlt' = 'sicher') => ({ pfad, art, konfidenz });

  it('standardZuordnung: 1. Beleg, 2. Tacho, höchstens 2', () => {
    expect(standardZuordnung(0)).toEqual([]);
    expect(standardZuordnung(1)).toEqual([{ art: 'beleg', status: 'standard' }]);
    expect(standardZuordnung(3).map((f) => f.art)).toEqual(['beleg', 'tacho']);
  });

  it('übernimmt eine sichere Zuordnung (auch umgekehrt), ohne Auswahl', () => {
    const r = zuordnungAusErkennung(P, [z(P[1], 'beleg'), z(P[0], 'tacho')]);
    expect(r.fotos).toEqual([{ art: 'tacho', status: 'erkannt' }, { art: 'beleg', status: 'erkannt' }]);
    expect(r.auswahl).toBe(false);
    expect(r.hinweis).toBeNull();
  });

  it('unsichere Konfidenz -> unsicher, Auswahl + Hinweis', () => {
    const r = zuordnungAusErkennung(P, [z(P[0], 'beleg', 'unsicher'), z(P[1], 'tacho')]);
    expect(r.fotos[0]).toEqual({ art: 'beleg', status: 'unsicher' });
    expect(r.auswahl).toBe(true);
    expect(r.hinweis).toBe(HINWEIS_ZUORDNUNG_UNSICHER);
  });

  it('ein Foto unbekannt -> Ergänzung zum anderen, Status standard', () => {
    const r = zuordnungAusErkennung(P, [z(P[0], 'tacho'), z(P[1], 'unbekannt', 'unsicher')]);
    expect(r.fotos).toEqual([{ art: 'tacho', status: 'erkannt' }, { art: 'beleg', status: 'standard' }]);
    expect(r.auswahl).toBe(true);
    expect(r.hinweis).toBe(HINWEIS_ZUORDNUNG_UNBEKANNT);
  });

  it('alles unbekannt, fehlende oder fremde Pfade, keine Zuordnung (alte Funktion) -> Reihenfolge der Aufnahme', () => {
    for (const zu of [undefined, null, [], [z('fremd/x.jpg', 'tacho')], [z(P[0], 'unbekannt'), z(P[1], 'quark')]]) {
      const r = zuordnungAusErkennung(P, zu);
      expect(r.fotos).toEqual(standardZuordnung(2));
      expect(r.auswahl).toBe(true);
    }
    expect(zuordnungAusErkennung([P[0]], undefined).fotos).toEqual([{ art: 'beleg', status: 'standard' }]);
    expect(zuordnungAusErkennung([], undefined)).toEqual({ fotos: [], auswahl: false, hinweis: null });
  });

  it('zwei Belege -> Reihenfolge der Aufnahme, beide unsicher', () => {
    const r = zuordnungAusErkennung(P, [z(P[0], 'beleg'), z(P[1], 'beleg')]);
    expect(r.fotos).toEqual([{ art: 'beleg', status: 'unsicher' }, { art: 'tacho', status: 'unsicher' }]);
    expect(r.auswahl).toBe(true);
  });

  it('ein Foto, sicher als Tacho erkannt', () => {
    const r = zuordnungAusErkennung([P[0]], [z(P[0], 'tacho')]);
    expect(r.fotos).toEqual([{ art: 'tacho', status: 'erkannt' }]);
    expect(r.auswahl).toBe(false);
  });

  it('Fehler/Timeout: Standard + Auswahl + Hinweis', () => {
    expect(zuordnungOhneErkennung(2)).toEqual({ fotos: standardZuordnung(2), auswahl: true, hinweis: HINWEIS_ZUORDNUNG_UNBEKANNT });
    expect(zuordnungOhneErkennung(0).auswahl).toBe(false);
    expect(zuordnungOhneErkennung(1).hinweis).toBe(HINWEIS_ZUORDNUNG_UNBEKANNT_EINS);
    expect(zuordnungAusErkennung(['u/1.jpg'], []).hinweis).toBe(HINWEIS_ZUORDNUNG_UNBEKANNT_EINS);
  });

  it('tauschen: zwei Fotos vertauschen, ein Foto umschalten; Status manuell', () => {
    const zwei = standardZuordnung(2, 'erkannt');
    expect(tauscheZuordnung(zwei)).toEqual([{ art: 'tacho', status: 'manuell' }, { art: 'beleg', status: 'manuell' }]);
    expect(tauscheZuordnung(tauscheZuordnung(zwei)).map((f) => f.art)).toEqual(['beleg', 'tacho']);
    expect(tauscheZuordnung([{ art: 'beleg', status: 'erkannt' }])).toEqual([{ art: 'tacho', status: 'manuell' }]);
    expect(tauscheZuordnung([])).toEqual([]);
  });

  it('waehleArt: das andere Foto bekommt automatisch die andere Art', () => {
    const r = waehleArt(standardZuordnung(2), 1, 'beleg');
    expect(r).toEqual([{ art: 'tacho', status: 'manuell' }, { art: 'beleg', status: 'manuell' }]);
    const eins = waehleArt(standardZuordnung(1), 0, 'tacho');
    expect(eins).toEqual([{ art: 'tacho', status: 'manuell' }]);
    const gleich = waehleArt(standardZuordnung(2), 0, 'beleg');
    expect(gleich).toEqual([{ art: 'beleg', status: 'manuell' }, { art: 'tacho', status: 'standard' }]);
    const z0 = standardZuordnung(2);
    expect(waehleArt(z0, 5, 'beleg')).toBe(z0);
  });

  it('fotoPfade: aus Zuordnung, defensiv bei doppelter Art, ohne Pfad übersprungen', () => {
    expect(fotoPfade([{ pfad: 'a', art: 'tacho' }, { pfad: 'b', art: 'beleg' }])).toEqual({ beleg_foto_pfad: 'b', tacho_foto_pfad: 'a' });
    expect(fotoPfade([{ pfad: 'a', art: 'tacho' }])).toEqual({ beleg_foto_pfad: null, tacho_foto_pfad: 'a' });
    expect(fotoPfade([{ pfad: 'a', art: 'beleg' }, { pfad: 'b', art: 'beleg' }])).toEqual({ beleg_foto_pfad: 'a', tacho_foto_pfad: 'b' });
    expect(fotoPfade([{ pfad: 'a', art: null }, { pfad: 'b', art: null }])).toEqual({ beleg_foto_pfad: 'a', tacho_foto_pfad: 'b' });
    expect(fotoPfade([{ pfad: null, art: 'beleg' }, { pfad: 'b', art: 'tacho' }])).toEqual({ beleg_foto_pfad: null, tacho_foto_pfad: 'b' });
    expect(fotoPfade([])).toEqual({ beleg_foto_pfad: null, tacho_foto_pfad: null });
  });

  it('freiePlaetze: höchstens 2 Fotos insgesamt', () => {
    expect(freiePlaetze(0, 1)).toEqual({ uebernehmen: 1, verworfen: 0 });
    expect(freiePlaetze(0, 3)).toEqual({ uebernehmen: 2, verworfen: 1 });
    expect(freiePlaetze(1, 2)).toEqual({ uebernehmen: 1, verworfen: 1 });
    expect(freiePlaetze(2, 1)).toEqual({ uebernehmen: 0, verworfen: 1 });
    expect(MAX_FOTOS).toBe(2);
  });

  it('zuordnungStatusText: immer Text, nie nur Farbe', () => {
    for (const s of ['erkannt', 'unsicher', 'standard', 'manuell', 'gespeichert'] as const) {
      expect(zuordnungStatusText(s).text.length).toBeGreaterThan(0);
    }
  });
});
