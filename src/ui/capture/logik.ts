// Reine Logik des Erfassungsablaufs (ohne DOM, ohne Netz). Nur Typen aus core/types werden importiert.
import type { EintragEntwurf, Erkennung, Konfidenz, Pruefung, Tankvorgang } from '../../core/types';
import type { ExifDatum } from './exif';

export const HINWEIS_VON_HAND = 'Werte bitte eintippen';
export const ERKENNUNG_TIMEOUT_MS = 20000;

export type FeldName =
  | 'datum' | 'uhrzeit' | 'km_stand' | 'liter' | 'preis_pro_liter' | 'betrag'
  | 'waehrung' | 'wechselkurs' | 'tankstelle' | 'kraftstoff';

export interface EntwurfZustand {
  entwurf: EintragEntwurf;
  /** Felder, die aus den anderen berechnet wurden */
  berechnet: string[];
  hinweise: string[];
}

export type ErgaenzeFn = (e: EintragEntwurf) => { entwurf: EintragEntwurf; berechnet: string[] };

export interface MappingOptionen {
  fahrzeugId?: string;
  /** zuletzt verwendeter Kurs der Währung, null wenn unbekannt */
  letzterKurs?: (waehrung: string) => number | null;
  /** ergaenzeFehlendenWert aus core (injiziert) */
  ergaenze?: ErgaenzeFn;
}

const runde2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const rundeN = (n: number, dez: number) => Math.round(Number((n * Math.pow(10, dez)).toPrecision(12))) / Math.pow(10, dez);
const istZahl = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/** Wechselkurs wie in der Datenbank (numeric(8,4)): auf 4 Stellen gerundet. */
export const rundeKurs = (k: number) => rundeN(k, 4);

/** Leeres Formular: nichts erfunden, Pflichtfelder gelten als fehlend. */
export function leererEntwurf(fahrzeugId?: string, geschaetzt = false): EntwurfZustand {
  return {
    entwurf: {
      ...(fahrzeugId ? { fahrzeug_id: fahrzeugId } : {}),
      waehrung: 'CHF',
      wechselkurs: 1,
      volltankung: true,
      geschaetzt,
      konfidenz: {},
      roh_erkennung: null,
    },
    berechnet: [],
    hinweise: [],
  };
}

/** Zuletzt verwendeter Kurs einer Fremdwährung aus den bisherigen Einträgen (neuester Eintrag). */
export function letzterKursAus(eintraege: Tankvorgang[], waehrung: string): number | null {
  const w = waehrung.trim().toUpperCase();
  if (!w || w === 'CHF') return 1;
  const treffer = eintraege
    .filter((e) => (e.waehrung || '').toUpperCase() === w && e.wechselkurs > 0)
    .sort((a, b) => (a.datum === b.datum ? a.km_stand - b.km_stand : a.datum < b.datum ? -1 : 1));
  return treffer.length ? treffer[treffer.length - 1].wechselkurs : null;
}

function mitKonfidenz(e: EintragEntwurf, feld: string, k: Konfidenz | null): EintragEntwurf {
  const konf = { ...(e.konfidenz ?? {}) };
  if (k === null) delete konf[feld];
  else konf[feld] = k;
  return { ...e, konfidenz: konf };
}

/** Wechselkurs passend zur Währung setzen (Vorschlag = zuletzt verwendeter Kurs, nie erfunden). */
function setzeKursFuerWaehrung(
  e: EintragEntwurf,
  waehrung: string,
  letzterKurs?: (w: string) => number | null,
): EintragEntwurf {
  if (!waehrung || waehrung.toUpperCase() === 'CHF') {
    return mitKonfidenz({ ...e, wechselkurs: 1 }, 'wechselkurs', null);
  }
  const kurs = letzterKurs ? letzterKurs(waehrung) : null;
  if (kurs && kurs > 0) return mitKonfidenz({ ...e, wechselkurs: kurs }, 'wechselkurs', 'unsicher');
  const o: EintragEntwurf = { ...e };
  delete o.wechselkurs;
  return mitKonfidenz(o, 'wechselkurs', 'fehlt');
}

/** Erkennung -> Entwurf inkl. Konfidenz je Feld. Fehlende Werte bleiben leer (kein Erfinden). */
export function erkennungZuEntwurf(erk: Erkennung | null, opt: MappingOptionen = {}): EntwurfZustand {
  const basis = leererEntwurf(opt.fahrzeugId);
  if (!erk) return basis;
  let e: EintragEntwurf = { ...basis.entwurf, roh_erkennung: erk };
  const konf: Record<string, Konfidenz> = {};
  const optional: FeldName[] = ['uhrzeit', 'tankstelle', 'kraftstoff'];

  const uebernimm = (feld: FeldName, f: { wert: string | number | null; konfidenz: Konfidenz } | undefined) => {
    const wert = f?.wert;
    const leer = wert === null || wert === undefined || (typeof wert === 'string' && wert.trim() === '');
    if (leer) {
      if (!optional.includes(feld)) konf[feld] = 'fehlt';
      return;
    }
    (e as Record<string, unknown>)[feld] = wert;
    // Wert vorhanden, aber Erkennung meldet «fehlt»: nicht als sicher ausgeben.
    konf[feld] = !f || f.konfidenz === 'fehlt' ? 'unsicher' : f.konfidenz;
  };

  uebernimm('datum', erk.datum);
  uebernimm('uhrzeit', erk.uhrzeit);
  uebernimm('km_stand', erk.km_stand);
  uebernimm('liter', erk.liter);
  uebernimm('preis_pro_liter', erk.preis_pro_liter);
  uebernimm('betrag', erk.betrag);
  uebernimm('tankstelle', erk.tankstelle);
  uebernimm('kraftstoff', erk.kraftstoff);

  const w = erk.waehrung?.wert?.trim().toUpperCase();
  if (w) {
    e.waehrung = w;
    const k = erk.waehrung.konfidenz;
    if (k !== 'sicher') konf.waehrung = k === 'fehlt' ? 'unsicher' : k;
  } else {
    e.waehrung = 'CHF';
    konf.waehrung = 'unsicher';
  }
  e.konfidenz = konf;
  e = setzeKursFuerWaehrung(e, e.waehrung, opt.letzterKurs);

  const hinweise = [...(erk.hinweise ?? [])];
  if (e.waehrung !== 'CHF') {
    hinweise.push(
      e.wechselkurs
        ? `Wechselkurs ${e.wechselkurs} = zuletzt verwendeter Kurs, bitte prüfen.`
        : `Wechselkurs für ${e.waehrung} bitte eintragen.`,
    );
  }

  let berechnet: string[] = [];
  if (opt.ergaenze) {
    const r = opt.ergaenze(e);
    e = r.entwurf;
    berechnet = r.berechnet;
    const k = { ...(e.konfidenz ?? {}) };
    for (const f of berechnet) k[f] = 'berechnet';
    e = { ...e, konfidenz: k };
  }
  return { entwurf: e, berechnet, hinweise };
}

const ZAHLENFELDER: FeldName[] = ['km_stand', 'liter', 'preis_pro_liter', 'betrag', 'wechselkurs'];

/** Nutzer ändert ein Feld: Wert setzen, Konfidenz -> 'manuell' (leer -> 'fehlt'). Unverändert -> gleiches Objekt. */
export function aendereFeld(
  e: EintragEntwurf,
  feld: FeldName,
  wert: string | number | null | undefined,
  opt: { letzterKurs?: (w: string) => number | null } = {},
): EintragEntwurf {
  const alt = (e as Record<string, unknown>)[feld];
  let neu: string | number | undefined;
  if (wert === null || wert === undefined || (typeof wert === 'string' && wert.trim() === '')) neu = undefined;
  else neu = feld === 'waehrung' && typeof wert === 'string' ? wert.trim().toUpperCase() : wert;
  if (ZAHLENFELDER.includes(feld) && typeof neu === 'string') neu = undefined;
  if ((alt ?? undefined) === neu) return e;

  let o: EintragEntwurf = { ...e };
  if (neu === undefined) delete (o as Record<string, unknown>)[feld];
  else (o as Record<string, unknown>)[feld] = neu;

  const freiwillig = feld === 'uhrzeit' || feld === 'tankstelle' || feld === 'kraftstoff';
  if (neu === undefined) o = mitKonfidenz(o, feld, freiwillig ? null : 'fehlt');
  else o = mitKonfidenz(o, feld, 'manuell');

  if (feld === 'waehrung') {
    if (!neu) o.waehrung = 'CHF';
    o = setzeKursFuerWaehrung(o, o.waehrung ?? 'CHF', opt.letzterKurs);
  }
  return o;
}

export function wendeKorrekturAn(e: EintragEntwurf, k: NonNullable<Pruefung['korrektur']>): EintragEntwurf {
  return aendereFeld(e, k.feld as FeldName, k.wert);
}

/** Betrag in CHF (nur Anzeige); null, solange Betrag oder Kurs fehlen. */
export function betragInChf(e: EintragEntwurf): number | null {
  if (typeof e.betrag !== 'number') return null;
  const fremd = !!e.waehrung && e.waehrung.toUpperCase() !== 'CHF';
  const k = fremd ? e.wechselkurs : 1;
  if (typeof k !== 'number' || !(k > 0)) return null;
  // gleicher (auf 4 Stellen gerundeter) Kurs wie in der DB, damit Anzeige = gespeicherter Betrag in CHF
  return runde2(e.betrag * rundeKurs(k));
}

export type FeldStatusTyp = 'neutral' | 'unsicher' | 'fehlt' | 'berechnet' | 'manuell';
export interface FeldStatus { typ: FeldStatusTyp; symbol: string; text: string }

/** Anzeigestatus eines Feldes (Symbol + Text, nie nur Farbe). */
export function feldStatus(e: EintragEntwurf, feld: FeldName): FeldStatus {
  const wert = (e as Record<string, unknown>)[feld];
  const leer = wert === undefined || wert === null || wert === '';
  const k = e.konfidenz?.[feld];
  const fremd = !!e.waehrung && e.waehrung.toUpperCase() !== 'CHF';
  // Pflicht: Datum, km, Liter, Betrag (SPEC 5.3). Der Preis pro Liter ist optional und wird aus Betrag/Liter berechnet.
  const pflicht =
    feld === 'datum' || feld === 'km_stand' || feld === 'liter' || feld === 'betrag' || (feld === 'wechselkurs' && fremd);
  if (leer) {
    if (pflicht || k === 'fehlt') return { typ: 'fehlt', symbol: '✗', text: 'fehlt – bitte eintragen' };
    return { typ: 'neutral', symbol: '', text: '' };
  }
  switch (k) {
    case 'unsicher': return { typ: 'unsicher', symbol: '⚠', text: 'bitte prüfen' };
    case 'berechnet': return { typ: 'berechnet', symbol: '=', text: 'berechnet – bitte prüfen' };
    case 'manuell': return { typ: 'manuell', symbol: '✎', text: 'von dir eingegeben' };
    default: return { typ: 'neutral', symbol: '', text: '' };
  }
}

/** Hinweise für die Erkennung (SPEC 7): letzter km-Stand und zuletzt genutzte Tankstellen. */
export function bildeHinweise(
  eintraege: Tankvorgang[],
  maxTankstellen = 5,
): { letzter_km_stand?: number; letzte_tankstellen?: string[] } {
  const h: { letzter_km_stand?: number; letzte_tankstellen?: string[] } = {};
  if (!eintraege.length) return h;
  h.letzter_km_stand = Math.max(...eintraege.map((e) => e.km_stand));
  const neu = [...eintraege].sort((a, b) =>
    a.datum === b.datum ? b.km_stand - a.km_stand : a.datum < b.datum ? 1 : -1,
  );
  const gesehen: string[] = [];
  for (const e of neu) {
    const t = e.tankstelle?.trim();
    if (t && !gesehen.includes(t)) gesehen.push(t);
    if (gesehen.length >= maxTankstellen) break;
  }
  if (gesehen.length) h.letzte_tankstellen = gesehen;
  return h;
}

/** Vorschlagsliste für Tankstellen: bekannte Namen aus Einträgen und Aliase (beliebige Form), nach Häufigkeit. */
export function tankstellenVorschlaege(eintraege: Tankvorgang[], aliase?: unknown): string[] {
  const zaehler = new Map<string, number>();
  const add = (n: unknown, gewicht = 1) => {
    if (typeof n !== 'string') return;
    const t = n.trim();
    if (t) zaehler.set(t, (zaehler.get(t) ?? 0) + gewicht);
  };
  for (const e of eintraege) add(e.tankstelle);
  if (Array.isArray(aliase)) {
    for (const a of aliase) {
      if (a && typeof a === 'object') {
        add((a as { von?: unknown }).von, 0.1);
        add((a as { nach?: unknown }).nach, 0.1);
      }
    }
  } else if (aliase && typeof aliase === 'object') {
    for (const [k, v] of Object.entries(aliase)) {
      add(k, 0.1);
      add(v, 0.1);
    }
  }
  return [...zaehler.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'de'))
    .map(([n]) => n);
}

export interface SegmentVorschauLike {
  segment: { km: number; verbrauch: number | null; status: string } | null;
  teilbetankung: boolean;
}

export type RueckmeldungArt = 'segment' | 'segment-geschaetzt' | 'unplausibel' | 'teil' | 'erste';
export interface Rueckmeldung { art: RueckmeldungArt; km?: number; verbrauch?: number }

/** Was dem Nutzer nach dem Speichern über das entstandene Segment gesagt wird (SPEC 6.4). */
export function rueckmeldung(v: SegmentVorschauLike | null | undefined): Rueckmeldung {
  if (!v) return { art: 'erste' };
  if (v.teilbetankung) return { art: 'teil' };
  const s = v.segment;
  if (!s) return { art: 'erste' };
  if (s.status === 'unplausibel' || s.status === 'unvollstaendig' || s.verbrauch === null || !Number.isFinite(s.verbrauch)) {
    return { art: 'unplausibel', km: s.km };
  }
  if (s.status === 'geschaetzt') return { art: 'segment-geschaetzt', km: s.km, verbrauch: s.verbrauch };
  return { art: 'segment', km: s.km, verbrauch: s.verbrauch };
}

export interface ZusatzFehler { feld: string; text: string }

/** Ergänzende blockierende Prüfungen, die pruefeEntwurf nicht abdeckt (Kurs bei Fremdwährung, ganzzahliger km-Stand, Währungscode). */
export function zusatzPruefungen(e: EintragEntwurf): ZusatzFehler[] {
  const r: ZusatzFehler[] = [];
  if (typeof e.km_stand === 'number' && !Number.isInteger(e.km_stand)) {
    r.push({ feld: 'km_stand', text: 'Der km-Stand muss eine ganze Zahl sein (ohne Nachkommastellen).' });
  }
  const fremd = !!e.waehrung && e.waehrung.toUpperCase() !== 'CHF';
  if (fremd && !(typeof e.wechselkurs === 'number' && e.wechselkurs > 0)) {
    r.push({ feld: 'wechselkurs', text: `Wechselkurs ${e.waehrung} → CHF fehlt.` });
  }
  if (typeof e.waehrung === 'string' && e.waehrung !== '' && !/^[A-Z]{3}$/.test(e.waehrung.toUpperCase())) {
    r.push({ feld: 'waehrung', text: 'Die Währung braucht einen dreistelligen Code (z.B. CHF, EUR).' });
  }
  // Preis pro Liter ist keine Pflicht: fehlt er, wird er beim Speichern aus Betrag ÷ Liter berechnet (leitePreisAb).
  return r;
}

// ---------- Aufnahmedatum der Fotos (EXIF) ----------

export type FotoZeitFeld = 'datum' | 'uhrzeit';
export const HINWEIS_AUS_FOTO: Record<FotoZeitFeld, string> = {
  datum: 'aus Aufnahmedatum des Fotos',
  uhrzeit: 'aus Aufnahmezeit des Fotos',
};
/** Minimalangaben eines Fotos für die Übernahme: Zuordnung und EXIF-Aufnahmezeit (nur im Arbeitsspeicher). */
export interface FotoAufnahme { art: FotoArt | null; aufnahme: ExifDatum | null }

/** Quelle für Datum/Uhrzeit: bevorzugt das als Beleg zugeordnete Foto, sonst das andere (erstes mit Aufnahmedatum). */
export function fotoZeitQuelle(fotos: FotoAufnahme[]): ExifDatum | null {
  const mit = fotos.filter((f) => !!f.aufnahme);
  return (mit.find((f) => f.art === 'beleg') ?? mit[0])?.aufnahme ?? null;
}

const leerWert = (w: unknown) => w === undefined || w === null || (typeof w === 'string' && w.trim() === '');

/** Stammt das Feld (noch) aus dem Foto? Nur solange es als «aus Foto» geführt, gefüllt und nicht vom Nutzer geändert ist. */
export function istAusFoto(e: EintragEntwurf, feld: FotoZeitFeld, ausFoto: readonly FotoZeitFeld[]): boolean {
  return ausFoto.includes(feld) && !leerWert(e[feld]) && e.konfidenz?.[feld] === 'unsicher';
}

/**
 * Datum/Uhrzeit aus dem Aufnahmedatum der Fotos übernehmen (Konfidenz «unsicher»).
 * - Leere Felder werden gefüllt; bereits aus dem Foto stammende Felder folgen der aktuellen Quelle (z.B. nach Tauschen).
 * - Vom Beleg gelesene oder vom Nutzer eingegebene Werte werden nie überschrieben.
 * - Uhrzeit nur, wenn das Datum leer ist oder mit dem Aufnahmedatum der Quelle übereinstimmt (sonst passt die Zeit nicht).
 * - `nurBestehende`: nur bereits aus dem Foto stammende Felder neu bestimmen (beim Tauschen der Zuordnung).
 */
export function uebernimmFotoZeit(
  e: EintragEntwurf,
  fotos: FotoAufnahme[],
  ausFoto: readonly FotoZeitFeld[],
  nurBestehende = false,
): { entwurf: EintragEntwurf; ausFoto: FotoZeitFeld[] } {
  const q = fotoZeitQuelle(fotos);
  let o = e;
  const neu: FotoZeitFeld[] = [];
  for (const feld of ['datum', 'uhrzeit'] as FotoZeitFeld[]) {
    const vonFoto = istAusFoto(e, feld, ausFoto);
    if (!vonFoto && (nurBestehende || !leerWert(o[feld]))) continue;
    const passt = feld === 'datum' || leerWert(o.datum) || o.datum === q?.datum;
    if (q && passt) {
      const wert = q[feld];
      o = mitKonfidenz({ ...o, [feld]: wert }, feld, 'unsicher');
      neu.push(feld);
    } else if (vonFoto) {
      // Quelle weggefallen: Wert wieder leeren (Datum ist Pflicht -> «fehlt»)
      const x: EintragEntwurf = { ...o };
      delete x[feld];
      o = mitKonfidenz(x, feld, feld === 'datum' ? 'fehlt' : null);
    }
  }
  return { entwurf: o, ausFoto: neu };
}

export interface ZusatzWarnung { feld: string; text: string }

const isoTag = (s: string): number | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000 : null;
};
const chDatum = (iso: string) => iso.split('-').reverse().join('.');

/**
 * Nicht blockierende Warnungen: Belegdatum und Aufnahmedatum eines Fotos weichen um mehr als 2 Tage ab.
 * Kein Vergleich, wenn das Datum selbst aus dem Foto stammt.
 */
export function zusatzWarnungen(
  e: EintragEntwurf,
  fotos: FotoAufnahme[],
  ausFoto: readonly FotoZeitFeld[] = [],
): ZusatzWarnung[] {
  if (!e.datum || istAusFoto(e, 'datum', ausFoto)) return [];
  const beleg = isoTag(e.datum);
  if (beleg === null) return [];
  const r: ZusatzWarnung[] = [];
  const gesehen = new Set<string>();
  for (const f of fotos) {
    const a = f.aufnahme?.datum;
    if (!a || gesehen.has(a)) continue;
    gesehen.add(a);
    const t = isoTag(a);
    if (t !== null && Math.abs(t - beleg) > 2) {
      r.push({ feld: 'datum', text: `Foto wurde am ${chDatum(a)} aufgenommen, Beleg zeigt ${chDatum(e.datum)} – bitte prüfen.` });
    }
  }
  return r;
}

const DREI = ['liter', 'preis_pro_liter', 'betrag'] as const;
type Drei = (typeof DREI)[number];

/**
 * Live-Berechnung beim Tippen (SPEC 5.3: «Fehlt genau einer der drei Werte Liter / Preis / Betrag, wird er berechnet»).
 * Ziel ist das Feld unter den beiden anderen, das fehlt oder bisher nur «berechnet» war; die zwei übrigen Felder müssen
 * vorhanden (> 0) sein. Vom Nutzer eingegebene Felder (Konfidenz «manuell» oder «sicher/unsicher») werden nie überschrieben.
 * Das berechnete Feld erhält die Konfidenz «berechnet». Gibt bei nichts zu tun dasselbe Objekt zurück.
 */
export function berechneBeimTippen(e: EintragEntwurf, geaendert: FeldName): EintragEntwurf {
  if (!(DREI as readonly string[]).includes(geaendert)) return e;
  const hat = (f: Drei) => istZahl(e[f]) && (e[f] as number) > 0;
  const berechnet = (f: Drei) => e.konfidenz?.[f] === 'berechnet';
  for (const ziel of DREI) {
    if (ziel === geaendert) continue;
    if (hat(ziel) && !berechnet(ziel)) continue;
    const andere = DREI.filter((f) => f !== ziel);
    if (!andere.every(hat)) continue;
    const liter = e.liter as number, preis = e.preis_pro_liter as number, betrag = e.betrag as number;
    const wert =
      ziel === 'preis_pro_liter' ? rundeN(betrag / liter, 3)
      : ziel === 'betrag' ? rundeN(liter * preis, 2)
      : rundeN(betrag / preis, 2);
    if (!Number.isFinite(wert) || wert <= 0) continue;
    if (e[ziel] === wert && berechnet(ziel)) return e;
    return { ...e, [ziel]: wert, konfidenz: { ...(e.konfidenz ?? {}), [ziel]: 'berechnet' } };
  }
  return e;
}

/**
 * Preis pro Liter beim Speichern: fehlt er, wird er aus Betrag ÷ Liter (Belegwährung) abgeleitet und als
 * «berechnet» gekennzeichnet (auch bei «Ohne Foto»). Ohne Liter/Betrag unverändert.
 */
export function leitePreisAb(e: EintragEntwurf): EintragEntwurf {
  if (istZahl(e.preis_pro_liter)) return e;
  if (!istZahl(e.liter) || !istZahl(e.betrag) || e.liter <= 0) return e;
  return {
    ...e,
    preis_pro_liter: rundeN(e.betrag / e.liter, 3),
    konfidenz: { ...(e.konfidenz ?? {}), preis_pro_liter: 'berechnet' },
  };
}

// ---------- Fotos: Zuordnung Beleg / Kilometerzähler ----------

export const MAX_FOTOS = 2;
export type FotoArt = 'beleg' | 'tacho';
/**
 * Herkunft der Zuordnung eines Fotos:
 * erkannt (Erkennung sicher) | unsicher (Erkennung unsicher) | standard (nicht erkannt: Reihenfolge der Aufnahme bzw. Ergänzung
 * zum anderen Foto) | manuell (vom Nutzer gewählt/getauscht) | gespeichert (beim Bearbeiten aus dem Eintrag)
 */
export type ZuordnungStatus = 'erkannt' | 'unsicher' | 'standard' | 'manuell' | 'gespeichert';
export interface FotoZuordnung { art: FotoArt; status: ZuordnungStatus }
export interface ZuordnungErgebnis {
  fotos: FotoZuordnung[];
  /** true: Bestätigen zeigt je Foto die Auswahl «Beleg / Kilometerzähler» */
  auswahl: boolean;
  hinweis: string | null;
}

export const ART_TEXT: Record<FotoArt, string> = { beleg: 'Beleg', tacho: 'Kilometerzähler' };
export const HINWEIS_ZUORDNUNG_UNBEKANNT =
  'Nicht erkannt, welches Foto was zeigt. Bitte je Foto «Beleg» oder «Kilometerzähler» wählen (Vorschlag: Reihenfolge der Aufnahme).';
export const HINWEIS_ZUORDNUNG_UNBEKANNT_EINS =
  'Nicht erkannt, ob das Foto der Beleg oder der Kilometerzähler ist. Bitte wählen (Vorschlag: Beleg).';
const hinweisUnbekannt = (n: number) => (n === 1 ? HINWEIS_ZUORDNUNG_UNBEKANNT_EINS : HINWEIS_ZUORDNUNG_UNBEKANNT);
export const HINWEIS_ZUORDNUNG_UNSICHER = 'Zuordnung der Fotos ist unsicher. Bitte prüfen und bei Bedarf ändern.';

const gegenteil = (a: FotoArt): FotoArt => (a === 'beleg' ? 'tacho' : 'beleg');

/** Reihenfolge der Aufnahme: 1. Foto Beleg, 2. Foto Kilometerzähler. */
export function standardZuordnung(anzahl: number, status: ZuordnungStatus = 'standard'): FotoZuordnung[] {
  return Array.from({ length: Math.min(Math.max(anzahl, 0), MAX_FOTOS) }, (_, i) => ({
    art: i === 0 ? 'beleg' : 'tacho',
    status,
  }));
}

/** Fehler/Timeout der Erkennung: Standardreihenfolge, Auswahl anzeigen. */
export function zuordnungOhneErkennung(anzahl: number): ZuordnungErgebnis {
  const fotos = standardZuordnung(anzahl);
  return { fotos, auswahl: fotos.length > 0, hinweis: fotos.length ? hinweisUnbekannt(fotos.length) : null };
}

/**
 * Zuordnung aus der Antwort der Erkennung (`zuordnung`, je Pfad) für die Fotos in Aufnahmereihenfolge.
 * - Art beleg/tacho mit Konfidenz «sicher» -> erkannt, sonst unsicher.
 * - «unbekannt» oder fehlend: ergänzt zum anderen (erkannten) Foto, sonst Reihenfolge der Aufnahme (status «standard»).
 * - Beide Fotos gleiche Art: Reihenfolge der Aufnahme, beide «unsicher».
 */
export function zuordnungAusErkennung(
  pfade: string[],
  zuordnung: { pfad: string; art: string; konfidenz: Konfidenz }[] | null | undefined,
): ZuordnungErgebnis {
  const n = Math.min(pfade.length, MAX_FOTOS);
  if (n === 0) return { fotos: [], auswahl: false, hinweis: null };
  const liste = Array.isArray(zuordnung) ? zuordnung : [];
  const roh: (FotoZuordnung | null)[] = pfade.slice(0, n).map((p) => {
    const z = liste.find((x) => x && x.pfad === p);
    if (!z || (z.art !== 'beleg' && z.art !== 'tacho')) return null;
    return { art: z.art, status: z.konfidenz === 'sicher' ? 'erkannt' : 'unsicher' };
  });

  let fotos: FotoZuordnung[];
  if (n === 2 && roh[0] && roh[1] && roh[0].art === roh[1].art) {
    fotos = standardZuordnung(2, 'unsicher');
  } else if (n === 2 && (roh[0] === null) !== (roh[1] === null)) {
    const bekannt = (roh[0] ?? roh[1]) as FotoZuordnung;
    fotos = roh.map((r) => r ?? { art: gegenteil(bekannt.art), status: 'standard' as ZuordnungStatus });
  } else {
    const std = standardZuordnung(n);
    fotos = roh.map((r, i) => r ?? std[i]);
  }
  const auswahl = fotos.some((f) => f.status !== 'erkannt');
  const hinweis = fotos.some((f) => f.status === 'standard')
    ? hinweisUnbekannt(n)
    : auswahl ? HINWEIS_ZUORDNUNG_UNSICHER : null;
  return { fotos, auswahl, hinweis };
}

/** Zuordnung tauschen: zwei Fotos -> vertauschen; ein Foto -> Art umschalten. Betroffene werden «manuell». */
export function tauscheZuordnung(fotos: FotoZuordnung[]): FotoZuordnung[] {
  if (fotos.length === 1) return [{ art: gegenteil(fotos[0].art), status: 'manuell' }];
  if (fotos.length === 2) return [{ art: fotos[1].art, status: 'manuell' }, { art: fotos[0].art, status: 'manuell' }];
  return fotos;
}

/** Art eines Fotos wählen; bei zwei Fotos bekommt das andere automatisch die andere Art (nie zweimal dieselbe). */
export function waehleArt(fotos: FotoZuordnung[], index: number, art: FotoArt): FotoZuordnung[] {
  if (index < 0 || index >= fotos.length) return fotos;
  if (fotos[index].art === art && fotos[index].status === 'manuell') return fotos;
  return fotos.map((f, i) => {
    if (i === index) return { art, status: 'manuell' as ZuordnungStatus };
    if (f.art === art) return { art: gegenteil(art), status: 'manuell' as ZuordnungStatus };
    return f;
  });
}

/**
 * Fotopfade für den Eintrag aus der Zuordnung. Defensiv: haben zwei Fotos dieselbe Art, bekommt das erste den Platz,
 * das zweite den anderen (kein Foto geht verloren). Fotos ohne Pfad werden übersprungen.
 */
export function fotoPfade(
  fotos: { pfad: string | null; art: FotoArt | null }[],
): { beleg_foto_pfad: string | null; tacho_foto_pfad: string | null } {
  const r: Record<FotoArt, string | null> = { beleg: null, tacho: null };
  for (const f of fotos) {
    if (!f.pfad) continue;
    const wunsch: FotoArt = f.art ?? (r.beleg === null ? 'beleg' : 'tacho');
    if (r[wunsch] === null) r[wunsch] = f.pfad;
    else if (r[gegenteil(wunsch)] === null) r[gegenteil(wunsch)] = f.pfad;
  }
  return { beleg_foto_pfad: r.beleg, tacho_foto_pfad: r.tacho };
}

/** Wie viele der gewählten Dateien übernommen werden (höchstens MAX_FOTOS insgesamt). */
export function freiePlaetze(belegt: number, gewaehlt: number): { uebernehmen: number; verworfen: number } {
  const frei = Math.max(0, MAX_FOTOS - belegt);
  const uebernehmen = Math.min(frei, Math.max(0, gewaehlt));
  return { uebernehmen, verworfen: Math.max(0, gewaehlt - uebernehmen) };
}

/** Anzeige des Zuordnungsstatus (Symbol + Text, nie nur Farbe). */
export function zuordnungStatusText(s: ZuordnungStatus): { symbol: string; text: string; stufe: 'ok' | 'warn' | 'neutral' } {
  switch (s) {
    case 'erkannt': return { symbol: '✓', text: 'erkannt', stufe: 'ok' };
    case 'unsicher': return { symbol: '⚠', text: 'unsicher erkannt', stufe: 'warn' };
    case 'standard': return { symbol: '?', text: 'nicht erkannt', stufe: 'warn' };
    case 'manuell': return { symbol: '✎', text: 'von dir gewählt', stufe: 'neutral' };
    case 'gespeichert': return { symbol: '', text: 'gespeichert', stufe: 'neutral' };
  }
}

/** Alias-Map mit kleingeschriebenen Schlüsseln ({von: nach}, beliebig formatiert) -> normalisierte Map. */
export function aliasMapKlein(aliase: unknown): Record<string, string> {
  const m: Record<string, string> = {};
  const add = (von: unknown, nach: unknown) => {
    if (typeof von === 'string' && typeof nach === 'string') m[von.trim().replace(/\s+/g, ' ').toLowerCase()] = nach;
  };
  if (Array.isArray(aliase)) for (const a of aliase) add((a as { von?: unknown })?.von, (a as { nach?: unknown })?.nach);
  else if (aliase && typeof aliase === 'object') for (const [k, v] of Object.entries(aliase)) add(k, v);
  return m;
}

/** Tankstellenname normalisieren: Leerraum bereinigen, Alias anwenden (Ketten a→b→c werden aufgelöst, Zyklen begrenzt). */
export function wendeAliasAn(name: string | null | undefined, aliase: unknown): string | null {
  const roh = (name ?? '').trim().replace(/\s+/g, ' ');
  if (!roh) return null;
  const map = aliasMapKlein(aliase);
  let aktuell = roh;
  for (let i = 0; i < 8; i++) {
    const n = map[aktuell.toLowerCase()];
    if (!n || n === aktuell) break;
    aktuell = n.trim().replace(/\s+/g, ' ');
  }
  return aktuell;
}
