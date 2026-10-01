// Missbrauchsschutz der Edge Function (reine Funktionen, ohne Deno-Abhängigkeit, daher testbar).
//
// 1. Allowlist: Secret ALLOWED_EMAILS (kommagetrennt, ohne Beachtung von Gross-/Kleinschreibung).
//    Leer oder nicht gesetzt = alle angemeldeten Nutzer erlaubt.
// 2. Mengenbegrenzung je Nutzer im Speicher der Funktion (gleitendes Fenster). Gilt pro Funktionsinstanz; bei mehreren
//    Instanzen ist die Grenze weicher, schützt aber gegen Schleifen/Missbrauch zuverlässig genug für den Privatgebrauch.
// 3. Bildprüfung: Grösse und Dateikopf (JPEG/PNG) – das Modell bekommt nur echte Bilder bis zur Maximalgrösse.

/** ALLOWED_EMAILS -> normalisierte Liste; leer = keine Einschränkung. */
export function parseAllowlist(roh: string | null | undefined): string[] {
  return (roh ?? '')
    .split(/[,;\s]+/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x !== '');
}

/** true, wenn die Allowlist leer ist (alle erlaubt) oder die E-Mail darin steht. */
export function istErlaubt(email: string | null | undefined, allowlist: string[]): boolean {
  if (allowlist.length === 0) return true;
  if (!email) return false;
  return allowlist.includes(email.trim().toLowerCase());
}

export class RateLimiter {
  private readonly treffer = new Map<string, number[]>();
  constructor(private readonly max: number, private readonly fensterMs: number) {}

  /** Registriert einen Aufruf; false = Grenze erreicht (Aufruf wird NICHT gezählt). */
  pruefe(nutzer: string, jetzt: number = Date.now()): boolean {
    const grenze = jetzt - this.fensterMs;
    const liste = (this.treffer.get(nutzer) ?? []).filter((t) => t > grenze);
    if (liste.length >= this.max) {
      this.treffer.set(nutzer, liste);
      return false;
    }
    liste.push(jetzt);
    this.treffer.set(nutzer, liste);
    // Speicher begrenzen: abgelaufene Nutzer gelegentlich entfernen
    if (this.treffer.size > 500) {
      for (const [k, v] of this.treffer) if (v.every((t) => t <= grenze)) this.treffer.delete(k);
    }
    return true;
  }

  /** Sekunden bis wieder ein Aufruf möglich ist (für «Retry-After»). */
  warteSekunden(nutzer: string, jetzt: number = Date.now()): number {
    const liste = (this.treffer.get(nutzer) ?? []).filter((t) => t > jetzt - this.fensterMs);
    if (liste.length < this.max) return 0;
    return Math.max(1, Math.ceil((liste[0] + this.fensterMs - jetzt) / 1000));
  }
}

/** Erkennt JPEG/PNG am Dateikopf; null = kein erlaubtes Bild. */
export function bildTyp(bytes: Uint8Array): 'image/jpeg' | 'image/png' | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) return 'image/png';
  return null;
}
