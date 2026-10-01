// Selbst gezeichnetes Balken-/Liniendiagramm (SVG). Lücken: gestrichelte Platzhalter, Linie wird nicht interpoliert.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import { abbilden, baender, linienStuecke, pfad, xBeschriftungen, ySkala } from './skala';
import './balkenlinie.css';

export interface BalkenDatum {
  id: string;
  /** kurze x-Beschriftung */
  label: string;
  /** vollständige Beschreibung für Detail/Screenreader, z.B. «Segment bis 24.09.2026» */
  titel: string;
  wert: number | null;
  linie?: number | null;
  /** Segment ohne gültigen Wert (Lücke) */
  luecke?: boolean;
  lueckeGrund?: string | null;
  ausreisser?: boolean;
  notiz?: string | null;
  /** zusätzliche Detailzeilen */
  zusatz?: string[];
}

interface Props {
  daten: BalkenDatum[];
  formatWert: (n: number) => string;
  einheit: string;
  balkenName: string;
  linieName?: string;
  titel: string;
  hoehe?: number;
  /** Text bei leeren Daten */
  leerText?: string;
  /** Erklärung der Ausreisser-Markierung (Legende/Detail), z.B. «mehr als 15 % über dem Mittel der Vorgänger» */
  ausreisserName?: string;
}

const RAND = { l: 44, r: 10, o: 26, u: 34 };
// Mindestbreite je Balken: klein genug, dass ein Jahr Segmente (ca. 12-20) bei 390 px ohne horizontales Scrollen passt;
// erst bei sehr vielen Balken scrollt das Diagramm innerhalb seines Containers (nie die Seite).
const MIN_BAND = 14;

export default function BalkenLinie(p: Props): JSX.Element {
  const { daten, formatWert, einheit, balkenName, linieName, titel } = p;
  const hoehe = p.hoehe ?? 280;
  const box = useRef<HTMLDivElement>(null);
  const [breite, setBreite] = useState(640);
  const [aktiv, setAktiv] = useState<number | null>(null);
  const refs = useRef<(SVGGElement | null)[]>([]);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const messen = () => setBreite(Math.max(280, Math.floor(el.clientWidth)));
    messen();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(messen);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  if (daten.length === 0) {
    return <div class="bl-leer" role="status">{p.leerText ?? 'Keine Daten im Zeitraum.'}</div>;
  }

  const n = daten.length;
  const svgBreite = Math.max(breite, RAND.l + RAND.r + n * MIN_BAND);
  const oben = RAND.o, unten = hoehe - RAND.u;
  const skala = ySkala(daten.flatMap((d) => [d.wert, d.linie ?? null]));
  const band = baender(n, RAND.l, svgBreite - RAND.r, 0.6);
  const yf = (v: number) => abbilden(v, skala, oben, unten);
  const stuecke = linienStuecke(daten.map((d, i) => ({ x: band[i].mitte, y: d.linie != null ? yf(d.linie) : null })));
  const beschr = new Set(xBeschriftungen(n, Math.max(2, Math.floor((svgBreite - RAND.l) / 56))));
  const luckenHoehe = (unten - oben) * 0.5;
  const bandBreite = (svgBreite - RAND.l - RAND.r) / n;

  const taste = (e: KeyboardEvent, i: number) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAktiv(i); return; }
    let j = i;
    if (e.key === 'ArrowRight') j = Math.min(n - 1, i + 1);
    else if (e.key === 'ArrowLeft') j = Math.max(0, i - 1);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = n - 1;
    else return;
    e.preventDefault();
    refs.current[j]?.focus();
    setAktiv(j);
  };

  const beschreibung = (d: BalkenDatum) => {
    const t = [d.titel];
    if (d.luecke || d.wert === null) t.push(`kein Wert: ${d.lueckeGrund ?? 'Lücke'}`);
    else t.push(`${formatWert(d.wert)} ${einheit}`);
    if (d.linie != null && linieName) t.push(`${linieName} ${formatWert(d.linie)} ${einheit}`);
    if (d.ausreisser) t.push('Ausreisser');
    if (d.notiz) t.push(`Notiz: ${d.notiz}`);
    return t.join(', ');
  };
  const sel = aktiv !== null ? daten[aktiv] : null;
  // Legende nur mit zutreffenden Einträgen
  const hatLuecke = daten.some((d) => d.luecke || d.wert === null);
  const hatAusreisser = daten.some((d) => d.ausreisser && !(d.luecke || d.wert === null));
  const hatNotiz = daten.some((d) => !!d.notiz);

  return (
    <div class="bl" ref={box}>
      <div class="bl-scroll">
        <svg width={svgBreite} height={hoehe} viewBox={`0 0 ${svgBreite} ${hoehe}`} role="group" aria-label={titel}>
          <defs>
            <pattern id="bl-schraffur" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="var(--c-ausreisser-hell)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--c-ausreisser)" stroke-width="2.5" />
            </pattern>
          </defs>
          {skala.ticks.map((t) => (
            <g key={t}>
              <line class={t === skala.min ? 'bl-achse' : 'bl-raster'} x1={RAND.l} x2={svgBreite - RAND.r} y1={yf(t)} y2={yf(t)} />
              <text class="bl-tick" x={RAND.l - 6} y={yf(t) + 4} text-anchor="end">{formatWert(t)}</text>
            </g>
          ))}
          <text class="bl-tick" x={4} y={12}>{einheit}</text>
          {daten.map((d, i) => {
            const b = band[i];
            const leer = d.luecke || d.wert === null;
            return (
              <g
                key={d.id}
                ref={(el) => { refs.current[i] = el; }}
                class={`bl-flaeche${aktiv === i ? ' aktiv' : ''}`}
                tabIndex={0}
                role="button"
                aria-label={beschreibung(d)}
                aria-pressed={aktiv === i}
                onClick={() => setAktiv(aktiv === i ? null : i)}
                onKeyDown={(e) => taste(e as unknown as KeyboardEvent, i)}
              >
                <rect class="bl-treffer" x={b.mitte - bandBreite / 2} y={oben - 14} width={bandBreite} height={unten - oben + 14} />
                {leer ? (
                  <>
                    <rect class="bl-luecke" x={b.x} y={unten - luckenHoehe} width={b.breite} height={luckenHoehe} rx={2} />
                    <text class="bl-luecke-text" x={b.mitte} y={unten - luckenHoehe / 2 + 4}>?</text>
                  </>
                ) : (
                  <rect class={d.ausreisser ? 'bl-balken-aus' : 'bl-balken'} x={b.x} y={yf(d.wert as number)} width={b.breite} height={Math.max(1, unten - yf(d.wert as number))} rx={2} />
                )}
                {d.ausreisser && !leer && (
                  <text class="bl-luecke-text" x={b.mitte} y={yf(d.wert as number) - 4}>!</text>
                )}
                {d.notiz && <path class="bl-marke" d={`M${b.mitte} ${oben - 12} l6 6 l-6 6 l-6 -6 z`} />}
                {beschr.has(i) && <text class="bl-tick" x={b.mitte} y={unten + 16} text-anchor="middle">{d.label}</text>}
              </g>
            );
          })}
          {linieName && stuecke.map((s, k) => <path key={k} class="bl-linie" d={pfad(s)} />)}
          {linieName && stuecke.flat().map((pt, k) => <circle key={k} class="bl-punkt" cx={pt.x} cy={pt.y} r={3.5} />)}
        </svg>
      </div>
      <ul class="bl-legende" aria-label="Legende">
        <li><svg width="16" height="14" aria-hidden="true"><rect x="1" y="2" width="14" height="11" class="bl-balken" /></svg>{balkenName}</li>
        {linieName && <li><svg width="22" height="14" aria-hidden="true"><path d="M1 7 H21" class="bl-linie" /><circle cx="11" cy="7" r="3.5" class="bl-punkt" /></svg>{linieName}</li>}
        {hatLuecke && <li><svg width="16" height="14" aria-hidden="true"><rect x="1" y="2" width="14" height="11" class="bl-luecke" /></svg>Lücke (kein gültiger Wert, nicht interpoliert)</li>}
        {hatAusreisser && <li><svg width="16" height="14" aria-hidden="true"><rect x="1" y="2" width="14" height="11" class="bl-balken-aus" /></svg>Ausreisser (!){p.ausreisserName ? `: ${p.ausreisserName}` : ''}</li>}
        {hatNotiz && <li><svg width="14" height="14" aria-hidden="true"><path d="M7 1 l6 6 l-6 6 l-6 -6 z" class="bl-marke" /></svg>Notiz</li>}
      </ul>
      <div class="bl-detail" aria-live="polite">
        {sel ? (
          <>
            <strong>{sel.titel}</strong>
            <div>{sel.luecke || sel.wert === null ? `Kein Wert: ${sel.lueckeGrund ?? 'Lücke'}` : `${balkenName}: ${formatWert(sel.wert)} ${einheit}`}</div>
            {sel.linie != null && linieName && <div>{linieName}: {formatWert(sel.linie)} {einheit}</div>}
            {sel.ausreisser && <div>! Ausreisser{p.ausreisserName ? `: ${p.ausreisserName}` : ''}</div>}
            {sel.zusatz?.map((z) => <div key={z}>{z}</div>)}
            {sel.notiz && <div>◆ Notiz: {sel.notiz}</div>}
          </>
        ) : (
          <span>Balken antippen oder mit Pfeiltasten wählen und Enter drücken, um den Wert anzuzeigen.</span>
        )}
      </div>
    </div>
  );
}
