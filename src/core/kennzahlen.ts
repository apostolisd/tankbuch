// Kennzahlen für einen Zeitraum (SPEC 5.2).
//
// Entscheide:
// - BelegKennzahlen.ausgaben/liter umfassen ALLE Belege (Fremdwährung via betrag_chf umgerechnet).
//   preisProLiter = ausgaben / liter, also Σ betrag_chf / Σ liter über ALLE Belege (eine einheitliche Definition
//   für Tankbuch, Verlauf und Preise; SPEC 5.4: «betrag_chf / liter»). Fremdwährungsbelege sind darin in CHF
//   umgerechnet enthalten und werden zusätzlich separat ausgewiesen (Kennzeichnung in der Anzeige).
// - Verbrauch: nur Segmente, die zaehltImDurchschnitt (gültig, oder geschätzt + Einstellung).
// - kostenPro100km: Σ kosten / Σ km über Segmente gültig + unvollständig (+ geschätzte, wenn eingerechnet);
//   unplausible Segmente fehlen dort, weil bei ihnen vermutlich ein Beleg fehlt (Kosten wären zu tief).
//   «km» (Gesamt) zählt dagegen alle Segmente mit Enddatum im Zeitraum.
// - ausgeschlossen = Segmente, die nicht in den Verbrauch einfliessen (mit Grund).
import type { BelegKennzahlen, Einstellungen, Segment, SegmentKennzahlen, Tankvorgang, Zeitraum } from './types';
import { rundeZahl, summe, zaehltImDurchschnitt } from './segments';

function vgl(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Einträge mit von <= datum <= bis (inklusiv), aufsteigend nach datum, km_stand. */
export function eintraegeImZeitraum(e: Tankvorgang[], z: Zeitraum): Tankvorgang[] {
  return e
    .filter((x) => x.datum >= z.von && x.datum <= z.bis)
    .sort((a, b) => vgl(a.datum, b.datum) || a.km_stand - b.km_stand);
}

export function belegKennzahlen(e: Tankvorgang[], z: Zeitraum): BelegKennzahlen {
  const liste = eintraegeImZeitraum(e, z);
  const fremd = new Map<string, { waehrung: string; betragOriginal: number; betragChf: number; anzahl: number }>();
  for (const x of liste) {
    if (x.waehrung === 'CHF') continue;
    const f = fremd.get(x.waehrung) ?? { waehrung: x.waehrung, betragOriginal: 0, betragChf: 0, anzahl: 0 };
    f.betragOriginal += x.betrag;
    f.betragChf += x.betrag_chf;
    f.anzahl += 1;
    fremd.set(x.waehrung, f);
  }
  const ausgaben = summe(liste.map((x) => x.betrag_chf));
  const liter = summe(liste.map((x) => x.liter));
  return {
    ausgaben,
    liter,
    preisProLiter: liter > 0 ? ausgaben / liter : null,
    anzahl: liste.length,
    teilbetankungen: liste.filter((x) => !x.volltankung).length,
    geschaetzt: liste.filter((x) => x.geschaetzt).length,
    fremdwaehrung: [...fremd.values()].map((f) => ({
      ...f,
      betragOriginal: rundeZahl(f.betragOriginal, 2),
      betragChf: rundeZahl(f.betragChf, 2),
    })),
  };
}

/** Segmente mit Enddatum im Zeitraum. */
export function segmenteImZeitraum(segmente: Segment[], z: Zeitraum): Segment[] {
  return segmente.filter((s) => s.enddatum >= z.von && s.enddatum <= z.bis);
}

/** Segmente, deren Kosten in «Kosten pro 100 km» einfliessen (gültig + unvollständig + eingerechnete geschätzte). */
export function zaehltFuerKosten(s: Segment, einst: Einstellungen): boolean {
  return s.status === 'unvollstaendig' || zaehltImDurchschnitt(s, einst);
}

export function segmentKennzahlen(segmente: Segment[], z: Zeitraum, einst: Einstellungen): SegmentKennzahlen {
  const liste = segmenteImZeitraum(segmente, z);
  const gueltig = liste.filter((s) => zaehltImDurchschnitt(s, einst));
  const kostenBasis = liste.filter((s) => zaehltFuerKosten(s, einst));
  const km = liste.reduce((a, s) => a + s.km, 0);
  const kmGueltig = gueltig.reduce((a, s) => a + s.km, 0);
  const literGueltig = summe(gueltig.map((s) => s.liter));
  const kmKosten = kostenBasis.reduce((a, s) => a + s.km, 0);
  const kosten = summe(kostenBasis.map((s) => s.kosten));
  const kostenPro100km = kmKosten > 0 ? (kosten / kmKosten) * 100 : null;
  return {
    km,
    verbrauch: kmGueltig > 0 ? (literGueltig / kmGueltig) * 100 : null,
    literGueltig,
    kmGueltig,
    kostenPro100km,
    rpProKm: kostenPro100km, // CHF/100 km entspricht numerisch Rp./km
    segmenteGesamt: liste.length,
    segmenteGueltig: gueltig.length,
    ausgeschlossen: liste
      .filter((s) => !zaehltImDurchschnitt(s, einst))
      .map((s) => ({ segment: s, grund: s.grund ?? 'nicht in den Durchschnitt einbezogen' })),
  };
}

/** Zusatzsummen für Berichte: Gesamtkosten und -liter aller Segmente im Zeitraum (unabhängig vom Status). */
export function segmentSummen(segmente: Segment[], z: Zeitraum) {
  const liste = segmenteImZeitraum(segmente, z);
  return {
    anzahl: liste.length,
    km: liste.reduce((a, s) => a + s.km, 0),
    liter: summe(liste.map((s) => s.liter)),
    kosten: summe(liste.map((s) => s.kosten)),
  };
}
