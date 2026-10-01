// Reine Skalenberechnung für die selbst gezeichneten Diagramme (testbar, ohne DOM).

export interface Skala {
  min: number;
  max: number;
  ticks: number[];
}

/** «Schöne» Schrittweite (1, 2, 2.5, 5 × 10^n) für ungefähr `ziel` Teilungen. */
export function schoeneSchritt(spanne: number, ziel = 4): number {
  if (!(spanne > 0)) return 1;
  const roh = spanne / Math.max(1, ziel);
  const exp = Math.floor(Math.log10(roh));
  const f = roh / Math.pow(10, exp);
  const basis = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return basis * Math.pow(10, exp);
}

/** Y-Skala: beginnt bei 0 (Balken), endet auf einem schönen Wert >= max. */
export function ySkala(werte: (number | null | undefined)[], ziel = 4, beiNull = true): Skala {
  const v = werte.filter((x): x is number => typeof x === 'number' && isFinite(x));
  if (v.length === 0) return { min: 0, max: 1, ticks: [0, 1] };
  let lo = beiNull ? Math.min(0, ...v) : Math.min(...v);
  let hi = Math.max(...v);
  if (hi === lo) hi = lo + 1;
  const schritt = schoeneSchritt(hi - lo, ziel);
  lo = Math.floor(lo / schritt + 1e-9) * schritt;
  hi = Math.ceil(hi / schritt - 1e-9) * schritt;
  const ticks: number[] = [];
  const n = Math.round((hi - lo) / schritt);
  for (let i = 0; i <= n; i++) ticks.push(Math.round((lo + i * schritt) * 1e6) / 1e6);
  return { min: lo, max: hi, ticks };
}

/** Wert -> Pixel (y nach unten). */
export function abbilden(wert: number, s: Skala, oben: number, unten: number): number {
  const t = (wert - s.min) / (s.max - s.min || 1);
  return unten - t * (unten - oben);
}

export interface Band { x: number; breite: number; mitte: number }
/** n gleich breite Bänder zwischen links und rechts; Balkenbreite = Anteil der Bandbreite. */
export function baender(n: number, links: number, rechts: number, anteil = 0.6): Band[] {
  if (n <= 0) return [];
  const w = (rechts - links) / n;
  const bw = w * anteil;
  return Array.from({ length: n }, (_, i) => {
    const mitte = links + w * (i + 0.5);
    return { x: mitte - bw / 2, breite: bw, mitte };
  });
}

export interface Punkt { x: number; y: number | null }
/** Zerlegt eine Linie in zusammenhängende Teilstücke; null-Werte trennen (keine Interpolation). */
export function linienStuecke(punkte: Punkt[]): { x: number; y: number }[][] {
  const out: { x: number; y: number }[][] = [];
  let aktuell: { x: number; y: number }[] = [];
  for (const p of punkte) {
    if (p.y === null || !isFinite(p.y)) {
      if (aktuell.length) out.push(aktuell);
      aktuell = [];
    } else aktuell.push({ x: p.x, y: p.y });
  }
  if (aktuell.length) out.push(aktuell);
  return out;
}

export function pfad(stueck: { x: number; y: number }[]): string {
  return stueck.map((p, i) => `${i === 0 ? 'M' : 'L'}${r(p.x)} ${r(p.y)}`).join(' ');
}
const r = (n: number) => Math.round(n * 100) / 100;

/** Welche Beschriftungen der x-Achse angezeigt werden (höchstens `max`, gleichmässig verteilt, letzter immer). */
export function xBeschriftungen(n: number, max: number): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  const schritt = Math.ceil(n / max);
  const out: number[] = [];
  for (let i = n - 1; i >= 0; i -= schritt) out.unshift(i);
  return out;
}
