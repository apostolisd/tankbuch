import { useEffect, useState } from 'preact/hooks';
import {
  berechneSegmente, zeitraumVonPreset,
  type Einstellungen, type Fahrzeug, type Segment, type Tankvorgang, type Zeitraum, type ZeitraumPreset,
} from '../core';
import { holeEinstellungen, holeFahrzeug, holeTankvorgaenge, speichereEinstellungen } from './data';
import { heuteIso } from './format';
import { konfiguriert } from './supabase';

export interface DatenZustand {
  fahrzeug: Fahrzeug | null;
  eintraege: Tankvorgang[];
  einst: Einstellungen;
  segmente: Segment[];
  laedt: boolean;
  fehler: string | null;
}
export interface Daten extends DatenZustand {
  neuLaden: () => Promise<void>;
  setEinst: (e: Einstellungen) => Promise<void>;
}

const STANDARD: Einstellungen = { geschaetzteMitrechnen: false, unvollstaendigeSegmente: [] };
const LEER: DatenZustand = {
  fahrzeug: null, eintraege: [], einst: STANDARD, segmente: [], laedt: false, fehler: null,
};
let zustand: DatenZustand = LEER;
let geladen = false;
const hoerer = new Set<() => void>();

function setze(teil: Partial<DatenZustand>): void {
  zustand = { ...zustand, ...teil };
  hoerer.forEach((h) => h());
}

function rechne(eintraege: Tankvorgang[], einst: Einstellungen): Segment[] {
  try { return berechneSegmente(eintraege, einst); } catch { return []; }
}

export async function neuLaden(): Promise<void> {
  if (!konfiguriert) return;
  setze({ laedt: true, fehler: null });
  try {
    const [fahrzeug, einst] = await Promise.all([holeFahrzeug(), holeEinstellungen()]);
    const eintraege = await holeTankvorgaenge(fahrzeug.id);
    geladen = true;
    setze({ fahrzeug, einst, eintraege, segmente: rechne(eintraege, einst), laedt: false });
  } catch (e) {
    setze({ laedt: false, fehler: e instanceof Error ? e.message : 'Daten konnten nicht geladen werden.' });
  }
}

export async function setEinst(e: Einstellungen): Promise<void> {
  const alt = zustand.einst;
  setze({ einst: e, segmente: rechne(zustand.eintraege, e), fehler: null });
  try {
    await speichereEinstellungen(e);
  } catch (err) {
    setze({
      einst: alt, segmente: rechne(zustand.eintraege, alt),
      fehler: err instanceof Error ? err.message : 'Einstellungen konnten nicht gespeichert werden.',
    });
  }
}

/** Beim Abmelden aufrufen: verwirft alle geladenen Daten. */
export function leereStore(): void {
  geladen = false;
  zustand = LEER;
  hoerer.forEach((h) => h());
}

export function useDaten(): Daten {
  const [, neu] = useState(0);
  useEffect(() => {
    const h = () => neu((n) => n + 1);
    hoerer.add(h);
    if (!geladen && !zustand.laedt && !zustand.fehler) void neuLaden();
    return () => { hoerer.delete(h); };
  }, []);
  return { ...zustand, neuLaden, setEinst };
}

// ---- Zeitraum (von allen Ansichten geteilt) ----
// Gespeichert wird das PRESET (bzw. der feste Zeitraum bei «benutzerdefiniert»), nicht das berechnete Datum:
// Der Zeitraum eines Presets wird bei jedem Zugriff gegen «heute» neu aufgelöst. So bleibt eine über Tage offene PWA
// nicht auf dem Startdatum stehen (W6). Die Objektidentität bleibt stabil, solange sich Preset und heute nicht ändern.
let zrPreset: ZeitraumPreset = 'jahr';
let zrFest: Zeitraum = zeitraumVonPreset('jahr', heuteIso());
let zrCache: { preset: ZeitraumPreset; heute: string; z: Zeitraum } | null = null;
const zrHoerer = new Set<() => void>();

/** Aktueller Zeitraum; Presets werden gegen das heutige Datum neu berechnet. */
export function aktuellerZeitraum(): Zeitraum {
  if (zrPreset === 'benutzerdefiniert') return zrFest;
  const heute = heuteIso();
  if (!zrCache || zrCache.preset !== zrPreset || zrCache.heute !== heute) {
    zrCache = { preset: zrPreset, heute, z: zeitraumVonPreset(zrPreset, heute) };
  }
  return zrCache.z;
}

export function setzeZeitraum(z: Zeitraum, preset: ZeitraumPreset = 'benutzerdefiniert'): void {
  zrPreset = preset;
  zrFest = z;
  zrCache = null;
  zrHoerer.forEach((h) => h());
}

function millisBisMitternacht(): number {
  const jetzt = new Date();
  const morgen = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + 1, 0, 0, 1);
  return Math.max(1000, morgen.getTime() - jetzt.getTime());
}

/** -> [Zeitraum, setter(zeitraum, preset?), preset] */
export function useZeitraum(): [Zeitraum, (z: Zeitraum, preset?: ZeitraumPreset) => void, ZeitraumPreset] {
  const [, neu] = useState(0);
  useEffect(() => {
    const h = () => neu((n) => n + 1);
    zrHoerer.add(h);
    // Neu auflösen, wenn die App wieder sichtbar wird (PWA aus dem Hintergrund) und nach Mitternacht.
    const sichtbar = () => { if (document.visibilityState === 'visible') h(); };
    document.addEventListener('visibilitychange', sichtbar);
    window.addEventListener('focus', h);
    let timer = setTimeout(function tick() { h(); timer = setTimeout(tick, millisBisMitternacht()); }, millisBisMitternacht());
    return () => {
      zrHoerer.delete(h);
      document.removeEventListener('visibilitychange', sichtbar);
      window.removeEventListener('focus', h);
      clearTimeout(timer);
    };
  }, []);
  return [aktuellerZeitraum(), setzeZeitraum, zrPreset];
}
