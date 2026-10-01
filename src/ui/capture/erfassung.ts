// Zustand des Erfassungsablaufs (Fotos -> Erkennung -> Bestätigen -> Gespeichert). Modul-Store mit Hook.
import { useEffect, useState } from 'preact/hooks';
import type { EintragEntwurf, Fahrzeug, Tankvorgang } from '../../core/types';
import { ergaenzeFehlendenWert, kannSpeichern, pruefeEntwurf, vorschauSegment } from '../../core/pruefungen';
import type { Einstellungen } from '../../core/types';
import { ladeFotoHoch, ladeFotoUrl, loescheFotos, loescheTankvorgang, neueId, ruftErkennung, speichereTankvorgang } from '../../lib/data';
import { navigiere } from '../router';
import { bildFehlerText, verkleinere } from './bild';
import { leseExifDatum, type ExifDatum } from './exif';
import {
  ERKENNUNG_TIMEOUT_MS,
  HINWEIS_VON_HAND,
  aendereFeld,
  berechneBeimTippen,
  bildeHinweise,
  erkennungZuEntwurf,
  fotoPfade,
  freiePlaetze,
  leererEntwurf,
  leitePreisAb,
  letzterKursAus,
  rundeKurs,
  wendeAliasAn,
  tauscheZuordnung,
  uebernimmFotoZeit,
  waehleArt,
  wendeKorrekturAn,
  zuordnungAusErkennung,
  zuordnungOhneErkennung,
  zusatzPruefungen,
  type FeldName,
  type FotoArt,
  type FotoZuordnung,
  type FotoZeitFeld,
  type ZuordnungStatus,
} from './logik';

export type { FotoArt } from './logik';
export type FotoStatus = 'verkleinern' | 'bereit' | 'fehler';

export interface FotoSlot {
  /** lokale ID (Schlüssel für Liste und asynchrone Ergebnisse) */
  id: string;
  status: FotoStatus;
  blob: Blob | null;
  /** Vorschau-URL (Object-URL oder signierte URL) */
  url: string | null;
  /** Pfad im Storage, sobald hochgeladen bzw. beim Bearbeiten vorhanden */
  pfad: string | null;
  fehler: string | null;
  /** Zuordnung (erst nach der Erkennung bzw. beim Bearbeiten gesetzt) */
  art: FotoArt | null;
  zuordnung: ZuordnungStatus | null;
  /** EXIF-Aufnahmezeit des Originals (vor dem Verkleinern gelesen; nur im Arbeitsspeicher, wird nie gespeichert) */
  aufnahme: ExifDatum | null;
}

export type Phase = 'bereit' | 'hochladen' | 'erkennen' | 'fertig';

export interface Kontext {
  fahrzeug: Fahrzeug | null;
  eintraege: Tankvorgang[];
  einst: Einstellungen;
  heute: string;
  /** Tankstellen-Aliase ({von: nach}); werden beim Speichern angewendet (SPEC 8.3) */
  aliase?: unknown;
  neuLaden?: () => void | Promise<void>;
}

export interface Gespeichert {
  eintrag: Tankvorgang | null;
  vorschau: { segment: { km: number; verbrauch: number | null; status: string; grund?: string | null } | null; teilbetankung: boolean } | null;
  geloescht: boolean;
  bearbeitet: boolean;
  /** Hinweis, z.B. wenn nach dem Löschen die Fotos nicht entfernt werden konnten */
  warnung?: string | null;
}

export interface ErfassungState {
  modus: 'neu' | 'bearbeiten';
  eintragId: string | null;
  /** 0 bis 2 Fotos in Aufnahmereihenfolge */
  fotos: FotoSlot[];
  /** Bestätigen zeigt je Foto die Auswahl «Beleg / Kilometerzähler» */
  zuordnungAuswahl: boolean;
  zuordnungHinweis: string | null;
  /** Hinweis beim Hinzufügen (z.B. mehr als 2 Fotos gewählt) */
  fotoMeldung: string | null;
  phase: Phase;
  entwurf: EintragEntwurf | null;
  berechnet: string[];
  hinweise: string[];
  /** Hinweistext zum Ablauf (z.B. Erkennung fehlgeschlagen) */
  meldung: string | null;
  fehler: string | null;
  speichert: boolean;
  gespeichert: Gespeichert | null;
  /** Vom Client erzeugte ID des neuen Eintrags: bleibt bei Wiederholungen gleich (idempotentes Speichern) */
  neueId: string | null;
  /** Felder, die aus dem Aufnahmedatum eines Fotos stammen (Hinweis unter dem Feld) */
  ausFoto: FotoZeitFeld[];
}

let slotZaehler = 0;
const neuerSlot = (teil: Partial<FotoSlot> = {}): FotoSlot => ({
  id: `f${++slotZaehler}`,
  status: 'verkleinern',
  blob: null,
  url: null,
  pfad: null,
  fehler: null,
  art: null,
  zuordnung: null,
  aufnahme: null,
  ...teil,
});

const anfang = (): ErfassungState => ({
  modus: 'neu',
  eintragId: null,
  fotos: [],
  zuordnungAuswahl: false,
  zuordnungHinweis: null,
  fotoMeldung: null,
  phase: 'bereit',
  entwurf: null,
  berechnet: [],
  hinweise: [],
  meldung: null,
  fehler: null,
  speichert: false,
  gespeichert: null,
  neueId: null,
  ausFoto: [],
});

/**
 * Hochgeladene, noch nicht zu einem gespeicherten Eintrag gehörende Fotos. Werden beim Entfernen eines Fotos
 * und Verwerfen/Zurücksetzen aus dem Bucket entfernt (sonst verwaiste, nicht auffindbare Dateien).
 * Bleibt übrig: App wird mitten im Ablauf geschlossen (dann kein Aufräumen möglich, siehe docs/ABWEICHUNGEN.md).
 */
const unverknuepft = new Set<string>();
function verwerfeFotos(pfade: (string | null | undefined)[]) {
  const liste = pfade.filter((p): p is string => !!p && unverknuepft.has(p));
  liste.forEach((p) => unverknuepft.delete(p));
  if (liste.length) void loescheFotos(liste);
}

let state: ErfassungState = anfang();
const hoerer = new Set<() => void>();
let lauf = 0; // verwirft veraltete asynchrone Ergebnisse

function setze(teil: Partial<ErfassungState>) {
  state = { ...state, ...teil };
  hoerer.forEach((h) => h());
}
/** Aktualisiert ein Foto per ID; false, wenn es inzwischen entfernt wurde (veraltetes Ergebnis). */
function setzeSlot(id: string, teil: Partial<FotoSlot>): boolean {
  if (!state.fotos.some((f) => f.id === id)) return false;
  setze({ fotos: state.fotos.map((f) => (f.id === id ? { ...f, ...teil } : f)) });
  return true;
}
function setzeZuordnung(z: FotoZuordnung[], ids: string[]) {
  setze({
    fotos: state.fotos.map((f) => {
      const i = ids.indexOf(f.id);
      return i >= 0 && z[i] ? { ...f, art: z[i].art, zuordnung: z[i].status } : f;
    }),
  });
}
/** Fotos mit Bild (Vorschau oder Pfad), in Aufnahmereihenfolge: Grundlage der Zuordnung. */
const fotosMitBild = () => state.fotos.filter((f) => f.status === 'bereit' && (f.blob || f.pfad));
const zuordnungVon = (liste: FotoSlot[]): FotoZuordnung[] =>
  liste.map((f) => ({ art: f.art as FotoArt, status: f.zuordnung ?? 'standard' }));
function gibUrlFrei(s: FotoSlot) {
  if (s.url && s.url.startsWith('blob:')) URL.revokeObjectURL(s.url);
}

export const holeErfassung = () => state;
export function useErfassung(): ErfassungState {
  const [, rerender] = useState(0);
  useEffect(() => {
    const h = () => rerender((n) => n + 1);
    hoerer.add(h);
    return () => {
      hoerer.delete(h);
    };
  }, []);
  return state;
}

export function zuruecksetzen() {
  verwerfeFotos(state.fotos.map((f) => f.pfad));
  lauf++;
  state.fotos.forEach(gibUrlFrei);
  state = anfang();
  hoerer.forEach((h) => h());
}

/** Fotos gewählt (eines oder mehrere): höchstens 2 Fotos insgesamt, jedes sofort verkleinern (Fortschritt «Verkleinern»). */
export async function fuegeFotosHinzu(dateien: File[]) {
  const liste = dateien.filter(Boolean);
  if (!liste.length) return;
  const { uebernehmen, verworfen } = freiePlaetze(state.fotos.length, liste.length);
  const neu = liste.slice(0, uebernehmen).map(() => neuerSlot());
  setze({
    fotos: [...state.fotos, ...neu],
    fehler: null,
    fotoMeldung: !verworfen
      ? null
      : uebernehmen
        ? `Höchstens 2 Fotos: ${uebernehmen === 1 ? 'nur das erste gewählte Foto wurde' : 'nur die ersten zwei Fotos wurden'} übernommen.`
        : 'Es sind bereits 2 Fotos vorhanden. Zum Ersetzen zuerst eines entfernen.',
  });
  await Promise.all(
    neu.map(async (slot, i) => {
      try {
        // Vor dem Verkleinern: das Canvas entfernt die EXIF-Daten. leseExifDatum wirft nie.
        const aufnahme = await leseExifDatum(liste[i]);
        const blob = await verkleinere(liste[i]);
        const url = URL.createObjectURL(blob);
        if (!setzeSlot(slot.id, { status: 'bereit', blob, url, pfad: null, fehler: null, aufnahme })) URL.revokeObjectURL(url);
      } catch (e) {
        setzeSlot(slot.id, { status: 'fehler', blob: null, url: null, fehler: bildFehlerText(e) });
      }
    }),
  );
}

/** Foto entfernen; ein bereits hochgeladenes, noch nicht gespeichertes Foto wird aus dem Bucket gelöscht. */
export function entferneFoto(id: string) {
  const f = state.fotos.find((x) => x.id === id);
  if (!f) return;
  verwerfeFotos([f.pfad]);
  gibUrlFrei(f);
  setze({ fotos: state.fotos.filter((x) => x.id !== id), fotoMeldung: null });
}

/** Zuordnung tauschen (2 Fotos: vertauschen; 1 Foto: Art umschalten). */
export function tauscheFotos() {
  const mit = fotosMitBild().filter((f) => f.art);
  if (!mit.length) return;
  setzeZuordnung(tauscheZuordnung(zuordnungVon(mit)), mit.map((f) => f.id));
  setze({ zuordnungHinweis: null });
  fotoZeitNeuBestimmen(true);
}

/** Art eines Fotos wählen (bei zwei Fotos bekommt das andere automatisch die andere Art). */
export function waehleFotoArt(id: string, art: FotoArt) {
  const mit = fotosMitBild().filter((f) => f.art);
  const i = mit.findIndex((f) => f.id === id);
  if (i < 0) return;
  setzeZuordnung(waehleArt(zuordnungVon(mit), i, art), mit.map((f) => f.id));
  setze({ zuordnungHinweis: null });
  fotoZeitNeuBestimmen(true);
}

/**
 * Datum/Uhrzeit aus dem Aufnahmedatum der Fotos (EXIF) übernehmen bzw. nach Tauschen neu bestimmen.
 * Nie über einen vom Beleg gelesenen oder vom Nutzer eingegebenen Wert (siehe uebernimmFotoZeit).
 */
function fotoZeitNeuBestimmen(nurBestehende: boolean) {
  if (!state.entwurf) return;
  const r = uebernimmFotoZeit(state.entwurf, state.fotos, state.ausFoto, nurBestehende);
  if (r.entwurf === state.entwurf && r.ausFoto.join() === state.ausFoto.join()) return;
  setze({ entwurf: r.entwurf, ausFoto: r.ausFoto });
}

function hinweiseZuVorschlag(k: Kontext) {
  return {
    fahrzeugId: k.fahrzeug?.id,
    letzterKurs: (w: string) => letzterKursAus(k.eintraege, w),
    ergaenze: ergaenzeFehlendenWert,
  };
}

/** Hochladen + Erkennung. Bei Fehler/Timeout: leeres Formular, Fotos bleiben beim Eintrag. */
export async function starteErkennung(k: Kontext) {
  if (state.fotos.some((f) => f.status === 'verkleinern')) return;
  if (!state.fotos.some((f) => f.status === 'bereit' && f.blob)) {
    setze({ fehler: 'Bitte mindestens ein Foto aufnehmen oder «Ohne Foto erfassen» wählen.' });
    return;
  }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    setze({ fehler: 'Kein Netz. Zum Hochladen und Auslesen der Fotos ist eine Internetverbindung nötig.' });
    return;
  }
  const mein = ++lauf;
  // Fotos, die nicht verarbeitet werden konnten, fallen weg (der Fehlertext stand bereits bei der Kachel).
  state.fotos.filter((f) => f.status === 'fehler').forEach(gibUrlFrei);
  setze({
    fotos: state.fotos.filter((f) => f.status !== 'fehler').map((f) => ({ ...f, art: null, zuordnung: null })),
    phase: 'hochladen', fehler: null, meldung: null, fotoMeldung: null, zuordnungAuswahl: false, zuordnungHinweis: null,
  });
  try {
    for (const s of [...state.fotos]) {
      if (s.status === 'bereit' && s.blob && !s.pfad) {
        const pfad = await ladeFotoHoch(s.blob);
        unverknuepft.add(pfad);
        if (mein !== lauf || !setzeSlot(s.id, { pfad })) { verwerfeFotos([pfad]); return; }
      }
    }
  } catch (e) {
    if (mein !== lauf) return;
    setze({
      phase: 'bereit',
      fehler: `Hochladen fehlgeschlagen: ${e instanceof Error ? e.message : 'unbekannter Fehler'}. Bitte erneut versuchen.`,
    });
    return;
  }

  setze({ phase: 'erkennen' });
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ERKENNUNG_TIMEOUT_MS);
  const hinweise = bildeHinweise(k.eintraege);
  const mit = fotosMitBild();
  const ids = mit.map((f) => f.id);
  const pfade = mit.map((f) => f.pfad as string);
  try {
    const erk = await Promise.race([
      ruftErkennung(
        {
          bilder: pfade,
          // Nur für eine noch nicht aktualisierte Edge Function (die neue ignoriert beides, sobald «bilder» gesetzt ist):
          // feste Zuordnung nach Reihenfolge der Aufnahme.
          beleg_pfad: pfade[0] ?? null,
          tacho_pfad: pfade[1] ?? null,
          ...(Object.keys(hinweise).length ? { hinweise } : {}),
        },
        ctl.signal,
      ),
      new Promise<never>((_, rej) => ctl.signal.addEventListener('abort', () => rej(new Error('Zeitüberschreitung'))),),
    ]);
    if (mein !== lauf) return;
    const z = erkennungZuEntwurf(erk, hinweiseZuVorschlag(k));
    const zu = zuordnungAusErkennung(pfade, erk.zuordnung);
    setzeZuordnung(zu.fotos, ids);
    setze({
      entwurf: z.entwurf, berechnet: z.berechnet, hinweise: z.hinweise, phase: 'fertig', meldung: null,
      zuordnungAuswahl: zu.auswahl, zuordnungHinweis: zu.hinweis, ausFoto: [],
    });
    fotoZeitNeuBestimmen(false);
  } catch (e) {
    if (mein !== lauf) return;
    const z = leererEntwurf(k.fahrzeug?.id);
    const zu = zuordnungOhneErkennung(pfade.length);
    setzeZuordnung(zu.fotos, ids);
    setze({
      zuordnungAuswahl: zu.auswahl,
      zuordnungHinweis: zu.hinweis,
      entwurf: z.entwurf,
      berechnet: [],
      hinweise: [],
      phase: 'fertig',
      meldung: `${HINWEIS_VON_HAND}. ${e instanceof Error && e.message ? `(${e.message})` : ''}`.trim(),
      ausFoto: [],
    });
    fotoZeitNeuBestimmen(false);
  } finally {
    clearTimeout(timer);
  }
  navigiere('/erfassen/bestaetigen');
}

/** Eintrag ohne Foto (SPEC 5.5): leeres Formular, «geschätzt» gesetzt. */
export function startOhneFoto(k: Kontext) {
  zuruecksetzen();
  const z = leererEntwurf(k.fahrzeug?.id, true);
  setze({ entwurf: z.entwurf, phase: 'fertig', meldung: 'Eintrag ohne Foto: bitte die geschätzten Werte eintippen.' });
  navigiere('/erfassen/bestaetigen');
}

/** Bestehenden Eintrag zum Bearbeiten laden (inkl. Fotos). */
export async function ladeEintrag(e: Tankvorgang) {
  if (state.modus === 'bearbeiten' && state.eintragId === e.id && state.entwurf) return;
  zuruecksetzen();
  const mein = lauf;
  const { id: _id, betrag_chf: _chf, ...rest } = e;
  const fotos: FotoSlot[] = [];
  if (e.beleg_foto_pfad) fotos.push(neuerSlot({ status: 'bereit', pfad: e.beleg_foto_pfad, art: 'beleg', zuordnung: 'gespeichert' }));
  if (e.tacho_foto_pfad) fotos.push(neuerSlot({ status: 'bereit', pfad: e.tacho_foto_pfad, art: 'tacho', zuordnung: 'gespeichert' }));
  setze({
    modus: 'bearbeiten',
    eintragId: e.id,
    entwurf: { ...rest, id: e.id, konfidenz: e.konfidenz ?? {} },
    phase: 'fertig',
    fotos,
  });
  for (const f of fotos) {
    try {
      const url = await ladeFotoUrl(f.pfad as string);
      if (mein !== lauf) return;
      setzeSlot(f.id, { url });
    } catch (err) {
      if (mein !== lauf) return;
      setzeSlot(f.id, { fehler: err instanceof Error ? err.message : 'Foto konnte nicht geladen werden.' });
    }
  }
}

/** Nutzer ändert ein Feld -> Konfidenz 'manuell'. */
export function aendere(k: Kontext, feld: FeldName, wert: string | number | null) {
  if (!state.entwurf) return;
  const neu = aendereFeld(state.entwurf, feld, wert, { letzterKurs: (w) => letzterKursAus(k.eintraege, w) });
  // Liter / Preis / Betrag: das dritte Feld wird berechnet (Konfidenz «berechnet»), nie ein vom Nutzer getipptes überschrieben
  // Vom Nutzer geändert: stammt nicht mehr aus dem Foto (wird nie mehr aus dem EXIF überschrieben)
  const ausFoto = neu === state.entwurf ? state.ausFoto : state.ausFoto.filter((f) => f !== feld);
  setze({ entwurf: berechneBeimTippen(neu, feld), ausFoto });
  // Datum geändert: eine Uhrzeit aus dem Foto passt nur zum Aufnahmedatum (sonst wird sie wieder geleert)
  if (feld === 'datum' && ausFoto.includes('uhrzeit')) fotoZeitNeuBestimmen(true);
}

export function setzeSchalter(feld: 'volltankung' | 'geschaetzt', wert: boolean) {
  if (!state.entwurf) return;
  setze({ entwurf: { ...state.entwurf, [feld]: wert } });
}

export function setzeNotiz(text: string) {
  if (!state.entwurf) return;
  setze({ entwurf: { ...state.entwurf, notiz: text.trim() === '' ? null : text } });
}

export function korrigiere(k: NonNullable<Parameters<typeof wendeKorrekturAn>[1]>) {
  if (!state.entwurf) return;
  setze({ entwurf: wendeKorrekturAn(state.entwurf, k), ausFoto: state.ausFoto.filter((f) => f !== k.feld) });
  if (k.feld === 'datum' && state.ausFoto.includes('uhrzeit')) fotoZeitNeuBestimmen(true);
}

/** Speichern; wirft nie, Fehler landen in state.fehler. */
export async function speichern(k: Kontext): Promise<boolean> {
  const roh = state.entwurf;
  if (!roh || state.speichert) return false;
  // Preis pro Liter ist keine Pflicht: fehlt er, wird er aus Betrag ÷ Liter berechnet («berechnet»)
  const e = leitePreisAb(roh);
  if (!k.fahrzeug) {
    setze({ fehler: 'Kein Fahrzeug geladen. Bitte die Seite neu laden.' });
    return false;
  }
  const kontext = { fahrzeug: k.fahrzeug, bestehende: k.eintraege, heute: k.heute, einst: k.einst };
  const pruef = pruefeEntwurf(e, kontext);
  const fremd = !!e.waehrung && e.waehrung.toUpperCase() !== 'CHF';
  if (!kannSpeichern(pruef) || zusatzPruefungen(e).length > 0) {
    setze({ fehler: 'Bitte zuerst die markierten Fehler beheben.' });
    return false;
  }
  setze({ speichert: true, fehler: null });
  try {
    let vorschau: Gespeichert['vorschau'] = null;
    try {
      vorschau = vorschauSegment(e, kontext);
    } catch {
      vorschau = null;
    }
    const payload = {
      ...(state.eintragId ? { id: state.eintragId } : {}),
      fahrzeug_id: k.fahrzeug.id,
      datum: e.datum as string,
      uhrzeit: e.uhrzeit ?? null,
      km_stand: e.km_stand as number,
      liter: e.liter as number,
      betrag: e.betrag as number,
      waehrung: e.waehrung ?? 'CHF',
      wechselkurs: fremd ? rundeKurs(e.wechselkurs as number) : 1,
      preis_pro_liter: e.preis_pro_liter as number,
      tankstelle: wendeAliasAn(e.tankstelle, k.aliase),
      kraftstoff: e.kraftstoff?.trim() ? e.kraftstoff.trim() : null,
      volltankung: e.volltankung ?? true,
      geschaetzt: e.geschaetzt ?? false,
      notiz: e.notiz ?? null,
      konfidenz: e.konfidenz ?? null,
      roh_erkennung: e.roh_erkennung ?? null,
      ...fotoPfade(state.fotos),
    };
    let clientId: string | undefined;
    if (!state.eintragId) {
      clientId = state.neueId ?? neueId();
      if (state.neueId === null) state = { ...state, neueId: clientId };
    }
    const eintrag = await speichereTankvorgang({ ...payload, ...(clientId ? { clientId } : {}) });
    // Fotos gehören jetzt zu einem gespeicherten Eintrag
    state.fotos.forEach((f) => unverknuepft.delete(f.pfad ?? ''));
    try {
      await k.neuLaden?.();
    } catch {
      /* Ansicht lädt beim nächsten Aufruf neu */
    }
    setze({
      speichert: false,
      gespeichert: { eintrag, vorschau, geloescht: false, bearbeitet: state.modus === 'bearbeiten' },
    });
    navigiere('/erfassen/gespeichert');
    return true;
  } catch (err) {
    setze({ speichert: false, fehler: `Speichern fehlgeschlagen: ${err instanceof Error ? err.message : 'unbekannter Fehler'}` });
    return false;
  }
}

export async function loeschen(k: Kontext, fotosLoeschen: boolean): Promise<boolean> {
  if (!state.eintragId) return false;
  setze({ speichert: true, fehler: null });
  try {
    const warnung = await loescheTankvorgang(state.eintragId, fotosLoeschen);
    try {
      await k.neuLaden?.();
    } catch {
      /* ignorieren */
    }
    setze({ speichert: false, gespeichert: { eintrag: null, vorschau: null, geloescht: true, bearbeitet: true, warnung } });
    navigiere('/erfassen/gespeichert');
    return true;
  } catch (err) {
    setze({ speichert: false, fehler: `Löschen fehlgeschlagen: ${err instanceof Error ? err.message : 'unbekannter Fehler'}` });
    return false;
  }
}
