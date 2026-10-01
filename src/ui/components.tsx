import type { ComponentChildren } from 'preact';
import { zeitraumVonPreset, type Zeitraum, type ZeitraumPreset } from '../core';
import { heuteIso } from '../lib/format';
import { useZeitraum } from '../lib/store';

export { useZeitraum };

// ---------- Kachel ----------
export interface KachelProps {
  titel: string;
  wert: ComponentChildren;
  einheit?: string;
  sub?: ComponentChildren;
  /** Warntext (gelb, mit Symbol). */
  warnung?: string;
  /** Herleitung (aufklappbar). */
  children?: ComponentChildren;
  /** Hervorgehobene Haupt-Kennzahl (grosse Zahl, getönte Fläche). */
  hero?: boolean;
}

export function Kachel({ titel, wert, einheit, sub, warnung, children, hero }: KachelProps) {
  return (
    <section class={`kachel${hero ? ' kachel--hero' : ''}${warnung ? ' kachel--warnung' : ''}`} aria-label={titel}>
      <h3 class="kachel__titel">{titel}</h3>
      <p class="kachel__wert">
        <span class="kachel__zahl">{wert}</span>
        {einheit ? <span class="kachel__einheit">{einheit}</span> : null}
      </p>
      {sub ? <p class="kachel__sub">{sub}</p> : null}
      {warnung ? <p class="kachel__warnung"><span aria-hidden="true">⚠ </span>{warnung}</p> : null}
      {children ? (
        <details class="herleitung">
          <summary>Herleitung</summary>
          <div class="herleitung__inhalt">{children}</div>
        </details>
      ) : null}
    </section>
  );
}

// ---------- Bruch / Index ----------
export function Bruch({ zaehler, nenner }: { zaehler: ComponentChildren; nenner: ComponentChildren }) {
  return (
    <span class="bruch" role="math">
      <span class="bruch__z">{zaehler}</span>
      <span class="bruch__n">{nenner}</span>
    </span>
  );
}
export function Sub({ children }: { children: ComponentChildren }) {
  return <sub class="index">{children}</sub>;
}

// ---------- Zeitraum ----------
const PRESETS: { id: ZeitraumPreset; label: string }[] = [
  { id: '30tage', label: 'Letzte 30 Tage' },
  { id: 'quartal', label: 'Quartal' },
  { id: 'jahr', label: 'Jahr' },
  { id: '12monate', label: '12 Monate' },
  { id: 'benutzerdefiniert', label: 'Von–bis' },
];

export interface ZeitraumWahlProps {
  /** Ohne `wert`/`onChange` arbeitet die Wahl direkt auf dem gemeinsamen Zeitraum-Store (useZeitraum). */
  wert?: Zeitraum;
  onChange?: (z: Zeitraum, preset: ZeitraumPreset) => void;
  /** Aktives Preset; ohne Angabe wird es aus `wert` erkannt. */
  preset?: ZeitraumPreset;
  label?: string;
}

function erkenne(wert: Zeitraum): ZeitraumPreset {
  const heute = heuteIso();
  for (const p of PRESETS) {
    if (p.id === 'benutzerdefiniert') continue;
    const z = zeitraumVonPreset(p.id, heute);
    if (z.von === wert.von && z.bis === wert.bis) return p.id;
  }
  return 'benutzerdefiniert';
}

export function ZeitraumWahl(props: ZeitraumWahlProps) {
  const [storeWert, storeSetter, storePreset] = useZeitraum();
  const wert = props.wert ?? storeWert;
  const onChange = props.onChange ?? storeSetter;
  const preset = props.preset ?? (props.wert ? undefined : storePreset);
  const label = props.label ?? 'Zeitraum';
  const aktiv = preset ?? erkenne(wert);
  const waehle = (p: ZeitraumPreset) => {
    if (p === 'benutzerdefiniert') onChange(wert, p);
    else onChange(zeitraumVonPreset(p, heuteIso()), p);
  };
  return (
    <div class="zeitraum" role="group" aria-label={label}>
      <div class="zeitraum__presets">
        {PRESETS.map((p) => (
          <button
            type="button" key={p.id}
            class={`chip${aktiv === p.id ? ' chip--aktiv' : ''}`}
            aria-pressed={aktiv === p.id}
            onClick={() => waehle(p.id)}
          >{p.label}</button>
        ))}
      </div>
      <div class="zeitraum__daten">
        <label class="feld feld--kompakt">
          <span class="feld__label">Von</span>
          <input class="feld__eingabe" type="date" value={wert.von} max={wert.bis}
            onChange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; if (v) onChange({ von: v, bis: wert.bis }, 'benutzerdefiniert'); }} />
        </label>
        <label class="feld feld--kompakt">
          <span class="feld__label">Bis</span>
          <input class="feld__eingabe" type="date" value={wert.bis} min={wert.von}
            onChange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; if (v) onChange({ von: wert.von, bis: v }, 'benutzerdefiniert'); }} />
        </label>
      </div>
    </div>
  );
}

// ---------- Status ----------
export type StatusTyp =
  | 'gueltig' | 'geschaetzt' | 'unplausibel' | 'unvollstaendig' | 'teil'
  | 'sicher' | 'unsicher' | 'fehlt' | 'berechnet' | 'manuell';

const STATUS: Record<StatusTyp, { text: string; symbol: string; klasse: string }> = {
  gueltig: { text: 'gültig', symbol: '✓', klasse: 'ok' },
  geschaetzt: { text: 'geschätzt', symbol: '≈', klasse: 'warn' },
  unplausibel: { text: 'unplausibel', symbol: '⚠', klasse: 'warn' },
  unvollstaendig: { text: 'unvollständig', symbol: '⚠', klasse: 'warn' },
  teil: { text: 'Teilbetankung', symbol: '◐', klasse: 'neutral' },
  sicher: { text: 'sicher', symbol: '✓', klasse: 'ok' },
  unsicher: { text: 'unsicher', symbol: '?', klasse: 'warn' },
  fehlt: { text: 'fehlt', symbol: '✗', klasse: 'fehler' },
  berechnet: { text: 'berechnet', symbol: '=', klasse: 'neutral' },
  manuell: { text: 'manuell', symbol: '✎', klasse: 'neutral' },
};

export function Status({ typ, text }: { typ: StatusTyp; text?: string }) {
  const s = STATUS[typ];
  return (
    <span class={`status status--${s.klasse}`}>
      <span class="status__symbol" aria-hidden="true">{s.symbol}</span>
      {text ?? s.text}
    </span>
  );
}

// ---------- Seite / Hinweis ----------
export function Seite({ titel, aktionen, children }: { titel: string; aktionen?: ComponentChildren; children?: ComponentChildren }) {
  return (
    <article class="seite">
      <header class="seite__kopf">
        <h1 class="seite__titel">{titel}</h1>
        {aktionen ? <div class="seite__aktionen">{aktionen}</div> : null}
      </header>
      {children}
    </article>
  );
}

export type HinweisStufe = 'info' | 'ok' | 'warnung' | 'fehler';
const HINWEIS_SYMBOL: Record<HinweisStufe, string> = { info: 'ℹ', ok: '✓', warnung: '⚠', fehler: '✗' };
const HINWEIS_LABEL: Record<HinweisStufe, string> = { info: 'Hinweis', ok: 'Erledigt', warnung: 'Achtung', fehler: 'Fehler' };

export function Hinweis({ stufe = 'info', children }: { stufe?: HinweisStufe; children?: ComponentChildren }) {
  return (
    <div class={`hinweis hinweis--${stufe}`} role={stufe === 'fehler' ? 'alert' : 'note'}>
      <span class="hinweis__symbol" aria-hidden="true">{HINWEIS_SYMBOL[stufe]}</span>
      <div class="hinweis__text"><span class="nur-leser">{HINWEIS_LABEL[stufe]}: </span>{children}</div>
    </div>
  );
}

// ---------- Knopf ----------
export type KnopfProps = {
  variante?: 'primaer' | 'sekundaer' | 'gefahr' | 'text' | 'dezent';
  gross?: boolean;
  class?: string;
  href?: string;
  children?: ComponentChildren;
  // weitere button-/Link-Attribute (disabled, type, onClick, aria-* ...)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [attr: string]: any;
};

export function Knopf(props: KnopfProps) {
  const { variante = 'primaer', gross, class: extra, children, ...rest } = props;
  const klasse = `knopf knopf--${variante}${gross ? ' knopf--gross' : ''}${extra ? ` ${extra}` : ''}`;
  if (typeof rest.href === 'string') {
    return <a class={klasse} {...rest}>{children}</a>;
  }
  return <button type="button" class={klasse} {...rest}>{children}</button>;
}

// ---------- Feld ----------
export type FeldKonfidenz = 'sicher' | 'unsicher' | 'fehlt' | 'berechnet' | 'manuell';
const KONF_TEXT: Partial<Record<FeldKonfidenz, string>> = {
  unsicher: '? Unsicher gelesen – bitte prüfen',
  fehlt: '✗ Nicht erkannt – bitte eintragen',
  berechnet: '= Aus den anderen Werten berechnet',
};

export type FeldProps = {
  label: string;
  hinweis?: ComponentChildren;
  /** Fehlermeldung (rot, mit Symbol). */
  fehler?: string;
  konfidenz?: FeldKonfidenz;
  id?: string;
  /** Eigenes Eingabeelement (select, textarea, Checkbox ...); sonst wird ein <input> gerendert. */
  children?: ComponentChildren;
  // weitere input-Attribute (type, value, onInput, inputMode, list ...)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [attr: string]: any;
};

let feldZaehler = 0;

export function Feld({ label, hinweis, fehler, konfidenz, id, children, ...eingabe }: FeldProps) {
  const feldId = id ?? `feld-${++feldZaehler}`;
  const konfText = konfidenz ? KONF_TEXT[konfidenz] : undefined;
  const zustand = fehler ? 'fehler' : konfidenz === 'unsicher' ? 'unsicher' : konfidenz === 'fehlt' ? 'fehlt' : konfidenz === 'berechnet' ? 'berechnet' : '';
  const beschr = `${feldId}-b`;
  return (
    <div class={`feld${zustand ? ` feld--${zustand}` : ''}`}>
      <label class="feld__label" for={feldId}>{label}</label>
      {children ?? (
        <input
          id={feldId} class="feld__eingabe"
          aria-invalid={fehler || konfidenz === 'fehlt' ? 'true' : undefined}
          aria-describedby={hinweis || fehler || konfText ? beschr : undefined}
          {...eingabe}
        />
      )}
      {fehler || konfText || hinweis ? (
        <p class="feld__hinweis" id={beschr}>
          {fehler ? <span class="feld__fehler">✗ {fehler}</span> : null}
          {konfText ? <span class="feld__konf">{konfText}</span> : null}
          {hinweis}
        </p>
      ) : null}
    </div>
  );
}
