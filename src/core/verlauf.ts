// Verlauf (SPEC 8.2).
//
// Entscheide:
// - verbrauchsReihe: wert = Verbrauch des Segments, sofern es in den Durchschnitt zählt, sonst null (= Lücke).
//   gleitend = einfaches Mittel der Verbrauchswerte der letzten 3 zählenden Segmente inkl. des aktuellen;
//   eine Lücke (nicht zählendes Segment) setzt das Fenster zurück; in der Lücke selbst ist gleitend null.
//   Ausreisser: wert > 1.15 × Mittel der bis zu 3 VORANGEHENDEN zählenden Segmente seit der letzten Lücke
//   (das eigene Segment wird ausgeschlossen, sonst würde es sich selbst verdünnen und Ausreisser
//   wie die Ferienfahrt mit 8.0 nicht auffallen). Ohne Vorgänger seit der Lücke: kein Ausreisser.
//   notiz: optionaler dritter Parameter `eintraege`; Notizen der Einträge des Segments, mit « · » verbunden.
// - ausgabenProMonat: belegbasiert (Belegdatum), ALLE Monate von von bis bis (auch mit 0).
// - saisonvergleich(jahr): Winter = Nov (jahr−1) bis Mär (jahr); Sommer = Mai bis Sep (jahr); nach Enddatum.
//   Verbrauch = Σ Liter / Σ km der zählenden Segmente.
import type { BelegKennzahlen, Einstellungen, Segment, SegmentKennzahlen, Tankvorgang, Zeitraum } from './types';
import { belegKennzahlen, eintraegeImZeitraum, segmentKennzahlen } from './kennzahlen';
import { summe, zaehltImDurchschnitt } from './segments';

export interface VerbrauchsPunkt {
  segment: Segment;
  wert: number | null;
  gleitend: number | null;
  luecke: boolean;
  ausreisser: boolean;
  /** Mittel der bis zu 3 vorangehenden zählenden Segmente seit der letzten Lücke: das tatsächlich geprüfte Vergleichsmittel */
  referenz: number | null;
  /** Anzahl Vorgänger, aus denen `referenz` gebildet wurde (0 bis 3) */
  referenzAnzahl: number;
  notiz: string | null;
}

export const AUSREISSER_FAKTOR = 1.15;
export const GLEITEND_FENSTER = 3;

function mittel(w: number[]): number {
  return w.reduce((a, b) => a + b, 0) / w.length;
}

export function verbrauchsReihe(segmente: Segment[], einst: Einstellungen, eintraege?: Tankvorgang[]): VerbrauchsPunkt[] {
  const notizen = new Map<string, string>();
  for (const e of eintraege ?? []) if (e.notiz && e.notiz.trim() !== '') notizen.set(e.id, e.notiz.trim());
  let fenster: number[] = [];
  return segmente.map((segment) => {
    const notizListe = segment.eintragIds.map((id) => notizen.get(id)).filter((n): n is string => !!n);
    const notiz = notizListe.length ? notizListe.join(' · ') : null;
    const zaehlt = zaehltImDurchschnitt(segment, einst) && segment.verbrauch !== null;
    if (!zaehlt) {
      fenster = [];
      return { segment, wert: null, gleitend: null, luecke: true, ausreisser: false, referenz: null, referenzAnzahl: 0, notiz };
    }
    const wert = segment.verbrauch as number;
    const referenz = fenster.length > 0 ? mittel(fenster) : null;
    const referenzAnzahl = fenster.length;
    fenster = [...fenster, wert].slice(-GLEITEND_FENSTER);
    return {
      segment,
      wert,
      gleitend: mittel(fenster),
      luecke: false,
      ausreisser: referenz !== null && wert > referenz * AUSREISSER_FAKTOR,
      referenz,
      referenzAnzahl,
      notiz,
    };
  });
}

export function ausgabenProMonat(e: Tankvorgang[], z: Zeitraum): { monat: string; ausgaben: number }[] {
  const je = new Map<string, number[]>();
  for (const x of eintraegeImZeitraum(e, z)) {
    const k = x.datum.slice(0, 7);
    je.set(k, [...(je.get(k) ?? []), x.betrag_chf]);
  }
  const res: { monat: string; ausgaben: number }[] = [];
  let [j, m] = z.von.slice(0, 7).split('-').map(Number);
  const [jEnde, mEnde] = z.bis.slice(0, 7).split('-').map(Number);
  while (j < jEnde || (j === jEnde && m <= mEnde)) {
    const k = `${String(j).padStart(4, '0')}-${String(m).padStart(2, '0')}`;
    res.push({ monat: k, ausgaben: summe(je.get(k) ?? []) });
    m += 1;
    if (m > 12) { m = 1; j += 1; }
  }
  return res;
}

export function saisonvergleich(
  segmente: Segment[],
  einst: Einstellungen,
  jahr: number,
): { winter: { verbrauch: number | null; n: number }; sommer: { verbrauch: number | null; n: number } } {
  const agg = (pred: (j: number, m: number) => boolean) => {
    const l = segmente.filter((s) => {
      if (!zaehltImDurchschnitt(s, einst) || s.verbrauch === null) return false;
      const [j, m] = s.enddatum.split('-').map(Number);
      return pred(j, m);
    });
    const km = l.reduce((a, s) => a + s.km, 0);
    return { verbrauch: km > 0 ? (summe(l.map((s) => s.liter)) / km) * 100 : null, n: l.length };
  };
  return {
    winter: agg((j, m) => (j === jahr - 1 && m >= 11) || (j === jahr && m <= 3)),
    sommer: agg((j, m) => j === jahr && m >= 5 && m <= 9),
  };
}

export interface Kombi { beleg: BelegKennzahlen; seg: SegmentKennzahlen }

export function vergleicheZeitraeume(
  e: Tankvorgang[],
  segmente: Segment[],
  a: Zeitraum,
  b: Zeitraum,
  einst: Einstellungen,
): { a: Kombi; b: Kombi } {
  return {
    a: { beleg: belegKennzahlen(e, a), seg: segmentKennzahlen(segmente, a, einst) },
    b: { beleg: belegKennzahlen(e, b), seg: segmentKennzahlen(segmente, b, einst) },
  };
}
