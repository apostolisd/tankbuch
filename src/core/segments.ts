// Segmentlogik (SPEC 5.1): Voll-zu-Voll-Segmente.
//
// Entscheide zu Mehrdeutigkeiten:
// - berechneSegmente erwartet die Einträge EINES Fahrzeugs (Filterung nach Fahrzeug ist Sache des Aufrufers).
// - Status-Priorität, wenn mehrere Gründe zutreffen: unvollstaendig (Nutzer) > unplausibel > geschaetzt > gueltig.
//   Ein Segment mit geschätztem Eintrag UND unplausiblem Verbrauch gilt als unplausibel (kein Verbrauch).
// - km <= 0 (gleicher/fallender km-Stand) => unplausibel, verbrauch null.
// - Verbrauch wird ungerundet gespeichert (Grenzen VERBRAUCH_MIN und VERBRAUCH_MAX inklusiv gültig); liter/kosten auf 2 Stellen gerundet.
// - Teilbetankungen vor der ersten Volltankung sowie nach der letzten Volltankung gehören zu keinem Segment.
import type { Einstellungen, Segment, Tankvorgang } from './types';

// ACHTUNG Abweichung von SPEC 5.1/5.3 (3.0): Die SPEC verlangt zugleich, dass das Segment 29.05. (3.43 l/100 km)
// als unplausibel gilt (SPEC 10). Beides zusammen ist widersprüchlich. Um die Erwartungswerte aus SPEC 10 zu
// reproduzieren, liegt die untere Grenze bei 3.5. Zurück auf 3.0: nur diese Konstante ändern (dann ist das 29.05.-Segment gültig).
export const VERBRAUCH_MIN = 3.5;
export const VERBRAUCH_MAX = 15.0;

/** «3.5 bis 15.0 l/100 km» aus den Konstanten (für alle Anzeigetexte, nie Zahlen hartkodieren). */
export function verbrauchsGrenzenText(): string {
  return `${VERBRAUCH_MIN.toFixed(1)} bis ${VERBRAUCH_MAX.toFixed(1)} l/100 km`;
}

/**
 * Schlüssel einer «unvollständig»-Markierung: genau dieses Segment (Start- und Endeintrag).
 * Wird ein Eintrag dazwischen eingefügt oder gelöscht, passt der Schlüssel nicht mehr auf ein anderes Segment
 * (früher: nur endId, dann galt die Markierung fälschlich für das neue, kürzere Segment).
 */
export function segmentSchluessel(startId: string, endId: string): string {
  return `${startId}>${endId}`;
}

/** Ist das Segment markiert? Neuer Schlüssel (start>end) oder alter Schlüssel (nur endId, Rückwärtskompatibilität). */
export function istMarkiert(startId: string, endId: string, einst: Einstellungen): boolean {
  const l = einst.unvollstaendigeSegmente;
  return l.includes(segmentSchluessel(startId, endId)) || l.includes(endId);
}

/** Markierungen, die zu keinem Segment mehr passen (z.B. nach Einfügen/Löschen eines Eintrags). */
export function verwaisteMarkierungen(segmente: Segment[], einst: Einstellungen): string[] {
  return einst.unvollstaendigeSegmente.filter(
    (m) => !segmente.some((s) => segmentSchluessel(s.startId, s.endId) === m || s.endId === m),
  );
}

/** Rundet sauber auf `dez` Stellen (fängt Float-Artefakte wie 1.005 oder 74.02499999 ab). */
export function rundeZahl(x: number, dez = 2): number {
  if (!Number.isFinite(x)) return x;
  const f = Math.pow(10, dez);
  return Math.round(Number((x * f).toPrecision(12))) / f;
}

/** Summe mit Rundung am Ende (Geld/Liter). */
export function summe(werte: number[], dez = 2): number {
  let s = 0;
  for (const w of werte) s += w;
  return rundeZahl(s, dez);
}

function vgl(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortiereEintraege(e: Tankvorgang[]): Tankvorgang[] {
  return [...e].sort(
    (a, b) =>
      a.km_stand - b.km_stand ||
      vgl(a.datum, b.datum) ||
      vgl(a.uhrzeit ?? '', b.uhrzeit ?? '') ||
      vgl(a.id, b.id),
  );
}

export function zaehltImDurchschnitt(s: Segment, einst: Einstellungen): boolean {
  return s.status === 'gueltig' || (s.status === 'geschaetzt' && einst.geschaetzteMitrechnen);
}

export function berechneSegmente(eintraege: Tankvorgang[], einst: Einstellungen): Segment[] {
  const sortiert = sortiereEintraege(eintraege);
  const segmente: Segment[] = [];
  let start: Tankvorgang | null = null;
  let akku: Tankvorgang[] = [];

  for (const e of sortiert) {
    if (start === null) {
      if (e.volltankung) start = e; // erste Volltankung eröffnet nur; davor liegende Teilbetankungen werden ignoriert
      continue;
    }
    akku.push(e);
    if (!e.volltankung) continue;

    const km = e.km_stand - start.km_stand;
    const liter = summe(akku.map((x) => x.liter));
    const kosten = summe(akku.map((x) => x.betrag_chf));
    const geschaetzt = akku.some((x) => x.geschaetzt);
    const markiert = istMarkiert(start.id, e.id, einst);

    let status: Segment['status'] = 'gueltig';
    let verbrauch: number | null = km > 0 ? (liter / km) * 100 : null;
    let grund: string | null = null;

    if (markiert) {
      status = 'unvollstaendig';
      verbrauch = null;
      grund = 'vom Nutzer als unvollständig markiert';
    } else if (verbrauch === null || verbrauch < VERBRAUCH_MIN || verbrauch > VERBRAUCH_MAX) {
      const v =
        verbrauch === null
          ? 'Kilometerstand nicht gestiegen'
          : `Verbrauch ${verbrauch.toFixed(1)} l/100 km ausserhalb ${VERBRAUCH_MIN.toFixed(1)}–${VERBRAUCH_MAX.toFixed(1)}`;
      status = 'unplausibel';
      verbrauch = null;
      grund = `${v}: vermutlich fehlt ein Beleg oder die Volltankungs-Markierung stimmt nicht`;
    } else if (geschaetzt) {
      status = 'geschaetzt';
      grund = 'enthält geschätzten Eintrag (ohne Beleg)';
    }

    segmente.push({
      startId: start.id,
      endId: e.id,
      eintragIds: akku.map((x) => x.id),
      teilIds: akku.filter((x) => !x.volltankung).map((x) => x.id),
      kmStart: start.km_stand,
      kmEnde: e.km_stand,
      km,
      liter,
      kosten,
      verbrauch,
      enddatum: e.datum,
      status,
      grund,
    });
    start = e;
    akku = [];
  }

  // nach Enddatum aufsteigend (stabil: bei gleichem Datum bleibt km-Reihenfolge)
  return segmente
    .map((s, i) => ({ s, i }))
    .sort((a, b) => vgl(a.s.enddatum, b.s.enddatum) || a.i - b.i)
    .map((x) => x.s);
}

export function segmentZuEintrag(segmente: Segment[], eintragId: string): Segment | null {
  return segmente.find((s) => s.eintragIds.includes(eintragId)) ?? null;
}
