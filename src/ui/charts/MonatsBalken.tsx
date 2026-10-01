// Balkendiagramm CHF/100 km über 12 Monate (SVG). Monate ohne Wert: gestrichelter Platzhalter.
import { niceTicks, linear } from './Punkte';

const MONAT_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export interface BalkenLayout {
  max: number;
  ticks: number[];
  balken: { monat: number; wert: number | null; x: number; breite: number; hoehe: number; y: number }[];
}

/** Reine Skalierung, getestet. Nulllinie immer bei 0. */
export function balkenLayout(werte: (number | null)[], breite: number, hoehe: number, rand = { l: 44, r: 8, t: 20, u: 26 }): BalkenLayout {
  const vorhanden = werte.filter((w): w is number => w != null && isFinite(w));
  const maxWert = vorhanden.length ? Math.max(...vorhanden) : 1;
  const nt = niceTicks(0, maxWert <= 0 ? 1 : maxWert, 4);
  const innen = breite - rand.l - rand.r;
  const slot = innen / Math.max(1, werte.length);
  const bb = slot * 0.62;
  const basis = hoehe - rand.u;
  return {
    max: nt.max,
    ticks: nt.ticks,
    balken: werte.map((w, i) => {
      const h = w == null ? 0 : Math.max(0, linear(w, 0, nt.max, 0, basis - rand.t));
      return { monat: i + 1, wert: w, x: rand.l + i * slot + (slot - bb) / 2, breite: bb, hoehe: h, y: basis - h };
    }),
  };
}

interface Props {
  werte: (number | null)[]; // 12 Monate
  aktiverMonat?: number; // 1..12
  jahr?: number;
  beschreibung?: string;
}

export default function MonatsBalken({ werte, aktiverMonat, jahr, beschreibung }: Props) {
  // Schmaler viewBox: auf dem Handy (~320 px) bleibt die Schrift ≥ 9 px lesbar.
  const B = 360, H = 240;
  const rand = { l: 34, r: 6, t: 20, u: 26 };
  const lay = balkenLayout(werte, B, H, rand);
  const basis = H - rand.u;
  const py = (v: number) => linear(v, 0, lay.max, basis, rand.t);
  return (
    <svg viewBox={`0 0 ${B} ${H}`} class="mb-svg" role="img" aria-label={beschreibung ?? `CHF pro 100 km je Monat${jahr ? ` ${jahr}` : ''}`}>
      {lay.ticks.map((v) => (
        <g key={v}>
          <line x1={rand.l} x2={B - rand.r} y1={py(v)} y2={py(v)} stroke="var(--c-raster)" />
          <text x={rand.l - 4} y={py(v) + 4} text-anchor="end" font-size="11" fill="var(--c-tick)">{v}</text>
        </g>
      ))}
      {lay.balken.map((b) => {
        const aktiv = b.monat === aktiverMonat;
        return (
          <g key={b.monat}>
            {b.wert == null ? (
              <rect x={b.x} y={basis - 24} width={b.breite} height={24} fill="none" stroke="var(--c-luecke)" stroke-dasharray="3 3" />
            ) : (
              <rect x={b.x} y={b.y} width={b.breite} height={b.hoehe} fill={aktiv ? 'var(--c-serie-1)' : 'var(--c-balken-blass)'} stroke={aktiv ? 'var(--c-linie)' : 'none'} stroke-width={aktiv ? 2 : 0} />
            )}
            {b.wert != null && (
              <text x={b.x + b.breite / 2} y={b.y - 4} text-anchor="middle" font-size="10" fill="var(--c-linie)" font-weight={aktiv ? 700 : 400}>
                {b.wert.toFixed(1)}
              </text>
            )}
            <text x={b.x + b.breite / 2} y={H - 8} text-anchor="middle" font-size="11" fill="var(--c-linie)" font-weight={aktiv ? 700 : 400}>
              {MONAT_KURZ[b.monat - 1]}
            </text>
            {aktiv && <polygon points={`${b.x + b.breite / 2 - 4},${basis + 11} ${b.x + b.breite / 2 + 4},${basis + 11} ${b.x + b.breite / 2},${basis + 4}`} fill="var(--c-linie)" />}
          </g>
        );
      })}
      <line x1={rand.l} x2={B - rand.r} y1={basis} y2={basis} stroke="var(--c-achse)" />
    </svg>
  );
}
