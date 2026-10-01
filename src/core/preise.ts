// Preisanalyse (SPEC 8.3).
//
// Entscheide:
// - Preis je Beleg = betrag_chf / liter (SPEC 5.4, auch für Fremdwährung; Fremdwährung ist im Punkt gekennzeichnet).
// - Geschätzte Belege (ohne Beleg, frei geschätzter Preis) erscheinen im Punktdiagramm (markiert), fliessen aber NICHT
//   in Durchschnitt, Tabelle, «günstigste Tankstelle» und Ersparnis ein (`geschaetztAusgenommen` = Anzahl).
// - Durchschnitt = Σ betrag_chf / Σ liter der nicht geschätzten Belege im Zeitraum (nicht Mittel der Einzelpreise);
//   gleiche Definition wie belegKennzahlen().preisProLiter, aber ohne geschätzte Belege.
// - Tankstelle null/leer => «Unbekannt». Gruppen: zwei häufigste Tankstellen (Gleichstand: mehr Liter, dann Name),
//   plus «Übrige», sofern es weitere gibt.
// - Tabelle je Tankstelle: preisSchnitt = Σ CHF / Σ Liter; diff = preisSchnitt − günstigster Schnitt;
//   mehrkosten = liter × diff (auf Rappen gerundet); ersparnis = Σ Mehrkosten.
//   Tabelle sortiert nach Anzahl Betankungen absteigend, dann Name.
import type { Tankvorgang, Zeitraum } from './types';
import { eintraegeImZeitraum } from './kennzahlen';
import { rundeZahl, summe } from './segments';

export interface PreisPunkt {
  id: string; datum: string; preisChf: number; tankstelle: string; gruppe: string;
  geschaetzt: boolean;
  /** Belegwährung, sofern nicht CHF (Preis ist in CHF umgerechnet) */
  fremdwaehrung: string | null;
}
export interface PreisTabellenZeile {
  tankstelle: string;
  anzahl: number;
  liter: number;
  preisSchnitt: number;
  diffZurGuenstigsten: number;
  mehrkosten: number;
}
export interface PreisAnalyse {
  punkte: PreisPunkt[];
  durchschnitt: number | null;
  gruppen: string[];
  tabelle: PreisTabellenZeile[];
  guenstigste: string | null;
  ersparnis: number;
  /** Anzahl geschätzter Belege im Zeitraum, die aus Ø, Tabelle und Ersparnis ausgenommen sind */
  geschaetztAusgenommen: number;
  /** Anzahl Belege in Fremdwährung (in CHF umgerechnet) unter den berücksichtigten Belegen */
  fremdBerechnet: number;
}

export const UEBRIGE = 'Übrige';
const UNBEKANNT = 'Unbekannt';

export function preisAnalyse(e: Tankvorgang[], z: Zeitraum): PreisAnalyse {
  const liste = eintraegeImZeitraum(e, z).filter((x) => x.liter > 0);
  if (liste.length === 0) {
    return { punkte: [], durchschnitt: null, gruppen: [], tabelle: [], guenstigste: null, ersparnis: 0, geschaetztAusgenommen: 0, fremdBerechnet: 0 };
  }
  const name = (x: Tankvorgang) => (x.tankstelle && x.tankstelle.trim() !== '' ? x.tankstelle.trim() : UNBEKANNT);

  const basis = liste.filter((x) => !x.geschaetzt);
  const geschaetztAusgenommen = liste.length - basis.length;
  // Gruppen/Farben nach allen Belegen, damit auch rein geschätzte Punkte einer Gruppe zugeordnet sind
  const je = new Map<string, Tankvorgang[]>();
  for (const x of liste) {
    const n = name(x);
    je.set(n, [...(je.get(n) ?? []), x]);
  }
  const rang = [...je.entries()]
    .map(([n, l]) => ({ n, anzahl: l.length, liter: summe(l.map((x) => x.liter)) }))
    .sort((a, b) => b.anzahl - a.anzahl || b.liter - a.liter || a.n.localeCompare(b.n, 'de'));
  const top = rang.slice(0, 2).map((r) => r.n);
  const gruppen = rang.length > 2 ? [...top, UEBRIGE] : top;

  const punkte: PreisPunkt[] = liste.map((x) => ({
    id: x.id,
    datum: x.datum,
    preisChf: x.betrag_chf / x.liter,
    tankstelle: name(x),
    gruppe: top.includes(name(x)) ? name(x) : UEBRIGE,
    geschaetzt: x.geschaetzt,
    fremdwaehrung: x.waehrung !== 'CHF' ? x.waehrung : null,
  }));

  const literGes = summe(basis.map((x) => x.liter));
  const durchschnitt = literGes > 0 ? summe(basis.map((x) => x.betrag_chf)) / literGes : null;
  const fremdBerechnet = basis.filter((x) => x.waehrung !== 'CHF').length;

  if (basis.length === 0) {
    return { punkte, durchschnitt: null, gruppen, tabelle: [], guenstigste: null, ersparnis: 0, geschaetztAusgenommen, fremdBerechnet };
  }

  const jeBasis = new Map<string, Tankvorgang[]>();
  for (const x of basis) {
    const n = name(x);
    jeBasis.set(n, [...(jeBasis.get(n) ?? []), x]);
  }
  const rangBasis = [...jeBasis.entries()]
    .map(([n, l]) => ({ n, anzahl: l.length, liter: summe(l.map((x) => x.liter)) }))
    .sort((a, b) => b.anzahl - a.anzahl || b.liter - a.liter || a.n.localeCompare(b.n, 'de'));
  const zeilen = rangBasis.map((r) => {
    const l = jeBasis.get(r.n)!;
    const chf = summe(l.map((x) => x.betrag_chf));
    return { tankstelle: r.n, anzahl: r.anzahl, liter: r.liter, chf, preisSchnitt: chf / r.liter };
  });
  const minPreis = Math.min(...zeilen.map((z2) => z2.preisSchnitt));
  const guenstigste = zeilen.find((z2) => z2.preisSchnitt === minPreis)!.tankstelle;
  const tabelle: PreisTabellenZeile[] = zeilen.map((z2) => {
    const diff = z2.preisSchnitt - minPreis;
    return {
      tankstelle: z2.tankstelle,
      anzahl: z2.anzahl,
      liter: z2.liter,
      preisSchnitt: z2.preisSchnitt,
      diffZurGuenstigsten: diff,
      mehrkosten: rundeZahl(z2.liter * diff, 2),
    };
  });
  return {
    punkte,
    durchschnitt,
    gruppen,
    tabelle,
    guenstigste,
    ersparnis: summe(tabelle.map((t) => t.mehrkosten)),
    geschaetztAusgenommen,
    fremdBerechnet,
  };
}
