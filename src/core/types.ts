// Gemeinsamer Vertrag aller Module. Änderungen nur in Absprache (Koordinator).

export type Konfidenz = 'sicher' | 'unsicher' | 'fehlt' | 'berechnet' | 'manuell';

export interface Fahrzeug {
  id: string;
  name: string;
  tankvolumen_l: number | null;
}

/** Zeile der Tabelle «tankvorgang» (Kennzahlen werden nie gespeichert). */
export interface Tankvorgang {
  id: string;
  fahrzeug_id: string;
  datum: string;            // ISO yyyy-mm-dd
  uhrzeit: string | null;   // HH:MM
  km_stand: number;
  liter: number;
  betrag: number;           // Belegwährung
  waehrung: string;
  wechselkurs: number;      // Belegwährung -> CHF
  betrag_chf: number;       // = round(betrag * wechselkurs, 2)
  preis_pro_liter: number;  // Belegwährung
  tankstelle: string | null;
  kraftstoff: string | null;
  volltankung: boolean;
  geschaetzt: boolean;
  notiz: string | null;
  konfidenz: Record<string, Konfidenz> | null;
  roh_erkennung: unknown | null;
  beleg_foto_pfad: string | null;
  tacho_foto_pfad: string | null;
}

export type SegmentStatus =
  | 'gueltig'
  | 'geschaetzt'     // enthält geschätzten Eintrag: angezeigt, nicht in Durchschnitt (ausser Einstellung)
  | 'unplausibel'    // Verbrauch ausserhalb VERBRAUCH_MIN–VERBRAUCH_MAX (segments.ts, aktuell 3.5–15.0)
  | 'unvollstaendig';// vom Nutzer markiert

export interface Segment {
  startId: string;          // Volltankung A
  endId: string;            // Volltankung B
  eintragIds: string[];     // alle Einträge nach A bis und mit B
  teilIds: string[];        // Teilbetankungen darin
  kmStart: number;
  kmEnde: number;
  km: number;
  liter: number;
  kosten: number;           // Σ betrag_chf
  verbrauch: number | null; // l/100 km, null bei unplausibel/unvollstaendig (geschaetzt: berechnet, aber Status beachten)
  enddatum: string;
  status: SegmentStatus;
  grund: string | null;     // Text für ausgeschlossene Segmente
}

export interface Einstellungen {
  geschaetzteMitrechnen: boolean;
  /**
   * Segmente, die der Nutzer manuell als «unvollständig» markiert hat.
   * Schlüssel: `${startId}>${endId}` (neu, exakt ein Segment) oder nur `endId` (alt, Rückwärtskompatibilität).
   * Siehe segmentSchluessel() / istMarkiert() in segments.ts.
   */
  unvollstaendigeSegmente: string[];
}

export interface Zeitraum { von: string; bis: string } // ISO, inklusiv

export interface BelegKennzahlen {
  ausgaben: number;
  liter: number;
  /** Ø Preis = Σ betrag_chf / Σ liter über ALLE Belege (Fremdwährung in CHF umgerechnet); null ohne Liter. */
  preisProLiter: number | null;
  anzahl: number;
  teilbetankungen: number;
  geschaetzt: number;
  fremdwaehrung: { waehrung: string; betragOriginal: number; betragChf: number; anzahl: number }[];
}

export interface SegmentKennzahlen {
  km: number;                      // Σ Segment.km (alle Segmente mit enddatum im Zeitraum)
  verbrauch: number | null;        // Σ liter gültig / Σ km gültig × 100
  literGueltig: number;
  kmGueltig: number;
  kostenPro100km: number | null;   // Σ kosten / Σ km × 100 (gültige + unvollständige, s. SPEC 5.2)
  rpProKm: number | null;
  segmenteGesamt: number;
  segmenteGueltig: number;
  ausgeschlossen: { segment: Segment; grund: string }[];
}

export type PruefStufe = 'fehler' | 'warnung';
export interface Pruefung {
  code: string;
  stufe: PruefStufe;
  feld?: string;
  text: string;
  /** Schnellkorrektur (z.B. «Liter aus Betrag ÷ Preis übernehmen») */
  korrektur?: { label: string; feld: string; wert: number };
}

/** Eingabe für Prüfungen: noch nicht gespeicherter Eintrag. */
export type EintragEntwurf = Partial<Omit<Tankvorgang, 'id' | 'betrag_chf'>> & { id?: string };

// ---- Erkennung (Edge Function) ----
export interface ErkanntesFeld<T> { wert: T | null; konfidenz: Konfidenz }
export interface Erkennung {
  datum: ErkanntesFeld<string>;
  uhrzeit: ErkanntesFeld<string>;
  liter: ErkanntesFeld<number>;
  preis_pro_liter: ErkanntesFeld<number>;
  betrag: ErkanntesFeld<number>;
  waehrung: ErkanntesFeld<string>;
  tankstelle: ErkanntesFeld<string>;
  kraftstoff: ErkanntesFeld<string>;
  km_stand: ErkanntesFeld<number>;
  hinweise: string[];
  /**
   * Welches Eingabebild was zeigt: genau ein Eintrag je Eingabepfad, in der Reihenfolge der Eingabe.
   * Optional nur wegen älterer gespeicherter `roh_erkennung`; die Edge Function liefert es immer.
   */
  zuordnung?: BildZuordnung[];
}
export type BildArt = 'beleg' | 'tacho' | 'unbekannt';
export interface BildZuordnung { pfad: string; art: BildArt; konfidenz: Konfidenz }

export interface ExtractRequest {
  /** Neu: 1 bis 2 Fotopfade in Aufnahmereihenfolge; die Erkennung ordnet selbst zu, was Beleg und was Kilometerzähler ist. */
  bilder?: string[];
  /** Alt (Abwärtskompatibilität): feste Zuordnung. Wird ignoriert, wenn `bilder` gesetzt ist. */
  beleg_pfad?: string | null;
  tacho_pfad?: string | null;
  hinweise?: { letzter_km_stand?: number; letzte_tankstellen?: string[] };
}
