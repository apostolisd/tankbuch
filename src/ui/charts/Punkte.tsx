import { useEffect, useRef, useState } from 'preact/hooks';
// Punktdiagramm (SVG, selbst gezeichnet): Preis pro Liter über die Zeit.
// Farbe UND Form je Gruppe (Farbe ist nie alleiniger Bedeutungsträger).

export interface PunktDaten {
  id: string;
  datum: string; // ISO
  preisChf: number;
  gruppe: string;
  /** geschätzter Beleg (ohne Beleg): hohl gezeichnet, nicht in Ø/Tabelle */
  geschaetzt?: boolean;
  /** Tooltip/Screenreader-Text */
  titel?: string;
}

export type Form = 'kreis' | 'quadrat' | 'dreieck';

export const GRUPPEN_FARBEN = ['var(--c-serie-1)', 'var(--c-serie-2)', 'var(--c-serie-3)'];
export const GRUPPEN_FORMEN: Form[] = ['kreis', 'quadrat', 'dreieck'];

export interface LegendeEintrag {
  gruppe: string;
  farbe: string;
  form: Form;
  anzahl: number;
}

/** Legende: immer alle Gruppen (auch ohne Punkte), feste Reihenfolge der Gruppenliste. */
export function baueLegende(gruppen: string[], punkte: { gruppe: string }[]): LegendeEintrag[] {
  return gruppen.map((g, i) => ({
    gruppe: g,
    farbe: GRUPPEN_FARBEN[i % GRUPPEN_FARBEN.length],
    form: GRUPPEN_FORMEN[i % GRUPPEN_FORMEN.length],
    anzahl: punkte.filter((p) => p.gruppe === g).length,
  }));
}

/** Schöne Achsenwerte (1-2-5-Schritte). */
export function niceTicks(min: number, max: number, n = 5): { ticks: number[]; min: number; max: number } {
  if (!isFinite(min) || !isFinite(max)) return { ticks: [], min: 0, max: 1 };
  if (min === max) {
    min -= 0.05;
    max += 0.05;
  }
  const roh = (max - min) / Math.max(1, n);
  const pot = Math.pow(10, Math.floor(Math.log10(roh)));
  const f = roh / pot;
  const schritt = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * pot;
  const lo = Math.floor(min / schritt + 1e-9) * schritt;
  const hi = Math.ceil(max / schritt - 1e-9) * schritt;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + schritt / 2; v += schritt) ticks.push(Math.round(v * 1e6) / 1e6);
  return { ticks, min: lo, max: hi };
}

export function linear(v: number, d0: number, d1: number, r0: number, r1: number): number {
  if (d1 === d0) return (r0 + r1) / 2;
  return r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);
}

export function tage(iso: string): number {
  const [j, m, t] = iso.split('-').map(Number);
  return Date.UTC(j, (m || 1) - 1, t || 1) / 86400000;
}

export function isoVonTagen(t: number): string {
  return new Date(t * 86400000).toISOString().slice(0, 10);
}

/** Monatsanfänge innerhalb [t0, t1] als Zeitachsen-Ticks (dünnt bei langen Zeiträumen aus). */
export function zeitTicks(t0: number, t1: number, maxAnzahl = 6): number[] {
  const a = isoVonTagen(t0);
  let j = Number(a.slice(0, 4));
  let m = Number(a.slice(5, 7));
  const alle: number[] = [];
  for (let i = 0; i < 400; i++) {
    const t = tage(`${j}-${String(m).padStart(2, '0')}-01`);
    if (t > t1) break;
    if (t >= t0) alle.push(t);
    m++;
    if (m > 12) { m = 1; j++; }
  }
  const schritt = Math.max(1, Math.ceil(alle.length / maxAnzahl));
  return alle.filter((_, i) => i % schritt === 0);
}

const MONAT_KURZ = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
function tickLabel(t: number): string {
  const iso = isoVonTagen(t);
  const m = Number(iso.slice(5, 7));
  return m === 1 ? `${MONAT_KURZ[0]} ${iso.slice(0, 4)}` : MONAT_KURZ[m - 1];
}

function Marke({ form, x, y, r, farbe, hohl }: { form: Form; x: number; y: number; r: number; farbe: string; hohl?: boolean }) {
  // hohl = geschätzter Beleg: weisse Füllung, dicke farbige Kontur (Form + Füllung, nicht nur Farbe)
  const fill = hohl ? 'var(--flaeche)' : farbe;
  const stroke = hohl ? farbe : 'var(--flaeche)';
  const sw = hohl ? 2.2 : 1;
  if (form === 'quadrat') return <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill={fill} stroke={stroke} stroke-width={sw} />;
  if (form === 'dreieck')
    return <polygon points={`${x},${y - r * 1.2} ${x + r * 1.15},${y + r * 0.9} ${x - r * 1.15},${y + r * 0.9}`} fill={fill} stroke={stroke} stroke-width={sw} />;
  return <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} stroke-width={sw} />;
}

export function LegendeZeile({ eintraege, mitGeschaetzt }: { eintraege: LegendeEintrag[]; mitGeschaetzt?: boolean }) {
  return (
    <ul class="pkt-legende" aria-label="Legende">
      {eintraege.map((l) => (
        <li key={l.gruppe}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <Marke form={l.form} x={8} y={8} r={5} farbe={l.farbe} />
          </svg>
          <span>{l.gruppe}</span>
          <span class="pkt-anz"> ({l.anzahl})</span>
        </li>
      ))}
      {mitGeschaetzt ? (
        <li>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <Marke form="kreis" x={8} y={8} r={5} farbe="var(--c-tick)" hohl />
          </svg>
          <span>hohl = geschätzter Beleg (nicht in Ø und Tabelle)</span>
        </li>
      ) : null}
    </ul>
  );
}

interface Props {
  punkte: PunktDaten[];
  gruppen: string[];
  durchschnitt: number | null;
  von: string;
  bis: string;
  beschreibung?: string;
}

export default function Punkte({ punkte, gruppen, durchschnitt, von, bis, beschreibung }: Props) {
  // Breite des Containers messen: so bleibt die Schrift auf dem Handy lesbar (keine Skalierung eines 640-px-Diagramms).
  const box = useRef<HTMLElement>(null);
  const [breite, setBreite] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const messen = () => setBreite(Math.max(280, Math.floor(el.clientWidth)));
    messen();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(messen);
    ro.observe(el);
    return () => ro.disconnect();
  }, [punkte.length === 0]);
  const B = breite, H = breite < 500 ? 260 : 300, L = 44, R = 12, T = 14, U = 34;
  const legende = baueLegende(gruppen, punkte);
  const mitGeschaetzt = punkte.some((p) => p.geschaetzt);
  if (punkte.length === 0) return <LegendeZeile eintraege={legende} />;

  const preise = punkte.map((p) => p.preisChf);
  if (durchschnitt != null) preise.push(durchschnitt);
  const y = niceTicks(Math.min(...preise) - 0.02, Math.max(...preise) + 0.02, 5);
  let t0 = tage(von), t1 = tage(bis);
  const ptage = punkte.map((p) => tage(p.datum));
  t0 = Math.min(t0, ...ptage);
  t1 = Math.max(t1, ...ptage);
  const px = (t: number) => linear(t, t0, t1, L, B - R);
  const py = (v: number) => linear(v, y.min, y.max, H - U, T);
  const xt = zeitTicks(t0, t1, Math.max(3, Math.floor((B - L) / 70)));

  return (
    <figure class="pkt-figur" ref={box}>
      <svg viewBox={`0 0 ${B} ${H}`} role="img" aria-label={beschreibung ?? 'Preis pro Liter über die Zeit'} class="pkt-svg">
        {y.ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={B - R} y1={py(v)} y2={py(v)} stroke="var(--c-raster)" stroke-width="1" />
            <text x={L - 6} y={py(v) + 4} text-anchor="end" font-size="12" fill="var(--c-tick)">{v.toFixed(2)}</text>
          </g>
        ))}
        {xt.map((t) => (
          <g key={t}>
            <line x1={px(t)} x2={px(t)} y1={H - U} y2={H - U + 4} stroke="var(--c-achse)" />
            <text x={px(t)} y={H - U + 17} text-anchor="middle" font-size="12" fill="var(--c-tick)">{tickLabel(t)}</text>
          </g>
        ))}
        <line x1={L} x2={B - R} y1={H - U} y2={H - U} stroke="var(--c-achse)" />
        <text x={12} y={T + 4} font-size="12" fill="var(--c-tick)" transform={`rotate(-90 12 ${(T + H - U) / 2})`} text-anchor="middle" />
        {durchschnitt != null && (
          <g>
            <line x1={L} x2={B - R} y1={py(durchschnitt)} y2={py(durchschnitt)} stroke="var(--c-linie)" stroke-width="1.5" stroke-dasharray="6 4" />
            <text x={B - R} y={py(durchschnitt) - 5} text-anchor="end" font-size="12" font-weight="600" fill="var(--c-linie)">
              Ø {durchschnitt.toFixed(3)} CHF/l
            </text>
          </g>
        )}
        {punkte.map((p) => {
          const i = Math.max(0, gruppen.indexOf(p.gruppe));
          return (
            <g key={p.id}>
              {p.titel ? <title>{p.titel}</title> : null}
              <Marke
                form={GRUPPEN_FORMEN[i % GRUPPEN_FORMEN.length]}
                x={px(tage(p.datum))}
                y={py(p.preisChf)}
                r={5}
                farbe={GRUPPEN_FARBEN[i % GRUPPEN_FARBEN.length]}
                hohl={p.geschaetzt}
              />
            </g>
          );
        })}
      </svg>
      <LegendeZeile eintraege={legende} mitGeschaetzt={mitGeschaetzt} />
      <figcaption class="pkt-achse">Preis pro Liter in CHF</figcaption>
    </figure>
  );
}
