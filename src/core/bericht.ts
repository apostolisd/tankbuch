// Monatsbericht (SPEC 8.4). Segmentbasiert: ein Segment gehört zum Monat seines Enddatums.
//
// Entscheide:
// - ausgaben = Σ Kosten ALLER Segmente des Monats (Segmentkosten, unabhängig vom Status);
//   kostenPro100km nach Regel SPEC 5.2 (gültig + unvollständig); Abweichung wird bei Lücken erwähnt.
// - Vormonat/Vorjahr = null, wenn dort kein Segment endet.
// - veraenderung: relative Änderung in Prozent (Monat vs. Referenz) je Kennzahl; null, wenn Referenz fehlt oder 0.
// - treiber (für die Veränderung der Kosten): Kosten = km × (l/km) × (CHF/l), jeweils aus den zählenden Segmenten.
//   Verglichen wird mit dem Vormonat (falls nicht vorhanden mit dem Vorjahresmonat). Treiber = Faktor mit der
//   grössten logarithmischen Änderung: Fahrleistung (km), Verbrauch (l/100 km) oder Preis (CHF/l).
//   Ist die Gesamtänderung der Kosten kleiner als 2 %, oder fehlen Daten, ist der Treiber null.
// - jahresverlauf: 12 Einträge (Monat 1–12) des Berichtsjahrs mit CHF/100 km oder null.
// - Der Text besteht nur aus festen Satzbausteinen (kein KI-Aufruf).
import type { Einstellungen, Segment, Tankvorgang } from './types';
import { monatsZeitraum } from './zeitraum';
import { belegKennzahlen, segmentKennzahlen, segmentSummen, segmenteImZeitraum, zaehltFuerKosten } from './kennzahlen';
import { summe, zaehltImDurchschnitt } from './segments';

export type Treiber = 'Fahrleistung' | 'Preis' | 'Verbrauch';

export interface MonatsKennzahlen {
  jahr: number;
  monat: number;
  km: number;
  ausgaben: number;
  liter: number;
  verbrauch: number | null;
  kostenPro100km: number | null;
  /** nur zählende Segmente (Basis der Treiber-Analyse) */
  kmGueltig: number;
  literGueltig: number;
  kostenGueltig: number;
  /** Basis «Kosten pro 100 km»: Segmente, die zaehltFuerKosten() erfüllen (gültig + unvollständig [+ geschätzt]) */
  kmKosten: number;
  kostenKosten: number;
  preisProLiter: number | null;
  segmenteGesamt: number;
  segmenteGueltig: number;
}

export interface Veraenderung {
  km: number | null;
  ausgaben: number | null;
  verbrauch: number | null;
  kostenPro100km: number | null;
}

export interface MonatsBericht {
  jahr: number;
  monat: number;
  km: number;
  ausgaben: number;
  verbrauch: number | null;
  kostenPro100km: number | null;
  segmenteGesamt: number;
  segmenteGueltig: number;
  /** vollständige Kennzahlen des Berichtsmonats (Basis der Herleitungen); null, wenn kein Segment endet */
  aktuell: MonatsKennzahlen | null;
  vormonat: MonatsKennzahlen | null;
  vorjahr: MonatsKennzahlen | null;
  veraenderung: { vormonat: Veraenderung | null; vorjahr: Veraenderung | null };
  treiber: Treiber | null;
  /** Referenzmonat der Treiber-Analyse */
  treiberReferenz: 'Vormonat' | 'Vorjahresmonat' | null;
  /** Belege (belegbasiert) mit Datum im Monat: für den Hinweis, wenn kein Segment im Monat endet */
  belege: { anzahl: number; ausgaben: number };
  text: string;
  jahresverlauf: { monat: number; kostenPro100km: number | null }[];
  luecken: string[];
  methode: string;
}

export const MONATSNAMEN = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function fz(n: number, d = 0): string {
  const [ganz, dez] = Math.abs(n).toFixed(d).split('.');
  const g = ganz.replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return (n < 0 && Number(n.toFixed(d)) !== 0 ? '-' : '') + g + (dez ? '.' + dez : '');
}

function monatKennzahlen(segmente: Segment[], jahr: number, monat: number, einst: Einstellungen): MonatsKennzahlen | null {
  const z = monatsZeitraum(jahr, monat);
  const liste = segmenteImZeitraum(segmente, z);
  if (liste.length === 0) return null;
  const k = segmentKennzahlen(segmente, z, einst);
  const s = segmentSummen(segmente, z);
  const gueltig = liste.filter((x) => zaehltImDurchschnitt(x, einst));
  const kostenGueltig = summe(gueltig.map((x) => x.kosten));
  const kostenSeg = liste.filter((x) => zaehltFuerKosten(x, einst));
  return {
    jahr,
    monat,
    km: k.km,
    ausgaben: s.kosten,
    liter: s.liter,
    verbrauch: k.verbrauch,
    kostenPro100km: k.kostenPro100km,
    kmGueltig: k.kmGueltig,
    literGueltig: k.literGueltig,
    kostenGueltig,
    kmKosten: kostenSeg.reduce((a, x) => a + x.km, 0),
    kostenKosten: summe(kostenSeg.map((x) => x.kosten)),
    preisProLiter: k.literGueltig > 0 ? kostenGueltig / k.literGueltig : null,
    segmenteGesamt: k.segmenteGesamt,
    segmenteGueltig: k.segmenteGueltig,
  };
}

function prozent(neu: number | null, alt: number | null): number | null {
  if (neu === null || alt === null || alt === 0) return null;
  return ((neu - alt) / alt) * 100;
}

function delta(a: MonatsKennzahlen, b: MonatsKennzahlen | null): Veraenderung | null {
  if (!b) return null;
  return {
    km: prozent(a.km, b.km),
    ausgaben: prozent(a.ausgaben, b.ausgaben),
    verbrauch: prozent(a.verbrauch, b.verbrauch),
    kostenPro100km: prozent(a.kostenPro100km, b.kostenPro100km),
  };
}

function bestimmeTreiber(a: MonatsKennzahlen, ref: MonatsKennzahlen | null): Treiber | null {
  if (!ref) return null;
  if (a.kmGueltig <= 0 || a.literGueltig <= 0 || a.kostenGueltig <= 0) return null;
  if (ref.kmGueltig <= 0 || ref.literGueltig <= 0 || ref.kostenGueltig <= 0) return null;
  if (Math.abs(Math.log(a.kostenGueltig / ref.kostenGueltig)) < Math.log(1.02)) return null;
  const faktoren: [Treiber, number][] = [
    ['Fahrleistung', Math.log(a.kmGueltig / ref.kmGueltig)],
    ['Verbrauch', Math.log(a.literGueltig / a.kmGueltig / (ref.literGueltig / ref.kmGueltig))],
    ['Preis', Math.log(a.kostenGueltig / a.literGueltig / (ref.kostenGueltig / ref.literGueltig))],
  ];
  faktoren.sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
  return faktoren[0][0];
}

function richtung(p: number, hoch: string, tief: string): string {
  return p >= 0 ? hoch : tief;
}

function baueText(
  jahr: number,
  monat: number,
  a: MonatsKennzahlen | null,
  vm: Veraenderung | null,
  treiber: Treiber | null,
  treiberReferenz: string | null,
): string {
  const name = `${MONATSNAMEN[monat - 1]} ${jahr}`;
  if (!a) return `Im ${name} endete kein Segment, daher liegen keine Kennzahlen vor.`;
  const teile: string[] = [];
  teile.push(
    `Im ${name} wurden ${fz(a.km)} km gefahren (Kraftstoffkosten dieser Segmente: ${fz(a.ausgaben, 2)} CHF)` +
      (a.verbrauch !== null ? `, bei einem Verbrauch von ${fz(a.verbrauch, 2)} l/100 km` : '') +
      (a.kostenPro100km !== null ? ` und Kosten von ${fz(a.kostenPro100km, 2)} CHF pro 100 km.` : '.'),
  );
  if (vm?.kostenPro100km != null) {
    const p = vm.kostenPro100km;
    if (Math.abs(p) < 1) teile.push('Die Kosten pro 100 km sind gegenüber dem Vormonat praktisch unverändert.');
    else teile.push(`Die Kosten pro 100 km liegen ${fz(Math.abs(p), 1)} % ${richtung(p, 'über', 'unter')} dem Vormonat.`);
  }
  if (treiber) {
    const satz: Record<Treiber, string> = {
      Fahrleistung: 'die Fahrleistung',
      Preis: 'den Kraftstoffpreis',
      Verbrauch: 'den Verbrauch',
    };
    teile.push(
      `Die Veränderung der Kosten der gültigen Segmente gegenüber dem ${treiberReferenz ?? 'Vormonat'} geht hauptsächlich auf ${satz[treiber]} zurück.`,
    );
  }
  return teile.join(' ');
}

export function monatsBericht(
  e: Tankvorgang[],
  segmente: Segment[],
  jahr: number,
  monat: number,
  einst: Einstellungen,
): MonatsBericht {
  const aktuell = monatKennzahlen(segmente, jahr, monat, einst);
  const vmJahr = monat === 1 ? jahr - 1 : jahr;
  const vmMonat = monat === 1 ? 12 : monat - 1;
  const vormonat = monatKennzahlen(segmente, vmJahr, vmMonat, einst);
  const vorjahr = monatKennzahlen(segmente, jahr - 1, monat, einst);

  const veraenderung = {
    vormonat: aktuell ? delta(aktuell, vormonat) : null,
    vorjahr: aktuell ? delta(aktuell, vorjahr) : null,
  };
  const treiberRef = vormonat ?? vorjahr;
  const treiber = aktuell ? bestimmeTreiber(aktuell, treiberRef) : null;
  const treiberReferenz = treiberRef === null ? null : vormonat ? 'Vormonat' : 'Vorjahresmonat';
  const belegMonat = belegKennzahlen(e, monatsZeitraum(jahr, monat));

  const jahresverlauf = Array.from({ length: 12 }, (_, i) => ({
    monat: i + 1,
    kostenPro100km: monatKennzahlen(segmente, jahr, i + 1, einst)?.kostenPro100km ?? null,
  }));

  const luecken: string[] = [];
  const name = `${MONATSNAMEN[monat - 1]} ${jahr}`;
  if (!aktuell) {
    luecken.push(`Im ${name} endete kein Segment (keine Volltankung, die ein Segment abschliesst): keine Kennzahlen.`);
  } else {
    const k = segmentKennzahlen(segmente, monatsZeitraum(jahr, monat), einst);
    for (const a of k.ausgeschlossen) {
      const s = a.segment;
      luecken.push(`Segment bis ${s.enddatum.split('-').reverse().join('.')} (${fz(s.km)} km) fliesst nicht in den Verbrauch ein: ${a.grund}.`);
    }
    if (!vormonat) luecken.push('Für den Vormonat liegen keine Daten vor: kein Vergleich.');
    if (!vorjahr) luecken.push('Für den Vorjahresmonat liegen keine Daten vor: kein Vergleich.');
    const ersterMonat = jahresverlauf.find((x) => x.kostenPro100km !== null)?.monat;
    if (ersterMonat !== undefined) {
      const leer = jahresverlauf.filter((x) => x.monat > ersterMonat && x.monat < monat && x.kostenPro100km === null).map((x) => MONATSNAMEN[x.monat - 1]);
      if (leer.length) luecken.push(`Ohne Daten im Jahresverlauf: ${leer.join(', ')}.`);
    }
  }

  return {
    jahr,
    monat,
    km: aktuell?.km ?? 0,
    ausgaben: aktuell?.ausgaben ?? 0,
    verbrauch: aktuell?.verbrauch ?? null,
    kostenPro100km: aktuell?.kostenPro100km ?? null,
    segmenteGesamt: aktuell?.segmenteGesamt ?? 0,
    segmenteGueltig: aktuell?.segmenteGueltig ?? 0,
    aktuell,
    vormonat,
    vorjahr,
    veraenderung,
    treiber,
    treiberReferenz,
    belege: { anzahl: belegMonat.anzahl, ausgaben: belegMonat.ausgaben },
    text: baueText(jahr, monat, aktuell, veraenderung.vormonat, treiber, treiberReferenz),
    jahresverlauf,
    luecken,
    methode:
      'Monatszuordnung segmentbasiert: Ein Segment (Volltankung bis Volltankung) zählt zum Monat seines Enddatums. ' +
      'Verbrauch = Σ Liter / Σ Kilometer × 100 aus ' + (einst.geschaetzteMitrechnen ? 'gültigen und geschätzten (eingerechneten)' : 'gültigen') + ' Segmenten; ' +
      'Ausgaben (Segmentkosten) = Kosten aller Segmente des Monats, unabhängig vom Status; ' +
      'CHF pro 100 km aus ' + (einst.geschaetzteMitrechnen ? 'gültigen, geschätzten (eingerechneten) und unvollständigen' : 'gültigen und unvollständigen') + ' Segmenten (unplausible Segmente fehlen dort).',
  };
}

