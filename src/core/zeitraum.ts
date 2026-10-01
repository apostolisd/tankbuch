// Zeiträume (SPEC 5.2). Reine Datums-Arithmetik auf ISO-Strings (UTC, keine Zeitzonen-Effekte).
// Entscheide:
// - 'bis' ist bei allen Presets «heute» (Zeitraum bis zum Stichtag, nicht bis Quartals-/Jahresende).
// - '30tage' = heute-29 .. heute (30 Kalendertage inklusive).
// - '12monate' = Tag nach «heute vor 12 Monaten» .. heute (30.09.2026 -> 01.10.2025..30.09.2026).
// - 'benutzerdefiniert' ohne custom fällt auf 'jahr' zurück; vertauschte von/bis werden getauscht.
// - vorherigerZeitraum: ganze Kalendermonate (Monat, Quartal, Jahr) -> gleich viele Monate davor;
//   sonst gleich langer Zeitraum unmittelbar davor.
import type { Zeitraum } from './types';

export type ZeitraumPreset = '30tage' | 'quartal' | 'jahr' | '12monate' | 'benutzerdefiniert';

function parse(iso: string): { j: number; m: number; t: number } {
  const [j, m, t] = iso.split('-').map(Number);
  return { j, m, t };
}
function fmt(j: number, m: number, t: number): string {
  return `${String(j).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(t).padStart(2, '0')}`;
}
export function tageImMonat(jahr: number, monat: number): number {
  return new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
}
export function isoAddTage(iso: string, n: number): string {
  const { j, m, t } = parse(iso);
  const d = new Date(Date.UTC(j, m - 1, t + n));
  return fmt(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}
/** Monate addieren; Tag wird auf Monatsende geklemmt (31.03. - 1 Monat = 28.02.). */
export function isoAddMonate(iso: string, n: number): string {
  const { j, m, t } = parse(iso);
  const idx = j * 12 + (m - 1) + n;
  const jj = Math.floor(idx / 12);
  const mm = (((idx % 12) + 12) % 12) + 1;
  return fmt(jj, mm, Math.min(t, tageImMonat(jj, mm)));
}
export function tageZwischen(von: string, bis: string): number {
  const a = parse(von);
  const b = parse(bis);
  return Math.round((Date.UTC(b.j, b.m - 1, b.t) - Date.UTC(a.j, a.m - 1, a.t)) / 86400000);
}

export function monatsZeitraum(jahr: number, monat1bis12: number): Zeitraum {
  return { von: fmt(jahr, monat1bis12, 1), bis: fmt(jahr, monat1bis12, tageImMonat(jahr, monat1bis12)) };
}

export function zeitraumVonPreset(p: ZeitraumPreset, heute: string, custom?: Zeitraum): Zeitraum {
  const { j, m } = parse(heute);
  switch (p) {
    case '30tage':
      return { von: isoAddTage(heute, -29), bis: heute };
    case 'quartal':
      return { von: fmt(j, Math.floor((m - 1) / 3) * 3 + 1, 1), bis: heute };
    case 'jahr':
      return { von: fmt(j, 1, 1), bis: heute };
    case '12monate':
      return { von: isoAddTage(isoAddMonate(heute, -12), 1), bis: heute };
    case 'benutzerdefiniert':
      if (!custom) return { von: fmt(j, 1, 1), bis: heute };
      return custom.von <= custom.bis ? { von: custom.von, bis: custom.bis } : { von: custom.bis, bis: custom.von };
  }
}

export function vorherigerZeitraum(z: Zeitraum): Zeitraum {
  const a = parse(z.von);
  const b = parse(z.bis);
  const ganzeMonate = a.t === 1 && b.t === tageImMonat(b.j, b.m);
  if (ganzeMonate) {
    const n = b.j * 12 + b.m - (a.j * 12 + a.m) + 1;
    return { von: isoAddMonate(z.von, -n), bis: isoAddTage(z.von, -1) };
  }
  const n = tageZwischen(z.von, z.bis) + 1;
  const bis = isoAddTage(z.von, -1);
  return { von: isoAddTage(bis, -(n - 1)), bis };
}

export function imZeitraum(datum: string, z: Zeitraum): boolean {
  return datum >= z.von && datum <= z.bis;
}
