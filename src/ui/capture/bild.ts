// Clientseitiges Verkleinern von Fotos (SPEC 6.2): längste Seite 1600 px, JPEG 0.8, EXIF-Ausrichtung.

export const MAX_SEITE = 1600;
export const JPEG_QUALITAET = 0.8;
/** Obergrenze für die Originaldatei (Schutz vor Speicherproblemen auf dem Handy). */
export const MAX_DATEI_BYTES = 40 * 1024 * 1024;

export type BildFehlerCode = 'kein-bild' | 'zu-gross' | 'nicht-lesbar';

export class BildFehler extends Error {
  code: BildFehlerCode;
  constructor(code: BildFehlerCode, message: string) {
    super(message);
    this.name = 'BildFehler';
    this.code = code;
  }
}

/** Rein rechnerisch: Zielgrösse bei längster Seite <= max. Kein Hochskalieren. */
export function zielGroesse(
  breite: number,
  hoehe: number,
  max: number = MAX_SEITE,
): { breite: number; hoehe: number; skaliert: boolean } {
  if (!(breite > 0) || !(hoehe > 0)) return { breite: 0, hoehe: 0, skaliert: false };
  const laengste = Math.max(breite, hoehe);
  if (laengste <= max) return { breite: Math.round(breite), hoehe: Math.round(hoehe), skaliert: false };
  const f = max / laengste;
  return {
    breite: Math.max(1, Math.round(breite * f)),
    hoehe: Math.max(1, Math.round(hoehe * f)),
    skaliert: true,
  };
}

/** Prüft Datei vor dem Dekodieren; wirft BildFehler. */
export function pruefeDatei(datei: { type: string; size: number } | null | undefined): void {
  if (!datei || datei.size === 0) throw new BildFehler('kein-bild', 'Es wurde kein Foto ausgewählt.');
  // Manche Browser liefern für HEIC einen leeren Typ; dann versuchen wir das Dekodieren trotzdem.
  if (datei.type && !datei.type.startsWith('image/')) {
    throw new BildFehler('kein-bild', 'Die Datei ist kein Bild.');
  }
  if (datei.size > MAX_DATEI_BYTES) {
    throw new BildFehler('zu-gross', 'Das Foto ist zu gross (über 40 MB). Bitte ein kleineres Foto verwenden.');
  }
}

interface Quelle {
  zeichne: CanvasImageSource;
  breite: number;
  hoehe: number;
  freigeben: () => void;
}

async function dekodiere(datei: Blob): Promise<Quelle> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(datei, { imageOrientation: 'from-image' });
      return { zeichne: bmp, breite: bmp.width, hoehe: bmp.height, freigeben: () => bmp.close() };
    } catch {
      /* Fallback unten (ältere Safari-Versionen kennen die Option nicht) */
    }
  }
  const url = URL.createObjectURL(datei);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    // Moderne Browser wenden die EXIF-Ausrichtung beim Zeichnen von <img> an.
    return {
      zeichne: img,
      breite: img.naturalWidth,
      hoehe: img.naturalHeight,
      freigeben: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new BildFehler('nicht-lesbar', 'Das Foto konnte nicht gelesen werden. Bitte erneut aufnehmen.');
  }
}

/** Verkleinert ein Foto und liefert ein JPEG-Blob. Wirft BildFehler. */
export async function verkleinere(datei: File | Blob): Promise<Blob> {
  pruefeDatei(datei);
  const q = await dekodiere(datei);
  try {
    const ziel = zielGroesse(q.breite, q.hoehe);
    if (ziel.breite === 0) throw new BildFehler('nicht-lesbar', 'Das Foto ist leer oder beschädigt.');
    const canvas = document.createElement('canvas');
    canvas.width = ziel.breite;
    canvas.height = ziel.hoehe;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new BildFehler('nicht-lesbar', 'Das Foto konnte nicht verarbeitet werden.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, ziel.breite, ziel.hoehe);
    ctx.drawImage(q.zeichne, 0, 0, ziel.breite, ziel.hoehe);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', JPEG_QUALITAET));
    if (!blob) throw new BildFehler('nicht-lesbar', 'Das Foto konnte nicht umgewandelt werden.');
    return blob;
  } finally {
    q.freigeben();
  }
}

export function bildFehlerText(e: unknown): string {
  if (e instanceof BildFehler) return e.message;
  return 'Das Foto konnte nicht verarbeitet werden.';
}
