// Testdaten aus SPEC Abschnitt 10 (betrag_chf = Betrag der Liste, Wechselkurs 1, Fahrzeug 45 l).
import type { Einstellungen, Fahrzeug, Tankvorgang } from '../src/core/types';

export const FAHRZEUG: Fahrzeug = { id: 'f1', name: 'Testauto', tankvolumen_l: 45 };

export const EINST: Einstellungen = { geschaetzteMitrechnen: false, unvollstaendigeSegmente: [] };

type Zeile = [string, number, number, number, number, string, boolean, string?];

// [datum, km, liter, CHF/l, CHF, Tankstelle, voll, Notiz]
const ZEILEN: Zeile[] = [
  ['2026-01-04', 84210, 42.3, 1.75, 74.03, 'Migrol Dietikon', true],
  ['2026-01-22', 84788, 44.1, 1.83, 80.7, 'Coop Pronto Birmensdorf', true],
  ['2026-02-09', 85351, 43.0, 1.86, 79.98, 'Coop Pronto Birmensdorf', true],
  ['2026-02-27', 85930, 41.8, 1.82, 76.08, 'Migrol Dietikon', true],
  ['2026-03-16', 86540, 20.0, 1.88, 37.6, 'Tamoil Urdorf', false],
  ['2026-03-24', 86812, 39.9, 1.81, 72.22, 'Migrol Dietikon', true],
  ['2026-04-14', 87420, 40.5, 1.85, 74.93, 'Coop Pronto Birmensdorf', true],
  ['2026-05-29', 88690, 43.6, 1.78, 77.61, 'Migrol Dietikon', true],
  ['2026-06-20', 89335, 41.2, 1.82, 74.98, 'Coop Pronto Birmensdorf', true],
  ['2026-07-11', 89980, 43.9, 1.79, 78.58, 'Migrol Dietikon', true],
  ['2026-07-18', 90560, 46.5, 1.95, 90.68, 'Raststätte Gotthard', true, 'Ferienfahrt, Dachbox'],
  ['2026-08-09', 91200, 41.0, 1.88, 77.08, 'Coop Pronto Birmensdorf', true],
  ['2026-09-02', 91845, 41.9, 1.76, 73.74, 'Migrol Dietikon', true],
  ['2026-09-24', 92470, 40.6, 1.8, 73.08, 'Coop Pronto Birmensdorf', true],
];

export function eintrag(p: Partial<Tankvorgang> & Pick<Tankvorgang, 'id'>): Tankvorgang {
  const betrag = p.betrag ?? 70;
  const kurs = p.wechselkurs ?? 1;
  return {
    fahrzeug_id: FAHRZEUG.id,
    datum: '2026-01-01',
    uhrzeit: null,
    km_stand: 0,
    liter: 40,
    betrag,
    waehrung: 'CHF',
    wechselkurs: kurs,
    betrag_chf: Math.round(Number((betrag * kurs * 100).toPrecision(12))) / 100,
    preis_pro_liter: 1.8,
    tankstelle: null,
    kraftstoff: 'Bleifrei 95',
    volltankung: true,
    geschaetzt: false,
    notiz: null,
    konfidenz: null,
    roh_erkennung: null,
    beleg_foto_pfad: null,
    tacho_foto_pfad: null,
    ...p,
  };
}

export const TESTDATEN: Tankvorgang[] = ZEILEN.map(([datum, km, liter, preis, betrag, tankstelle, voll, notiz], i) =>
  eintrag({
    id: `e${String(i + 1).padStart(2, '0')}`,
    datum,
    km_stand: km,
    liter,
    preis_pro_liter: preis,
    betrag,
    betrag_chf: betrag,
    wechselkurs: 1,
    tankstelle,
    volltankung: voll,
    notiz: notiz ?? null,
  }),
);

export const ZEITRAUM_2026 = { von: '2026-01-01', bis: '2026-09-30' };
