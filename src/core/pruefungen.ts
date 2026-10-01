// Plausibilitätsprüfungen beim Bestätigen (SPEC 5.3).
//
// Entscheide:
// - «zeitlich vorangehend/nachfolgend» (km-Prüfung) = Ordnung nach datum, dann uhrzeit (wenn beide gesetzt),
//   dann km_stand. Bei gleichem Datum ohne Uhrzeit entscheidet der km-Stand (kein Fehler bei Gleichstand der Reihenfolge).
// - Datumsprüfung «nicht vor dem vorangehenden Eintrag»: vorangehend = Eintrag mit dem grössten km_stand kleiner
//   als der des Entwurfs; ein früheres Datum als dieser ist eine Warnung.
// - Preisprüfung (1.00–3.50) gilt für den CHF-Preis: preis_pro_liter × wechselkurs (Fallback betrag/liter).
// - Betragsprüfung nur, wenn liter, preis und betrag vorhanden; Toleranz 0.05 (inklusiv).
// - Tankvolumen: liter > tankvolumen_l ist ein Fehler (✗), wenn Tankvolumen gesetzt.
// - Zusätzlich (über SPEC hinaus, blockierend): liter/betrag <= 0 und km_stand < 0 sind 'wert_ungueltig'.
// - Verbrauchsgrenzen siehe segments.ts (untere Grenze 3.5, Abweichung von SPEC 3.0 dokumentiert).
// - Verbrauchswarnung nur bei Volltankung, wenn das entstehende Segment unplausibel ist (Text «Beleg fehlt?»).
// - ergaenzeFehlendenWert: «fehlt» = undefined/null/NaN/Nicht-Zahl. Nur wenn GENAU EINER fehlt.
import type { EintragEntwurf, Einstellungen, Fahrzeug, Pruefung, Segment, Tankvorgang } from './types';
import { VERBRAUCH_MAX, VERBRAUCH_MIN, berechneSegmente, rundeZahl, segmentZuEintrag } from './segments';

export interface PruefKontext {
  fahrzeug: Fahrzeug | null;
  bestehende: Tankvorgang[];
  heute: string;
  einst: Einstellungen;
}

const ENTWURF_ID = '__entwurf__';

function istZahl(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}
function vgl(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
function kmFmt(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, "'");
}
function datumFmt(iso: string): string {
  const [j, m, t] = iso.split('-');
  return `${t}.${m}.${j}`;
}

export function kannSpeichern(p: Pruefung[]): boolean {
  return !p.some((x) => x.stufe === 'fehler');
}

function andere(entwurf: EintragEntwurf, bestehende: Tankvorgang[]): Tankvorgang[] {
  return bestehende.filter((b) => entwurf.id === undefined || b.id !== entwurf.id);
}

/** -1: b liegt vor dem Entwurf, +1: nach dem Entwurf. */
function ordnung(b: Tankvorgang, datum: string, uhrzeit: string | null | undefined, km: number): number {
  const d = vgl(b.datum, datum);
  if (d !== 0) return d;
  if (b.uhrzeit && uhrzeit && b.uhrzeit !== uhrzeit) return vgl(b.uhrzeit, uhrzeit);
  return b.km_stand < km ? -1 : b.km_stand > km ? 1 : 0;
}

export function pruefeEntwurf(entwurf: EintragEntwurf, kontext: PruefKontext): Pruefung[] {
  const res: Pruefung[] = [];
  const { fahrzeug, heute } = kontext;
  const rest = andere(entwurf, kontext.bestehende);

  // Pflichtfelder
  const pflicht: [keyof EintragEntwurf, string, boolean][] = [
    ['datum', 'Datum', typeof entwurf.datum === 'string' && entwurf.datum !== ''],
    ['km_stand', 'Kilometerstand', istZahl(entwurf.km_stand)],
    ['liter', 'Liter', istZahl(entwurf.liter)],
    ['betrag', 'Betrag', istZahl(entwurf.betrag)],
  ];
  for (const [feld, name, ok] of pflicht) {
    if (!ok) res.push({ code: 'pflichtfeld', stufe: 'fehler', feld, text: `${name} fehlt.` });
  }
  if (istZahl(entwurf.liter) && entwurf.liter <= 0)
    res.push({ code: 'wert_ungueltig', stufe: 'fehler', feld: 'liter', text: 'Liter müssen grösser als 0 sein.' });
  if (istZahl(entwurf.betrag) && entwurf.betrag <= 0)
    res.push({ code: 'wert_ungueltig', stufe: 'fehler', feld: 'betrag', text: 'Betrag muss grösser als 0 sein.' });
  if (istZahl(entwurf.km_stand) && entwurf.km_stand < 0)
    res.push({ code: 'wert_ungueltig', stufe: 'fehler', feld: 'km_stand', text: 'Kilometerstand darf nicht negativ sein.' });

  // Betrag stimmt
  if (istZahl(entwurf.liter) && istZahl(entwurf.preis_pro_liter) && istZahl(entwurf.betrag) && entwurf.preis_pro_liter > 0) {
    const diff = Math.abs(entwurf.liter * entwurf.preis_pro_liter - entwurf.betrag);
    if (rundeZahl(diff, 4) > 0.05) {
      const literNeu = rundeZahl(entwurf.betrag / entwurf.preis_pro_liter, 2);
      res.push({
        code: 'betrag_abweichung',
        stufe: 'warnung',
        feld: 'betrag',
        text: `Liter × Preis (${(entwurf.liter * entwurf.preis_pro_liter).toFixed(2)}) weicht vom Betrag (${entwurf.betrag.toFixed(2)}) um mehr als 0.05 ab.`,
        korrektur: { label: 'Liter aus Betrag ÷ Preis übernehmen', feld: 'liter', wert: literNeu },
      });
    }
  }

  // km-Stand steigend (zeitliche Nachbarn)
  if (istZahl(entwurf.km_stand) && typeof entwurf.datum === 'string' && entwurf.datum !== '') {
    const vor = rest
      .filter((b) => ordnung(b, entwurf.datum!, entwurf.uhrzeit, entwurf.km_stand!) < 0)
      .sort((a, b) => vgl(a.datum, b.datum) || vgl(a.uhrzeit ?? '', b.uhrzeit ?? '') || a.km_stand - b.km_stand)
      .pop();
    const nach = rest
      .filter((b) => ordnung(b, entwurf.datum!, entwurf.uhrzeit, entwurf.km_stand!) >= 0)
      .sort((a, b) => vgl(a.datum, b.datum) || vgl(a.uhrzeit ?? '', b.uhrzeit ?? '') || a.km_stand - b.km_stand)[0];
    if (vor && entwurf.km_stand <= vor.km_stand) {
      res.push({
        code: 'km_nicht_steigend',
        stufe: 'fehler',
        feld: 'km_stand',
        text: `Kilometerstand muss grösser sein als beim vorangehenden Eintrag (${kmFmt(vor.km_stand)} km am ${datumFmt(vor.datum)}).`,
      });
    }
    if (nach && entwurf.km_stand >= nach.km_stand) {
      res.push({
        code: 'km_nicht_steigend',
        stufe: 'fehler',
        feld: 'km_stand',
        text: `Kilometerstand muss kleiner sein als beim nachfolgenden Eintrag (${kmFmt(nach.km_stand)} km am ${datumFmt(nach.datum)}).`,
      });
    }
  }

  // Tankvolumen
  if (fahrzeug?.tankvolumen_l != null && istZahl(entwurf.liter) && entwurf.liter > fahrzeug.tankvolumen_l) {
    res.push({
      code: 'tankvolumen',
      stufe: 'fehler',
      feld: 'liter',
      text: `${entwurf.liter} l übersteigen das Tankvolumen (${fahrzeug.tankvolumen_l} l).`,
    });
  }

  // Preis plausibel (in CHF)
  const kurs = istZahl(entwurf.wechselkurs) && entwurf.wechselkurs > 0 ? entwurf.wechselkurs : 1;
  let preis: number | null = null;
  if (istZahl(entwurf.preis_pro_liter)) preis = entwurf.preis_pro_liter * kurs;
  else if (istZahl(entwurf.betrag) && istZahl(entwurf.liter) && entwurf.liter > 0) preis = (entwurf.betrag / entwurf.liter) * kurs;
  if (preis !== null && (preis < 1.0 || preis > 3.5)) {
    res.push({
      code: 'preis_unplausibel',
      stufe: 'warnung',
      feld: 'preis_pro_liter',
      text: `Preis pro Liter (${preis.toFixed(3)} CHF) liegt ausserhalb von 1.00–3.50.`,
    });
  }

  // Datum
  if (typeof entwurf.datum === 'string' && entwurf.datum !== '') {
    if (entwurf.datum > heute) {
      res.push({ code: 'datum_zukunft', stufe: 'warnung', feld: 'datum', text: 'Das Datum liegt in der Zukunft.' });
    }
    if (istZahl(entwurf.km_stand)) {
      const vorKm = rest
        .filter((b) => b.km_stand < entwurf.km_stand!)
        .sort((a, b) => a.km_stand - b.km_stand)
        .pop();
      if (vorKm && entwurf.datum < vorKm.datum) {
        res.push({
          code: 'datum_vor_vorgaenger',
          stufe: 'warnung',
          feld: 'datum',
          text: `Das Datum liegt vor dem vorangehenden Eintrag (${datumFmt(vorKm.datum)}).`,
        });
      }
    }
  }

  // Verbrauch des entstehenden Segments
  const v = vorschauSegment(entwurf, kontext);
  if (v.segment && v.segment.status === 'unplausibel' && v.segment.km > 0) {
    const verb = (v.segment.liter / v.segment.km) * 100;
    res.push({
      code: 'verbrauch_unplausibel',
      stufe: 'warnung',
      text: `Beleg fehlt? Das entstehende Segment (${v.segment.km} km, ${v.segment.liter} l) ergäbe ${verb.toFixed(1)} l/100 km (erwartet ${VERBRAUCH_MIN.toFixed(1)}–${VERBRAUCH_MAX.toFixed(1)}).`,
    });
  }

  return res;
}

/** Wenn genau einer von liter / preis_pro_liter / betrag fehlt, wird er berechnet (Konfidenz 'berechnet'). */
export function ergaenzeFehlendenWert(e: EintragEntwurf): { entwurf: EintragEntwurf; berechnet: string[] } {
  const hat = {
    liter: istZahl(e.liter),
    preis_pro_liter: istZahl(e.preis_pro_liter),
    betrag: istZahl(e.betrag),
  };
  const fehlend = (Object.keys(hat) as (keyof typeof hat)[]).filter((k) => !hat[k]);
  if (fehlend.length !== 1) return { entwurf: e, berechnet: [] };
  const feld = fehlend[0];
  const { liter, preis_pro_liter: preis, betrag } = e;
  let wert: number | null = null;
  if (feld === 'liter' && preis! > 0) wert = rundeZahl(betrag! / preis!, 2);
  else if (feld === 'preis_pro_liter' && liter! > 0) wert = rundeZahl(betrag! / liter!, 3);
  else if (feld === 'betrag') wert = rundeZahl(liter! * preis!, 2);
  if (wert === null || !Number.isFinite(wert)) return { entwurf: e, berechnet: [] };
  return {
    entwurf: { ...e, [feld]: wert, konfidenz: { ...(e.konfidenz ?? {}), [feld]: 'berechnet' } },
    berechnet: [feld],
  };
}

/** Segment, das durch diesen Eintrag entsteht (nur bei Volltankung), bzw. Hinweis auf Teilbetankung. */
export function vorschauSegment(
  entwurf: EintragEntwurf,
  kontext: PruefKontext,
): { segment: Segment | null; teilbetankung: boolean } {
  if (entwurf.volltankung === false) return { segment: null, teilbetankung: true };
  if (!istZahl(entwurf.km_stand) || !istZahl(entwurf.liter) || !istZahl(entwurf.betrag) || !entwurf.datum) {
    return { segment: null, teilbetankung: false };
  }
  // Kurs wie in der Datenbank (numeric(8,4)) auf 4 Stellen gerundet, damit Vorschau und gespeicherter Betrag übereinstimmen.
  const kurs = istZahl(entwurf.wechselkurs) && entwurf.wechselkurs > 0 ? rundeZahl(entwurf.wechselkurs, 4) : 1;
  const id = entwurf.id ?? ENTWURF_ID;
  const neu: Tankvorgang = {
    id,
    fahrzeug_id: entwurf.fahrzeug_id ?? kontext.fahrzeug?.id ?? kontext.bestehende[0]?.fahrzeug_id ?? '',
    datum: entwurf.datum,
    uhrzeit: entwurf.uhrzeit ?? null,
    km_stand: entwurf.km_stand,
    liter: entwurf.liter,
    betrag: entwurf.betrag,
    waehrung: entwurf.waehrung ?? 'CHF',
    wechselkurs: kurs,
    betrag_chf: rundeZahl(entwurf.betrag * kurs, 2),
    preis_pro_liter: entwurf.preis_pro_liter ?? (entwurf.liter > 0 ? entwurf.betrag / entwurf.liter : 0),
    tankstelle: entwurf.tankstelle ?? null,
    kraftstoff: entwurf.kraftstoff ?? null,
    volltankung: true,
    geschaetzt: entwurf.geschaetzt ?? false,
    notiz: entwurf.notiz ?? null,
    konfidenz: entwurf.konfidenz ?? null,
    roh_erkennung: null,
    beleg_foto_pfad: null,
    tacho_foto_pfad: null,
  };
  const alle = [...andere(entwurf, kontext.bestehende), neu];
  const segmente = berechneSegmente(alle, kontext.einst);
  return { segment: segmentZuEintrag(segmente, id), teilbetankung: false };
}
