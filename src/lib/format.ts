// Schweizer Zahlen-/Datumsformate: 1'234.50, 24.09.2026. Reine Funktionen.
// chf() liefert nur die Zahl (ohne «CHF»); die Einheit steht im UI separat.

const APOSTROPH = "'";

/** Rundet kaufmännisch (halb weg von null), robust gegen Gleitkomma-Artefakte (1.005). */
export function runde(n: number, dez: number): number {
  const f = Math.pow(10, dez);
  const s = n < 0 ? -1 : 1;
  const x = Math.abs(n) * f;
  return (s * Math.round(Number((x + 1e-9 * Math.max(1, x)).toPrecision(15)))) / f;
}

/** Zahl mit Tausender-Apostroph und fester Anzahl Dezimalstellen. */
export function zahl(n: number | null | undefined, dez = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '–';
  const r = runde(n, dez);
  const neg = r < 0;
  const [ganz, nach] = Math.abs(r).toFixed(dez).split('.');
  const mitTausender = ganz.replace(/\B(?=(\d{3})+(?!\d))/g, APOSTROPH);
  const text = nach ? `${mitTausender}.${nach}` : mitTausender;
  return neg && Number(text.replace(/'/g, '')) !== 0 ? `−${text}` : text;
}

export const chf = (n: number | null | undefined): string => zahl(n, 2);
export const lPro100 = (n: number | null | undefined): string => zahl(n, 2);
export const rp = (n: number | null | undefined): string => zahl(n, 1);
export const km = (n: number | null | undefined): string => zahl(n, 0);

/** ISO yyyy-mm-dd -> 24.09.2026 (andere Eingaben unverändert). */
export function datum(iso: string | null | undefined): string {
  if (!iso) return '–';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : iso;
}

/** Heutiges Datum lokal als ISO. */
export function heuteIso(): string {
  const d = new Date();
  const p = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Text -> Zahl. Akzeptiert Komma und Punkt, Apostroph/Leerzeichen als Tausender. Sonst null. */
export function parseZahl(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  let t = String(text).trim().replace(/[\s'’`´]/g, '').replace('−', '-');
  if (t === '') return null;
  const hatKomma = t.includes(',');
  const hatPunkt = t.includes('.');
  if (hatKomma && hatPunkt) {
    // letztes Trennzeichen ist das Dezimalzeichen
    if (t.lastIndexOf(',') > t.lastIndexOf('.')) t = t.replace(/\./g, '').replace(',', '.');
    else t = t.replace(/,/g, '');
  } else if (hatKomma) {
    t = t.replace(',', '.');
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}
