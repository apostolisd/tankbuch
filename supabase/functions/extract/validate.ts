// Reine Validierung/Normalisierung der Modell-Antwort. Keine Deno-/Node-Importe.
// Typen sind bewusst lokal dupliziert (Edge Function wird isoliert von src/ deployt);
// sie entsprechen src/core/types.ts (Erkennung).

export type Konfidenz = 'sicher' | 'unsicher' | 'fehlt' | 'berechnet' | 'manuell';
export interface ErkanntesFeld<T> { wert: T | null; konfidenz: Konfidenz }
export interface Erkennung {
  datum: ErkanntesFeld<string>;
  uhrzeit: ErkanntesFeld<string>;
  liter: ErkanntesFeld<number>;
  preis_pro_liter: ErkanntesFeld<number>;
  betrag: ErkanntesFeld<number>;
  waehrung: ErkanntesFeld<string>;
  tankstelle: ErkanntesFeld<string>;
  kraftstoff: ErkanntesFeld<string>;
  km_stand: ErkanntesFeld<number>;
  hinweise: string[];
  zuordnung?: BildZuordnung[];
}
export type BildArt = 'beleg' | 'tacho' | 'unbekannt';
export interface BildZuordnung { pfad: string; art: BildArt; konfidenz: Konfidenz }
export interface ValidierungsHinweise {
  letzter_km_stand?: number;
  letzte_tankstellen?: string[];
}

const MAX_KM_SPRUNG = 3000;
const MAX_HINWEISE = 10;
const MAX_TEXT = 200;

const fehlt = <T>(): ErkanntesFeld<T> => ({ wert: null, konfidenz: 'fehlt' });

function istObjekt(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

/** Extrahiert ein JSON-Objekt aus Modelltext (auch mit Code-Zaun oder Umtext). null bei Fehler. */
export function parseModellJson(text: string): unknown | null {
  if (typeof text !== 'string') return null;
  let t = text.trim();
  const zaun = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (zaun) t = zaun[1].trim();
  try {
    const v = JSON.parse(t);
    return istObjekt(v) ? v : null;
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try {
        const v = JSON.parse(t.slice(a, b + 1));
        return istObjekt(v) ? v : null;
      } catch {
        return null;
      }
    }
    return null;
  }
}

function zuZahl(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  let s = v.trim().replace(/[\s'’`]/g, '');
  s = s.replace(/[^0-9,.\-]/g, '');
  if (!s || s === '-' || s === '.' || s === ',') return null;
  const lastKomma = s.lastIndexOf(',');
  const lastPunkt = s.lastIndexOf('.');
  if (lastKomma >= 0 && lastPunkt >= 0) {
    // Das spätere Zeichen ist das Dezimalzeichen, das andere Tausendertrenner.
    if (lastKomma > lastPunkt) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastKomma >= 0) {
    s = s.replace(',', '.');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function runde(n: number, dez: number): number {
  const f = Math.pow(10, dez);
  return Math.round((n + Number.EPSILON) * f) / f;
}

function istEchtesDatum(j: number, m: number, t: number): boolean {
  if (j < 1990 || j > 2100 || m < 1 || m > 12 || t < 1 || t > 31) return false;
  const d = new Date(Date.UTC(j, m - 1, t));
  return d.getUTCFullYear() === j && d.getUTCMonth() === m - 1 && d.getUTCDate() === t;
}

const p2 = (n: number) => String(n).padStart(2, '0');

function zuDatum(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    const [j, mo, t] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return istEchtesDatum(j, mo, t) ? `${j}-${p2(mo)}-${p2(t)}` : null;
  }
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})$/);
  if (m) {
    const t = Number(m[1]);
    const mo = Number(m[2]);
    let j = Number(m[3]);
    if (m[3].length === 2) j += 2000;
    return istEchtesDatum(j, mo, t) ? `${j}-${p2(mo)}-${p2(t)}` : null;
  }
  return null;
}

function zuUhrzeit(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?(?:\s*Uhr)?$/i);
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return `${p2(h)}:${p2(mi)}`;
}

function zuText(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, MAX_TEXT) : null;
}

function zuWaehrung(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toUpperCase();
  if (s === 'FR.' || s === 'SFR' || s === 'SFR.') return 'CHF';
  if (s === '€') return 'EUR';
  return /^[A-Z]{3}$/.test(s) ? s : null;
}

function zuKonfidenz(v: unknown): Konfidenz {
  if (v === 'sicher' || v === 'unsicher' || v === 'fehlt' || v === 'berechnet') return v;
  return 'unsicher';
}

/** Liest {wert, konfidenz} (oder einen blossen Wert) und normalisiert den Wert. */
function feld<T>(roh: unknown, norm: (v: unknown) => T | null): ErkanntesFeld<T> {
  let wertRoh: unknown;
  let konf: Konfidenz = 'unsicher';
  if (istObjekt(roh) && ('wert' in roh || 'konfidenz' in roh)) {
    wertRoh = roh.wert;
    konf = zuKonfidenz(roh.konfidenz);
  } else {
    wertRoh = roh;
  }
  if (wertRoh === null || wertRoh === undefined || wertRoh === '') return fehlt<T>();
  const wert = norm(wertRoh);
  if (wert === null) return fehlt<T>();
  if (konf === 'fehlt') konf = 'unsicher'; // Wert vorhanden, Konfidenz widersprüchlich
  return { wert, konfidenz: konf };
}

const normLiter = (v: unknown) => {
  const n = zuZahl(v);
  return n !== null && n > 0 ? runde(n, 2) : null;
};
const normPreis = (v: unknown) => {
  const n = zuZahl(v);
  return n !== null && n > 0 ? runde(n, 3) : null;
};
const normBetrag = (v: unknown) => {
  const n = zuZahl(v);
  return n !== null && n >= 0 ? runde(n, 2) : null;
};
const normKm = (v: unknown) => {
  const n = zuZahl(v);
  return n !== null && n > 0 ? Math.trunc(n) : null; // Nachkommastellen ignorieren
};

const ART_ALIAS: Record<string, 'beleg' | 'tacho'> = {
  beleg: 'beleg', tankbeleg: 'beleg', quittung: 'beleg', kassenzettel: 'beleg', receipt: 'beleg',
  tacho: 'tacho', kilometerzaehler: 'tacho', 'kilometerzähler': 'tacho', odometer: 'tacho', tachometer: 'tacho',
};

function zuArt(v: unknown): BildArt {
  if (typeof v !== 'string') return 'unbekannt';
  return ART_ALIAS[v.trim().toLowerCase()] ?? 'unbekannt';
}

/**
 * Validiert die Zuordnung Bild -> Art aus der Modell-Antwort (`zuordnung`), bezogen auf die Eingabepfade.
 * - Einträge verweisen per `bild` (1-basierte Nummer) oder per `pfad` (muss exakt einem Eingabepfad entsprechen) auf ein Bild;
 *   andere Einträge werden verworfen, pro Bild zählt der erste gültige Eintrag.
 * - Ergebnis: genau ein Eintrag je Eingabepfad, in Eingabereihenfolge. Fehlender Eintrag -> 'unbekannt'/'fehlt',
 *   unbekannte Art -> 'unbekannt'/'unsicher'.
 * - Zwei Belege oder zwei Kilometerzähler -> beide 'unsicher' plus Hinweis.
 */
export function validiereZuordnung(raw: unknown, pfade: string[]): { zuordnung: BildZuordnung[]; hinweise: string[] } {
  const liste = Array.isArray(raw) ? raw : [];
  const gefunden = new Map<number, { art: BildArt; konfidenz: Konfidenz }>();
  for (const z of liste) {
    if (!istObjekt(z)) continue;
    let i = -1;
    if (typeof z.pfad === 'string') i = pfade.indexOf(z.pfad);
    else {
      const n = typeof z.bild === 'number' ? z.bild : typeof z.bild === 'string' ? Number(z.bild) : NaN;
      if (Number.isInteger(n) && n >= 1 && n <= pfade.length) i = n - 1;
    }
    if (i < 0 || gefunden.has(i)) continue;
    const art = zuArt(z.art);
    let konf = zuKonfidenz(z.konfidenz);
    if (konf === 'berechnet') konf = 'unsicher';
    if (art === 'unbekannt') konf = konf === 'fehlt' ? 'fehlt' : 'unsicher';
    else if (konf === 'fehlt') konf = 'unsicher';
    gefunden.set(i, { art, konfidenz: konf });
  }
  const zuordnung: BildZuordnung[] = pfade.map((pfad, i) => ({
    pfad,
    ...(gefunden.get(i) ?? { art: 'unbekannt' as BildArt, konfidenz: 'fehlt' as Konfidenz }),
  }));
  const hinweise: string[] = [];
  for (const art of ['beleg', 'tacho'] as const) {
    const gleiche = zuordnung.filter((z) => z.art === art);
    if (gleiche.length > 1) {
      gleiche.forEach((z) => { z.konfidenz = 'unsicher'; });
      hinweise.push(
        art === 'beleg'
          ? 'Beide Fotos sehen wie ein Tankbeleg aus. Bitte die Zuordnung prüfen.'
          : 'Beide Fotos sehen wie ein Kilometerzähler aus. Bitte die Zuordnung prüfen.',
      );
    }
  }
  if (zuordnung.some((z) => z.art === 'unbekannt')) {
    hinweise.push('Nicht bei jedem Foto erkannt, ob es Beleg oder Kilometerzähler ist. Bitte die Zuordnung prüfen.');
  }
  return { zuordnung, hinweise };
}

/** Feste Zuordnung für alte Anfragen (beleg_pfad / tacho_pfad). */
export function festeZuordnung(belegPfad: string | null, tachoPfad: string | null): BildZuordnung[] {
  const z: BildZuordnung[] = [];
  if (belegPfad) z.push({ pfad: belegPfad, art: 'beleg', konfidenz: 'sicher' });
  if (tachoPfad) z.push({ pfad: tachoPfad, art: 'tacho', konfidenz: 'sicher' });
  return z;
}

/**
 * Validiert und normalisiert die rohe Modell-Antwort zum Schema «Erkennung»
 * und ergänzt Plausibilitätshinweise. Wirft nie; ungültige Eingabe ergibt lauter «fehlt».
 * Mit `bilder` (Eingabepfade, neue Anfrageform) wird zusätzlich `zuordnung` validiert und zurückgegeben.
 */
export function validiereErkennung(raw: unknown, hinweise?: ValidierungsHinweise, bilder?: string[]): Erkennung {
  const r = istObjekt(raw) ? raw : {};
  const e: Erkennung = {
    datum: feld(r.datum, zuDatum),
    uhrzeit: feld(r.uhrzeit, zuUhrzeit),
    liter: feld(r.liter, normLiter),
    preis_pro_liter: feld(r.preis_pro_liter, normPreis),
    betrag: feld(r.betrag, normBetrag),
    waehrung: feld(r.waehrung, zuWaehrung),
    tankstelle: feld(r.tankstelle, zuText),
    kraftstoff: feld(r.kraftstoff, zuText),
    km_stand: feld(r.km_stand, normKm),
    hinweise: [],
  };

  if (Array.isArray(r.hinweise)) {
    e.hinweise = r.hinweise
      .filter((h): h is string => typeof h === 'string')
      .map((h) => h.trim().slice(0, 300))
      .filter((h) => h.length > 0)
      .slice(0, MAX_HINWEISE);
  } else if (typeof r.hinweise === 'string' && r.hinweise.trim()) {
    e.hinweise = [r.hinweise.trim().slice(0, 300)];
  }

  // Fehlt genau einer von Liter / Preis / Betrag: berechnen.
  const L = e.liter.wert;
  const P = e.preis_pro_liter.wert;
  const B = e.betrag.wert;
  const fehlend = [L, P, B].filter((x) => x === null).length;
  if (fehlend === 1) {
    if (B === null && L !== null && P !== null) {
      e.betrag = { wert: runde(L * P, 2), konfidenz: 'berechnet' };
      e.hinweise.push('Betrag aus Liter × Preis pro Liter berechnet.');
    } else if (P === null && L !== null && B !== null && L > 0) {
      e.preis_pro_liter = { wert: runde(B / L, 3), konfidenz: 'berechnet' };
      e.hinweise.push('Preis pro Liter aus Betrag ÷ Liter berechnet.');
    } else if (L === null && P !== null && B !== null && P > 0) {
      e.liter = { wert: runde(B / P, 2), konfidenz: 'berechnet' };
      e.hinweise.push('Liter aus Betrag ÷ Preis pro Liter berechnet.');
    }
  }

  // km-Stand gegen letzten bekannten Stand prüfen.
  const letzter = hinweise?.letzter_km_stand;
  const km = e.km_stand.wert;
  if (km !== null && typeof letzter === 'number' && Number.isFinite(letzter)) {
    if (km < letzter) {
      e.km_stand.konfidenz = 'unsicher';
      e.hinweise.push(`km-Stand (${km}) ist kleiner als der letzte bekannte Stand (${letzter}).`);
    } else if (km - letzter > MAX_KM_SPRUNG) {
      e.km_stand.konfidenz = 'unsicher';
      e.hinweise.push(
        `km-Stand (${km}) liegt mehr als ${MAX_KM_SPRUNG} km über dem letzten bekannten Stand (${letzter}).`,
      );
    }
  }

  if (bilder) {
    const z = validiereZuordnung(r.zuordnung, bilder);
    e.zuordnung = z.zuordnung;
    for (const h of z.hinweise) if (!e.hinweise.includes(h)) e.hinweise.push(h);
  }

  return e;
}
