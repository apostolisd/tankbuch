import { describe, expect, it } from 'vitest';
import { EXIF_LESE_BYTES, exifDatumAusBytes, leseExifDatum, parseExifZeit } from '../src/ui/capture/exif';
import type { EintragEntwurf } from '../src/core/types';
import {
  HINWEIS_AUS_FOTO, aendereFeld, fotoZeitQuelle, istAusFoto, leererEntwurf, uebernimmFotoZeit, zusatzWarnungen,
  type FotoAufnahme,
} from '../src/ui/capture/logik';

const JETZT = new Date(2026, 9, 1, 12, 0); // 01.10.2026 12:00 lokal

// ---------- synthetisches JPEG mit EXIF ----------
interface Tag { tag: number; text: string }

/** TIFF-Block (IFD0 + ExifIFD) mit ASCII-Datumstags, little oder big endian. */
function tiff(le: boolean, ifd0: Tag[], exif: Tag[], extra0: { tag: number; typ: number; anzahl: number; wert: number }[] = []): Uint8Array {
  const buf = new ArrayBuffer(4096);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  dv.setUint16(0, le ? 0x4949 : 0x4d4d);
  dv.setUint16(2, 42, le);
  dv.setUint32(4, 8, le);
  const n0 = ifd0.length + extra0.length + (exif.length ? 1 : 0);
  const ifd0Ende = 8 + 2 + n0 * 12 + 4;
  const exifOff = ifd0Ende;
  const exifEnde = exifOff + 2 + exif.length * 12 + 4;
  let daten = exifEnde;
  const schreibeIfd = (off: number, eintraege: { tag: number; typ: number; anzahl: number; wert?: number; text?: string }[]) => {
    const sortiert = [...eintraege].sort((a, b) => a.tag - b.tag);
    dv.setUint16(off, sortiert.length, le);
    sortiert.forEach((e, i) => {
      const p = off + 2 + i * 12;
      dv.setUint16(p, e.tag, le);
      dv.setUint16(p + 2, e.typ, le);
      dv.setUint32(p + 4, e.anzahl, le);
      if (e.text !== undefined) {
        dv.setUint32(p + 8, daten, le);
        for (let k = 0; k < e.text.length; k++) u8[daten + k] = e.text.charCodeAt(k);
        u8[daten + e.text.length] = 0;
        daten += e.anzahl + (e.anzahl % 2);
      } else {
        dv.setUint32(p + 8, e.wert ?? 0, le);
      }
    });
    dv.setUint32(off + 2 + sortiert.length * 12, 0, le);
  };
  const asc = (t: Tag) => ({ tag: t.tag, typ: 2, anzahl: t.text.length + 1, text: t.text });
  schreibeIfd(8, [
    ...ifd0.map(asc),
    ...extra0,
    ...(exif.length ? [{ tag: 0x8769, typ: 4, anzahl: 1, wert: exifOff }] : []),
  ]);
  if (exif.length) schreibeIfd(exifOff, exif.map(asc));
  return u8.slice(0, daten);
}

/** SOI + (APP0 JFIF) + APP1 Exif + SOS-Anfang + EOI */
function jpeg(tiffBlock: Uint8Array | null, mitApp0 = true): Uint8Array<ArrayBuffer> {
  const teile: number[] = [0xff, 0xd8];
  if (mitApp0) teile.push(0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0);
  if (tiffBlock) {
    const len = 2 + 6 + tiffBlock.length;
    teile.push(0xff, 0xe1, len >> 8, len & 0xff, 0x45, 0x78, 0x69, 0x66, 0, 0, ...tiffBlock);
  }
  teile.push(0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0xff, 0xd9);
  return new Uint8Array(teile);
}

const ORIG = 0x9003, DIGI = 0x9004, DT = 0x0132;

describe('EXIF-Parser', () => {
  it('liest DateTimeOriginal (little endian)', () => {
    const b = jpeg(tiff(true, [{ tag: DT, text: '2026:09:30 10:00:00' }], [{ tag: ORIG, text: '2026:09:24 17:42:31' }]));
    expect(exifDatumAusBytes(b, JETZT)).toEqual({ datum: '2026-09-24', uhrzeit: '17:42' });
  });

  it('liest DateTimeOriginal (big endian, ohne APP0)', () => {
    const b = jpeg(tiff(false, [], [{ tag: DIGI, text: '2026:09:23 08:00:00' }, { tag: ORIG, text: '2026:09:22 07:05:00' }]), false);
    expect(exifDatumAusBytes(b, JETZT)).toEqual({ datum: '2026-09-22', uhrzeit: '07:05' });
  });

  it('Rückfall: DateTimeDigitized, dann DateTime', () => {
    expect(exifDatumAusBytes(jpeg(tiff(true, [{ tag: DT, text: '2026:09:01 09:09:09' }], [{ tag: DIGI, text: '2026:09:02 10:10:10' }])), JETZT))
      .toEqual({ datum: '2026-09-02', uhrzeit: '10:10' });
    expect(exifDatumAusBytes(jpeg(tiff(false, [{ tag: DT, text: '2026:09:01 09:09:09' }], [])), JETZT))
      .toEqual({ datum: '2026-09-01', uhrzeit: '09:09' });
  });

  it('unplausible Werte -> null (bzw. nächster Kandidat)', () => {
    const nur = (t: string) => exifDatumAusBytes(jpeg(tiff(true, [], [{ tag: ORIG, text: t }])), JETZT);
    expect(nur('0000:00:00 00:00:00')).toBeNull();
    expect(nur('1999:12:31 23:59:59')).toBeNull();
    expect(nur('2026:10:03 12:00:00')).toBeNull(); // mehr als 1 Tag in der Zukunft
    expect(nur('2026:10:02 11:00:00')).toEqual({ datum: '2026-10-02', uhrzeit: '11:00' }); // < 1 Tag: Zeitzonen-Toleranz
    expect(nur('2026:02:30 10:00:00')).toBeNull();
    expect(nur('2026:13:01 10:00:00')).toBeNull();
    expect(nur('    :  :     :  :  ')).toBeNull();
    // Original unplausibel, DateTime gültig -> DateTime
    expect(exifDatumAusBytes(jpeg(tiff(true, [{ tag: DT, text: '2026:09:05 06:07:08' }], [{ tag: ORIG, text: '0000:00:00 00:00:00' }])), JETZT))
      .toEqual({ datum: '2026-09-05', uhrzeit: '06:07' });
  });

  it('kaputte oder fremde Daten -> null, wirft nie', () => {
    const gut = jpeg(tiff(true, [], [{ tag: ORIG, text: '2026:09:24 17:42:31' }]));
    expect(exifDatumAusBytes(new Uint8Array(0))).toBeNull();
    expect(exifDatumAusBytes(new Uint8Array([0xff, 0xd8]))).toBeNull();
    // PNG-Signatur
    expect(exifDatumAusBytes(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBeNull();
    // HEIC (ftyp-Box)
    expect(exifDatumAusBytes(new Uint8Array([0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]))).toBeNull();
    // JPEG ohne EXIF
    expect(exifDatumAusBytes(jpeg(null))).toBeNull();
    // abgeschnitten an jeder Stelle
    for (let i = 0; i < gut.length; i++) expect(() => exifDatumAusBytes(gut.slice(0, i), JETZT)).not.toThrow();
    // zufällig verfälschte Bytes
    let seed = 7;
    const zufall = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % 256);
    for (let r = 0; r < 300; r++) {
      const kaputt = gut.slice();
      for (let k = 0; k < 6; k++) kaputt[2 + (zufall() * 7) % (kaputt.length - 2)] = zufall();
      expect(() => exifDatumAusBytes(kaputt, JETZT)).not.toThrow();
    }
    // falsche Byte-Reihenfolge-Kennung
    const t = tiff(true, [], [{ tag: ORIG, text: '2026:09:24 17:42:31' }]);
    t[0] = 0x41;
    expect(exifDatumAusBytes(jpeg(t), JETZT)).toBeNull();
    // Zeiger auf ExifIFD ausserhalb
    const t2 = tiff(true, [], [], [{ tag: 0x8769, typ: 4, anzahl: 1, wert: 999999 }]);
    expect(exifDatumAusBytes(jpeg(t2), JETZT)).toBeNull();
  });

  it('parseExifZeit ohne Sekunden, falscher Typ', () => {
    expect(parseExifZeit('2026:09:24 17:42', JETZT)).toEqual({ datum: '2026-09-24', uhrzeit: '17:42' });
    expect(parseExifZeit(null)).toBeNull();
    expect(parseExifZeit('gestern')).toBeNull();
  });

  it('leseExifDatum: liest nur den Dateianfang, Blob/null', async () => {
    const b = jpeg(tiff(false, [], [{ tag: ORIG, text: '2026:09:24 17:42:31' }]));
    expect(await leseExifDatum(new Blob([b], { type: 'image/jpeg' }), JETZT)).toEqual({ datum: '2026-09-24', uhrzeit: '17:42' });
    expect(await leseExifDatum(null)).toBeNull();
    expect(await leseExifDatum(new Blob([new Uint8Array([1, 2, 3])]))).toBeNull();
    let gelesen = -1;
    const spion = { slice: (a: number, e: number) => { gelesen = e - a; return new Blob([b]); } } as unknown as Blob;
    await leseExifDatum(spion, JETZT);
    expect(gelesen).toBe(EXIF_LESE_BYTES);
    const kaputt = { slice: () => { throw new Error('x'); } } as unknown as Blob;
    expect(await leseExifDatum(kaputt)).toBeNull();
  });
});

// ---------- Übernahme in das Formular ----------
const A = { datum: '2026-09-24', uhrzeit: '17:42' };
const B = { datum: '2026-09-20', uhrzeit: '08:15' };
const fotos = (a: FotoAufnahme['aufnahme'], b: FotoAufnahme['aufnahme'], artA: 'beleg' | 'tacho' = 'beleg'): FotoAufnahme[] => [
  { art: artA, aufnahme: a },
  { art: artA === 'beleg' ? 'tacho' : 'beleg', aufnahme: b },
];

describe('uebernimmFotoZeit', () => {
  it('leeres Formular (Fehler/Timeout): Datum und Uhrzeit vom Beleg-Foto, Konfidenz unsicher', () => {
    const e = leererEntwurf('f1').entwurf;
    const r = uebernimmFotoZeit(e, fotos(A, B), []);
    expect(r.entwurf.datum).toBe('2026-09-24');
    expect(r.entwurf.uhrzeit).toBe('17:42');
    expect(r.entwurf.konfidenz).toMatchObject({ datum: 'unsicher', uhrzeit: 'unsicher' });
    expect(r.ausFoto).toEqual(['datum', 'uhrzeit']);
    expect(istAusFoto(r.entwurf, 'datum', r.ausFoto)).toBe(true);
    expect(r.entwurf.roh_erkennung).toBeNull();
    expect(HINWEIS_AUS_FOTO.datum).toBe('aus Aufnahmedatum des Fotos');
  });

  it('Beleg-Foto ohne EXIF: anderes Foto; ohne jede Aufnahme: nichts', () => {
    expect(fotoZeitQuelle(fotos(null, B))).toEqual(B);
    expect(fotoZeitQuelle([{ art: null, aufnahme: A }])).toEqual(A);
    const e = leererEntwurf().entwurf;
    const r = uebernimmFotoZeit(e, fotos(null, null), []);
    expect(r.entwurf).toBe(e);
    expect(r.ausFoto).toEqual([]);
  });

  it('überschreibt nie einen vom Beleg gelesenen Wert', () => {
    const e: EintragEntwurf = { ...leererEntwurf().entwurf, datum: '2026-09-24', uhrzeit: '18:00', konfidenz: { datum: 'sicher', uhrzeit: 'unsicher' } };
    const r = uebernimmFotoZeit(e, fotos(B, A), []);
    expect(r.entwurf.datum).toBe('2026-09-24');
    expect(r.entwurf.uhrzeit).toBe('18:00');
    expect(r.ausFoto).toEqual([]);
  });

  it('Uhrzeit nur, wenn das Belegdatum zum Aufnahmedatum passt', () => {
    const e: EintragEntwurf = { ...leererEntwurf().entwurf, datum: '2026-09-24', konfidenz: { datum: 'sicher' } };
    expect(uebernimmFotoZeit(e, fotos(A, B), []).entwurf.uhrzeit).toBe('17:42');
    const r = uebernimmFotoZeit(e, fotos(B, null), []);
    expect(r.entwurf.uhrzeit).toBeUndefined();
    expect(r.ausFoto).toEqual([]);
  });

  it('Tauschen: Quelle neu bestimmen, solange nicht manuell', () => {
    const e0 = leererEntwurf().entwurf;
    const r1 = uebernimmFotoZeit(e0, fotos(A, B), []);
    // Zuordnung getauscht: Foto 1 ist jetzt Kilometerzähler, Foto 2 Beleg
    const r2 = uebernimmFotoZeit(r1.entwurf, [{ art: 'tacho', aufnahme: A }, { art: 'beleg', aufnahme: B }], r1.ausFoto, true);
    expect(r2.entwurf.datum).toBe('2026-09-20');
    expect(r2.entwurf.uhrzeit).toBe('08:15');
    expect(r2.ausFoto).toEqual(['datum', 'uhrzeit']);
    // Nutzer ändert das Datum -> manuell; Tauschen ändert es nicht mehr, Uhrzeit aus Foto wird entfernt (passt nicht mehr)
    const m = aendereFeld(r2.entwurf, 'datum', '2026-09-24');
    const aus = r2.ausFoto.filter((f) => f !== 'datum');
    const r3 = uebernimmFotoZeit(m, fotos(A, B), aus, true);
    expect(r3.entwurf.datum).toBe('2026-09-24');
    expect(r3.entwurf.konfidenz?.datum).toBe('manuell');
    expect(r3.entwurf.uhrzeit).toBe('17:42'); // Beleg-Foto A passt zum Datum
    const r4 = uebernimmFotoZeit(r3.entwurf, [{ art: 'tacho', aufnahme: A }, { art: 'beleg', aufnahme: B }], r3.ausFoto, true);
    expect(r4.entwurf.datum).toBe('2026-09-24');
    expect(r4.entwurf.uhrzeit).toBeUndefined(); // B (20.09.) passt nicht zu 24.09.
    expect(r4.ausFoto).toEqual([]);
  });

  it('Datum von Hand auf anderen Tag geändert: Uhrzeit aus dem Foto wird geleert', () => {
    const r1 = uebernimmFotoZeit(leererEntwurf().entwurf, fotos(A, B), []);
    const m = aendereFeld(r1.entwurf, 'datum', '2026-09-10');
    const r2 = uebernimmFotoZeit(m, fotos(A, B), ['uhrzeit'], true);
    expect(r2.entwurf.datum).toBe('2026-09-10');
    expect(r2.entwurf.uhrzeit).toBeUndefined();
    expect(r2.entwurf.konfidenz?.uhrzeit).toBeUndefined();
    expect(r2.ausFoto).toEqual([]);
  });

  it('Tauschen füllt keine vom Nutzer geleerten Felder', () => {
    const e = leererEntwurf().entwurf;
    const r = uebernimmFotoZeit(e, fotos(A, B), [], true);
    expect(r.entwurf.datum).toBeUndefined();
  });

  it('manuell eingegebene Uhrzeit bleibt, auch wenn sie noch als «aus Foto» geführt wäre', () => {
    const r1 = uebernimmFotoZeit(leererEntwurf().entwurf, fotos(A, B), []);
    const m = aendereFeld(r1.entwurf, 'uhrzeit', '19:00');
    const r2 = uebernimmFotoZeit(m, fotos(B, A), r1.ausFoto, true);
    expect(r2.entwurf.uhrzeit).toBe('19:00');
    expect(r2.entwurf.konfidenz?.uhrzeit).toBe('manuell');
  });
});

describe('zusatzWarnungen (Aufnahmedatum vs. Belegdatum)', () => {
  const mitDatum = (d: string): EintragEntwurf => ({ ...leererEntwurf().entwurf, datum: d, konfidenz: { datum: 'sicher' } });
  it('mehr als 2 Tage Abweichung -> Warnung', () => {
    const w = zusatzWarnungen(mitDatum('2026-09-24'), fotos({ datum: '2026-09-28', uhrzeit: '10:00' }, null));
    expect(w).toEqual([{ feld: 'datum', text: 'Foto wurde am 28.09.2026 aufgenommen, Beleg zeigt 24.09.2026 – bitte prüfen.' }]);
    expect(zusatzWarnungen(mitDatum('2026-09-24'), fotos(null, { datum: '2026-09-21', uhrzeit: '10:00' }))).toHaveLength(1);
  });
  it('bis 2 Tage, ohne Datum, ohne Aufnahme oder Datum aus dem Foto -> keine Warnung', () => {
    expect(zusatzWarnungen(mitDatum('2026-09-24'), fotos({ datum: '2026-09-26', uhrzeit: '10:00' }, { datum: '2026-09-22', uhrzeit: '1:00' }))).toEqual([]);
    expect(zusatzWarnungen(leererEntwurf().entwurf, fotos(A, B))).toEqual([]);
    expect(zusatzWarnungen(mitDatum('2026-09-24'), fotos(null, null))).toEqual([]);
    const r = uebernimmFotoZeit(leererEntwurf().entwurf, fotos(A, B), []);
    expect(zusatzWarnungen(r.entwurf, fotos(A, B), r.ausFoto)).toEqual([]);
  });
  it('gleiche Aufnahmedaten nur einmal; Monatswechsel korrekt', () => {
    const d = { datum: '2026-10-01', uhrzeit: '10:00' };
    expect(zusatzWarnungen(mitDatum('2026-09-24'), fotos(d, d))).toHaveLength(1);
    expect(zusatzWarnungen(mitDatum('2026-09-29'), fotos(d, null))).toEqual([]);
  });
});
