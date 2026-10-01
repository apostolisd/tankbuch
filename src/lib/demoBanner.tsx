import { useState } from 'preact/hooks';
import { MODI, demoZuruecksetzen, holeModus, setzeModus, type ErkennungsModus } from './demo';

/** Sichtbarer Hinweis + Steuerung des simulierten Erkennungsergebnisses. Nur mit VITE_DEMO=1 eingebunden. */
export function DemoBanner() {
  const [modus, setModus] = useState<ErkennungsModus>(holeModus());
  return (
    <div class="demo-banner" role="status">
      <span class="demo-banner__marke">Demo</span>
      <span class="demo-banner__text">Keine echten Daten</span>
      <select
        class="demo-banner__wahl"
        aria-label="Simulierte Erkennung"
        value={modus}
        onChange={(e) => { const m = (e.currentTarget as HTMLSelectElement).value as ErkennungsModus; setzeModus(m); setModus(m); }}
      >
        {MODI.map((m) => <option key={m.wert} value={m.wert}>{m.text}</option>)}
      </select>
      <button type="button" class="knopf knopf--sekundaer knopf--klein" aria-label="Demo-Daten zurücksetzen" onClick={() => { demoZuruecksetzen(); location.reload(); }}>Zurücksetzen</button>
    </div>
  );
}
