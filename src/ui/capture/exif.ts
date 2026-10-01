// Aufnahmedatum aus den EXIF-Daten eines Fotos (nur JPEG). Eigener, kleiner Parser ohne Abhängigkeiten.
// Liest ausschliesslich DateTimeOriginal (0x9003), DateTimeDigitized (0x9004) und DateTime (0x0132) sowie den Zeiger auf
// den Exif-IFD (0x8769). Keine GPS- oder sonstigen Daten. Wirft nie: bei jedem Problem null.

export interface ExifDatum {
  /** yyyy-mm-dd (lokale Aufnahmezeit, OffsetTimeOriginal wird ignoriert) */
  datum: string;
  /** HH:MM */
  uhrzeit: string;
}

/** Nur so viele Bytes werden gelesen (APP1 steht am Dateianfang). */
export const EXIF_LESE_BYTES = 128 * 1024;

const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_ORIGINAL = 0x9003;
const TAG_DIGITIZED = 0x9004;
const MAX_EINTRAEGE = 512;

const zwei = (n: number) => String(n).padStart(2, '0');

/** «2026:09:24 17:42:05» -> {datum, uhrzeit}; unplausibel (vor 2000, > 1 Tag in der Zukunft, 0000:00:00) -> null. */
export function parseExifZeit(text: string | null | undefined, jetzt: Date = new Date()): ExifDatum | null {
  if (typeof text !== 'string') return null;
  const m = /^\s*(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(text);
  if (!m) return null;
  const [j, mo, t, h, mi] = [m[1], m[2], m[3], m[4], m[5]].map(Number);
  if (j < 2000 || mo < 1 || mo > 12 || t < 1 || h > 23 || mi > 59) return null;
  const tageImMonat = new Date(Date.UTC(j, mo, 0)).getUTCDate();
  if (t > tageImMonat) return null;
  const lokal = new Date(j, mo - 1, t, h, mi);
  if (!Number.isFinite(lokal.getTime()) || lokal.getTime() > jetzt.getTime() + 24 * 3600 * 1000) return null;
  return { datum: `${j}-${zwei(mo)}-${zwei(t)}`, uhrzeit: `${zwei(h)}:${zwei(mi)}` };
}

/** Sucht im JPEG das APP1-Segment «Exif\0\0» und liefert Beginn/Ende des TIFF-Blocks (oder null). */
function findeTiff(b: Uint8Array): { start: number; ende: number } | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let p = 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) return null;
    let marker = b[p + 1];
    // Füllbytes 0xFF überspringen
    while (marker === 0xff && p + 2 < b.length) {
      p++;
      marker = b[p + 1];
    }
    if (marker === 0xd9 || marker === 0xda) return null; // Bildende / Bilddaten: kein EXIF davor gefunden
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      p += 2;
      continue;
    }
    if (p + 4 > b.length) return null;
    const laenge = (b[p + 2] << 8) | b[p + 3];
    if (laenge < 2) return null;
    const inhalt = p + 4;
    const ende = Math.min(p + 2 + laenge, b.length);
    if (
      marker === 0xe1 && ende - inhalt >= 14 &&
      b[inhalt] === 0x45 && b[inhalt + 1] === 0x78 && b[inhalt + 2] === 0x69 && b[inhalt + 3] === 0x66 &&
      b[inhalt + 4] === 0 && b[inhalt + 5] === 0
    ) {
      return { start: inhalt + 6, ende };
    }
    p += 2 + laenge;
  }
  return null;
}

/** Liest das Aufnahmedatum aus JPEG-Bytes (Dateianfang genügt). Wirft nie. */
export function exifDatumAusBytes(daten: ArrayBuffer | Uint8Array, jetzt: Date = new Date()): ExifDatum | null {
  try {
    const b = daten instanceof Uint8Array ? daten : new Uint8Array(daten);
    const tiff = findeTiff(b);
    if (!tiff) return null;
    const dv = new DataView(b.buffer, b.byteOffset + tiff.start, tiff.ende - tiff.start);
    const n = dv.byteLength;
    if (n < 8) return null;
    const bo = dv.getUint16(0);
    const le = bo === 0x4949 ? true : bo === 0x4d4d ? false : null;
    if (le === null || dv.getUint16(2, le) !== 42) return null;

    const u16 = (o: number) => (o >= 0 && o + 2 <= n ? dv.getUint16(o, le) : null);
    const u32 = (o: number) => (o >= 0 && o + 4 <= n ? dv.getUint32(o, le) : null);

    /** ASCII-Wert (Typ 2) eines Eintrags an Offset e */
    const ascii = (e: number): string | null => {
      const typ = u16(e + 2);
      const anzahl = u32(e + 4);
      if (typ !== 2 || anzahl === null || anzahl < 16 || anzahl > 64) return null;
      const off = anzahl <= 4 ? e + 8 : u32(e + 8);
      if (off === null || off + anzahl > n) return null;
      let s = '';
      for (let i = 0; i < anzahl; i++) {
        const c = dv.getUint8(off + i);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s;
    };

    /** Gesuchte Tags eines IFD lesen */
    const leseIfd = (off: number, tags: number[]): Map<number, number> => {
      const r = new Map<number, number>();
      const anzahl = u16(off);
      if (anzahl === null || anzahl > MAX_EINTRAEGE) return r;
      for (let i = 0; i < anzahl; i++) {
        const e = off + 2 + i * 12;
        const tag = u16(e);
        if (tag === null || e + 12 > n) break;
        if (tags.includes(tag) && !r.has(tag)) r.set(tag, e);
      }
      return r;
    };

    const ifd0 = u32(4);
    if (ifd0 === null || ifd0 < 8) return null;
    const t0 = leseIfd(ifd0, [TAG_DATETIME, TAG_EXIF_IFD]);
    let original: string | null = null;
    let digitized: string | null = null;
    const zeiger = t0.get(TAG_EXIF_IFD);
    if (zeiger !== undefined) {
      const exifOff = u32(zeiger + 8);
      if (exifOff !== null && exifOff >= 8 && exifOff !== ifd0) {
        const t1 = leseIfd(exifOff, [TAG_ORIGINAL, TAG_DIGITIZED]);
        const o = t1.get(TAG_ORIGINAL);
        const d = t1.get(TAG_DIGITIZED);
        if (o !== undefined) original = ascii(o);
        if (d !== undefined) digitized = ascii(d);
      }
    }
    const dt = t0.get(TAG_DATETIME);
    const datetime = dt !== undefined ? ascii(dt) : null;
    for (const kandidat of [original, digitized, datetime]) {
      const r = parseExifZeit(kandidat, jetzt);
      if (r) return r;
    }
    return null;
  } catch {
    return null;
  }
}

/** Aufnahmedatum eines Fotos (liest nur die ersten 128 KB). HEIC/PNG/Fehler -> null. Wirft nie. */
export async function leseExifDatum(datei: Blob | null | undefined, jetzt: Date = new Date()): Promise<ExifDatum | null> {
  try {
    if (!datei || typeof datei.slice !== 'function') return null;
    const teil = datei.slice(0, EXIF_LESE_BYTES);
    const buf = typeof teil.arrayBuffer === 'function'
      ? await teil.arrayBuffer()
      : await new Promise<ArrayBuffer>((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result as ArrayBuffer);
          fr.onerror = () => rej(fr.error);
          fr.readAsArrayBuffer(teil);
        });
    return exifDatumAusBytes(buf, jetzt);
  } catch {
    return null;
  }
}
