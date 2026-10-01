// CSV-Export des Zeitraums: Semikolon, UTF-8 BOM, Schweizer Format (24.09.2026, Dezimalpunkt).
import type { Segment, Tankvorgang } from '../../core/types';

export const BOM = '﻿';

/** Schützt vor CSV-/Formel-Injection: Zellen, die mit = + - @ (oder Tab/CR) beginnen, werden mit ' entschärft. */
export function schuetzeZelle(text: string): string {
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function csvZelle(text: string): string {
  const t = schuetzeZelle(text);
  return /[;"\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

const datumCH = (iso: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
};
const num = (n: number | null | undefined, dez: number) => (n === null || n === undefined || !isFinite(n) ? '' : n.toFixed(dez));

const STATUS: Record<string, string> = {
  gueltig: 'gültig',
  geschaetzt: 'geschätzt',
  unplausibel: 'unplausibel',
  unvollstaendig: 'unvollständig',
};

export const KOPF = [
  'Datum', 'Uhrzeit', 'km-Stand', 'Liter', 'Preis pro Liter', 'Betrag', 'Währung', 'Wechselkurs', 'Betrag CHF',
  'Tankstelle', 'Kraftstoff', 'Volltankung', 'Geschätzt', 'Segment Enddatum', 'Segment km', 'Segment l/100 km', 'Status', 'Notiz',
];

/** Reine Funktion: Einträge (beliebige Reihenfolge) -> CSV-Text inkl. BOM, neueste zuerst. */
export function csvExport(eintraege: Tankvorgang[], segmente: Segment[]): string {
  const zuSegment = new Map<string, Segment>();
  for (const s of segmente) for (const id of s.eintragIds) zuSegment.set(id, s);
  const sortiert = [...eintraege].sort((a, b) => (a.datum === b.datum ? b.km_stand - a.km_stand : a.datum < b.datum ? 1 : -1));
  const zeilen = [KOPF.map(csvZelle).join(';')];
  for (const e of sortiert) {
    const s = zuSegment.get(e.id);
    const status = s ? STATUS[s.status] ?? s.status : e.volltankung ? 'erste Volltankung' : 'Teilbetankung';
    zeilen.push([
      datumCH(e.datum), e.uhrzeit ?? '', String(e.km_stand), num(e.liter, 2), num(e.preis_pro_liter, 3), num(e.betrag, 2),
      e.waehrung, num(e.wechselkurs, 4), num(e.betrag_chf, 2), e.tankstelle ?? '', e.kraftstoff ?? '',
      e.volltankung ? 'ja' : 'nein', e.geschaetzt ? 'ja' : 'nein',
      s ? datumCH(s.enddatum) : '', s ? String(s.km) : '', s && s.verbrauch !== null ? num(s.verbrauch, 2) : '', status, e.notiz ?? '',
    ].map(csvZelle).join(';'));
  }
  return BOM + zeilen.join('\r\n') + '\r\n';
}

export function dateiname(von: string, bis: string): string {
  return `tankbuch_${von}_${bis}.csv`;
}
