// Demo-Modus (nur mit VITE_DEMO=1): ersetzt die Supabase-Aufrufe aus data.ts durch einen
// localStorage-Store, vorgeladen mit den Testdaten aus SPEC 10. Keine echten Daten, kein Netz.
import type { BildZuordnung, Erkennung, ExtractRequest, Fahrzeug, Konfidenz, Tankvorgang } from '../core';
import { FAHRZEUG, TESTDATEN } from '../../tests/fixture';

const LS_DATEN = 'tankbuch.demo.daten';
const LS_MODUS = 'tankbuch.demo.erkennung';
const LS_EINST = 'tankbuch.einstellungen'; // gleicher Schlüssel wie data.ts

export type ErkennungsModus = 'ok' | 'vertauscht' | 'teilweise' | 'fehler' | 'timeout';
export const MODI: { wert: ErkennungsModus; text: string }[] = [
  { wert: 'ok', text: 'Erkennung: alles sicher' },
  { wert: 'vertauscht', text: 'Erkennung: 1. Foto Tacho, 2. Beleg' },
  { wert: 'teilweise', text: 'Erkennung: einzelne unsicher/fehlend' },
  { wert: 'fehler', text: 'Erkennung: Fehler' },
  { wert: 'timeout', text: 'Erkennung: Timeout (20 s)' },
];

interface Speicher { fahrzeug: Fahrzeug; eintraege: Tankvorgang[]; aliase: Record<string, string> }

let cache: Speicher | null = null;
const fotos = new Map<string, string>(); // Pfad -> Blob-URL (nur für die laufende Sitzung)

function start(): Speicher {
  return { fahrzeug: { ...FAHRZEUG }, eintraege: TESTDATEN.map((e) => ({ ...e })), aliase: {} };
}

function laden(): Speicher {
  if (cache) return cache;
  try {
    const t = localStorage.getItem(LS_DATEN);
    if (t) { cache = JSON.parse(t) as Speicher; return cache; }
  } catch { /* Speicher gesperrt oder defekt */ }
  cache = start();
  return cache;
}

function sichern(): void {
  try { localStorage.setItem(LS_DATEN, JSON.stringify(cache)); } catch { /* ignorieren */ }
}

/** Setzt alle Demodaten und die Einstellungen zurück (danach Seite neu laden). */
export function demoZuruecksetzen(): void {
  cache = null;
  try { localStorage.removeItem(LS_DATEN); localStorage.removeItem(LS_EINST); } catch { /* ignorieren */ }
}

export function holeModus(): ErkennungsModus {
  try {
    const m = localStorage.getItem(LS_MODUS);
    if (MODI.some((x) => x.wert === m)) return m as ErkennungsModus;
  } catch { /* ignorieren */ }
  return 'teilweise';
}
export function setzeModus(m: ErkennungsModus): void {
  try { localStorage.setItem(LS_MODUS, m); } catch { /* ignorieren */ }
}

const uuid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `d${Date.now()}${Math.random().toString(16).slice(2)}`;
const warte = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const runde2 = (n: number) => Math.round(Number((n * 100).toPrecision(12))) / 100;

// ---------- Fahrzeug / Einträge ----------
export async function holeFahrzeug(): Promise<Fahrzeug> { return { ...laden().fahrzeug }; }

export async function speichereFahrzeug(f: Partial<Fahrzeug>): Promise<Fahrzeug> {
  const s = laden();
  s.fahrzeug = { ...s.fahrzeug, ...f, id: s.fahrzeug.id };
  sichern();
  return { ...s.fahrzeug };
}

export async function holeTankvorgaenge(fahrzeugId: string): Promise<Tankvorgang[]> {
  return laden().eintraege
    .filter((e) => e.fahrzeug_id === fahrzeugId)
    .sort((a, b) => a.km_stand - b.km_stand || a.datum.localeCompare(b.datum))
    .map((e) => ({ ...e }));
}

export async function speichereTankvorgang(
  e: Omit<Tankvorgang, 'id' | 'betrag_chf'> & { id?: string },
): Promise<Tankvorgang> {
  const s = laden();
  const fertig = { ...e, id: e.id ?? uuid(), betrag_chf: runde2(e.betrag * e.wechselkurs) } as Tankvorgang;
  const i = s.eintraege.findIndex((x) => x.id === fertig.id);
  if (i >= 0) s.eintraege[i] = fertig; else s.eintraege.push(fertig);
  sichern();
  return { ...fertig };
}

export async function loescheTankvorgang(id: string, _fotosLoeschen: boolean): Promise<void> {
  const s = laden();
  s.eintraege = s.eintraege.filter((e) => e.id !== id);
  sichern();
}

// ---------- Fotos ----------
function platzhalter(pfad: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#e8eef2"/>` +
    `<text x="400" y="290" font-size="34" text-anchor="middle" fill="#345" font-family="sans-serif">DEMO-Foto</text>` +
    `<text x="400" y="340" font-size="20" text-anchor="middle" fill="#567" font-family="sans-serif">${pfad}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export async function ladeFotoUrl(pfad: string): Promise<string> { return fotos.get(pfad) ?? platzhalter(pfad); }

export async function ladeFotoHoch(blob: Blob): Promise<string> {
  await warte(300);
  const pfad = `demo/${uuid()}.jpg`;
  fotos.set(pfad, URL.createObjectURL(blob));
  return pfad;
}

// ---------- Erkennung (simuliert) ----------
function feld<T>(wert: T | null, konfidenz: Konfidenz): { wert: T | null; konfidenz: Konfidenz } {
  return { wert, konfidenz };
}

export async function ruftErkennung(req: ExtractRequest, signal?: AbortSignal): Promise<Erkennung> {
  const modus = holeModus();
  const abbruch = new Promise<never>((_, rej) => {
    if (signal?.aborted) rej(new Error('Erkennung abgebrochen.'));
    signal?.addEventListener('abort', () => rej(new Error('Erkennung abgebrochen.')), { once: true });
  });
  if (modus === 'timeout') {
    await Promise.race([warte(21000), abbruch]);
    throw new Error('Erkennung: Zeitüberschreitung nach 20 Sekunden.');
  }
  await Promise.race([warte(1200), abbruch]);
  if (modus === 'fehler') throw new Error('Erkennung fehlgeschlagen (500): Demo-Fehler.');

  const letzter = req.hinweise?.letzter_km_stand ?? 92470;
  const heute = new Date().toISOString().slice(0, 10);
  const teil = modus === 'teilweise';

  // Zuordnung simulieren: Standard 1. Bild Beleg, 2. Bild Tacho; «vertauscht» umgekehrt;
  // «teilweise»: das letzte Bild ist nicht bestimmbar ('unbekannt').
  const pfade = req.bilder ?? [req.beleg_pfad, req.tacho_pfad].filter((p): p is string => !!p);
  const reihe: ('beleg' | 'tacho')[] = modus === 'vertauscht' ? ['tacho', 'beleg'] : ['beleg', 'tacho'];
  const zuordnung: BildZuordnung[] = pfade.map((pfad, i) =>
    teil && i === pfade.length - 1
      ? { pfad, art: 'unbekannt', konfidenz: 'unsicher' }
      : { pfad, art: reihe[i] ?? 'unbekannt', konfidenz: 'sicher' },
  );
  const hatBeleg = zuordnung.some((z) => z.art === 'beleg') || teil;
  const hatTacho = zuordnung.some((z) => z.art === 'tacho');
  const ohneBeleg = <T,>(w: T, k: Konfidenz) => (hatBeleg ? feld(w, k) : feld<T>(null, 'fehlt'));
  const hinweise: string[] = [];
  if (teil) hinweise.push('Demo: Preis pro Liter unsicher, Kilometerstand nicht lesbar, ein Foto nicht zugeordnet.');
  if (!hatTacho && !teil) hinweise.push('Demo: kein Kilometerzähler-Foto, km-Stand bitte eintippen.');
  return {
    datum: ohneBeleg(heute, 'sicher'),
    uhrzeit: ohneBeleg('08:15', 'sicher'),
    liter: ohneBeleg(41.2, 'sicher'),
    preis_pro_liter: ohneBeleg(1.79, teil ? 'unsicher' : 'sicher'),
    betrag: ohneBeleg(73.75, 'sicher'),
    waehrung: ohneBeleg('CHF', 'sicher'),
    tankstelle: ohneBeleg('Migrol Dietikon', teil ? 'unsicher' : 'sicher'),
    kraftstoff: ohneBeleg('Bleifrei 95', 'sicher'),
    km_stand: teil || !hatTacho ? feld<number>(null, 'fehlt') : feld(letzter + 640, 'sicher'),
    hinweise,
    zuordnung,
  };
}

// ---------- Tankstellen-Aliase ----------
export async function holeAliase(): Promise<Record<string, string>> { return { ...laden().aliase }; }

export async function speichereAlias(von: string, nach: string): Promise<void> {
  laden().aliase[von] = nach;
  sichern();
}

export async function benenneTankstelleUm(von: string, nach: string): Promise<void> {
  const s = laden();
  s.eintraege = s.eintraege.map((e) => (e.tankstelle === von ? { ...e, tankstelle: nach } : e));
  await speichereAlias(von, nach);
}

export async function meldeAb(): Promise<void> { /* Demo: keine Sitzung */ }
