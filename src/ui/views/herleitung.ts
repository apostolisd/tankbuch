// Hilfsfunktionen für die Herleitung der Kosten pro 100 km (rein, testbar).
// Verwendet dieselbe Regel wie die Fachlogik (zaehltFuerKosten aus core/kennzahlen): keine Kandidaten-Heuristik.
import type { Einstellungen, Segment, Zeitraum } from '../../core/types';
import { segmenteImZeitraum, zaehltFuerKosten } from '../../core/kennzahlen';
import { summe } from '../../core/segments';

export { segmenteImZeitraum };

export interface KostenBasis {
  /** Σ Kosten der Segmente, die in «Kosten pro 100 km» einfliessen */
  kosten: number;
  /** Σ km derselben Segmente */
  km: number;
  n: number;
  /** Segmente im Zeitraum, die bei den Kosten FEHLEN (z.B. unplausibel), mit ihren km (sie sind in «Gefahrene km» enthalten) */
  fehlend: Segment[];
  kmFehlend: number;
  /** Σ km aller Segmente im Zeitraum (= «Gefahrene km») */
  kmAlle: number;
}

/** Basis von «Kosten pro 100 km»: exakt die Segmente, die segmentKennzahlen() verwendet. */
export function kostenBasis(segmente: Segment[], z: Zeitraum, einst: Einstellungen): KostenBasis {
  const inZ = segmenteImZeitraum(segmente, z);
  const sel = inZ.filter((s) => zaehltFuerKosten(s, einst));
  const fehlend = inZ.filter((s) => !zaehltFuerKosten(s, einst));
  return {
    kosten: summe(sel.map((s) => s.kosten)),
    km: sel.reduce((a, s) => a + s.km, 0),
    n: sel.length,
    fehlend,
    kmFehlend: fehlend.reduce((a, s) => a + s.km, 0),
    kmAlle: inZ.reduce((a, s) => a + s.km, 0),
  };
}

/** Welche Statuswerte zählen für die Kosten (Text für die Herleitung, abhängig von der Einstellung). */
export function kostenBasisText(einst: Einstellungen): string {
  return einst.geschaetzteMitrechnen
    ? 'gültigen, unvollständigen und geschätzten Segmente (Einstellung «geschätzte Einträge mitrechnen» ist aktiv)'
    : 'gültigen und unvollständigen Segmente';
}
