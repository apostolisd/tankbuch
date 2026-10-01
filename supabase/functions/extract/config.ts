// Zentrale Konfiguration der Erkennung.
export const MODELL_ID = 'claude-sonnet-5-5';
export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
/** Grosszügig: das Modell denkt vor der Antwort (adaptive thinking); ein knappes Limit schneidet das JSON ab. */
export const MAX_TOKENS = 8000;
/** Denktiefe: 'low' reicht zum Ablesen und hält die Antwortzeit kurz. */
export const EFFORT = 'low';
/** Gesamtbudget pro Anfrage (ms), inkl. Wiederholungsversuch. Client bricht nach 20 s ab. */
export const TIMEOUT_MS = 19_000;
export const BUCKET = 'belege';
/** Max. Bildgrösse aus dem Storage (Bytes); Client verkleinert auf ca. 1600 px. */
export const MAX_BILD_BYTES = 5 * 1024 * 1024;
/** Maximal erlaubte Bilder je Anfrage (Beleg + Tacho). */
export const MAX_BILDER = 2;
/** Mengenbegrenzung je Nutzer: höchstens so viele Erkennungen pro Fenster (Speicher der Funktionsinstanz). */
export const RATE_MAX_ANFRAGEN = 6;
export const RATE_FENSTER_MS = 60_000;
