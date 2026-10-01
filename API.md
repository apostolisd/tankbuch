# Modulvertrag (verbindlich für alle Teams)

Quelle der Fachregeln: SPEC.md. Typen: src/core/types.ts (nicht ändern; Ergänzungen nur als neue Exporte in der eigenen Datei).
Stack: Preact + TypeScript (strict), Vite, vitest. Node liegt unter `C:\Program Files\nodejs` (PATH ggf. ergänzen).
Hash-Routing (`#/tankbuch`), da GitHub Pages. Kein Dunkelmodus. Deutsch (Schweiz), «ss», 1'234.50, 24.09.2026, CHF.

## src/core (reine Funktionen, keine Seiteneffekte)
segments.ts
  berechneSegmente(eintraege: Tankvorgang[], einst: Einstellungen): Segment[]   // nach km_stand sortiert, SPEC 5.1, aufsteigend nach Enddatum
  zaehltImDurchschnitt(s: Segment, einst: Einstellungen): boolean               // gueltig, oder geschaetzt+Einstellung
  sortiereEintraege(e: Tankvorgang[]): Tankvorgang[]                            // aufsteigend km_stand, Tiebreak datum
  segmentZuEintrag(segmente: Segment[], eintragId: string): Segment | null      // Segment, zu dem der Eintrag gehört (Voll: das es abschliesst; Teil: das es enthält; erste Volltankung: null)
kennzahlen.ts
  belegKennzahlen(e: Tankvorgang[], z: Zeitraum): BelegKennzahlen
  segmentKennzahlen(segmente: Segment[], z: Zeitraum, einst: Einstellungen): SegmentKennzahlen
  eintraegeImZeitraum(e: Tankvorgang[], z: Zeitraum): Tankvorgang[]             // nach datum, inklusiv
zeitraum.ts
  type ZeitraumPreset = '30tage'|'quartal'|'jahr'|'12monate'|'benutzerdefiniert'
  zeitraumVonPreset(p: ZeitraumPreset, heute: string, custom?: Zeitraum): Zeitraum
  monatsZeitraum(jahr: number, monat1bis12: number): Zeitraum
  vorherigerZeitraum(z: Zeitraum): Zeitraum
pruefungen.ts
  pruefeEntwurf(entwurf: EintragEntwurf, kontext: { fahrzeug: Fahrzeug|null; bestehende: Tankvorgang[]; heute: string; einst: Einstellungen }): Pruefung[]   // SPEC 5.3; bestehende enthält ggf. den eigenen Eintrag (id) -> ausschliessen
  kannSpeichern(p: Pruefung[]): boolean                                          // false bei mindestens einem 'fehler'
  ergaenzeFehlendenWert(e: EintragEntwurf): { entwurf: EintragEntwurf; berechnet: string[] }  // genau einer von liter/preis/betrag fehlt -> berechnet (+ Konfidenz 'berechnet')
  vorschauSegment(entwurf: EintragEntwurf, kontext): { segment: Segment|null; teilbetankung: boolean }  // für «Gespeichert»-Screen
preise.ts
  preisAnalyse(e: Tankvorgang[], z: Zeitraum): { punkte: {id,datum,preisChf,tankstelle,gruppe}[]; durchschnitt: number|null; gruppen: string[] /*max 3: 2 häufigste + 'Übrige'*/; tabelle: {tankstelle,anzahl,liter,preisSchnitt,diffZurGuenstigsten,mehrkosten}[]; guenstigste: string|null; ersparnis: number }
verlauf.ts
  verbrauchsReihe(segmente: Segment[], einst: Einstellungen): { segment: Segment; wert: number|null; gleitend: number|null; luecke: boolean; ausreisser: boolean; notiz: string|null }[]   // gleitend: Mittel der letzten 3 gültigen, nach Lücke neu; Ausreisser > 15 % über gleitendem Mittel
  ausgabenProMonat(e: Tankvorgang[], z: Zeitraum): { monat: string /*yyyy-mm*/; ausgaben: number }[]
  saisonvergleich(segmente: Segment[], einst: Einstellungen, jahr: number): { winter: {verbrauch:number|null; n:number}; sommer: {verbrauch:number|null; n:number} }   // Nov–Mär vs Mai–Sep, nach Enddatum
  vergleicheZeitraeume(e: Tankvorgang[], segmente: Segment[], a: Zeitraum, b: Zeitraum, einst: Einstellungen): { a: Kombi; b: Kombi }  // Kombi = {beleg: BelegKennzahlen; seg: SegmentKennzahlen}
bericht.ts
  monatsBericht(e: Tankvorgang[], segmente: Segment[], jahr: number, monat: number, einst: Einstellungen): MonatsBericht  // km, ausgaben(=Segmentkosten), verbrauch, kostenPro100km, vormonat, vorjahr (je Kennzahlen|null), veraenderung, treiber ('Fahrleistung'|'Preis'|'Verbrauch'|null), text (feste Satzbausteine), jahresverlauf (12 Monate CHF/100km|null), luecken: string[] (Hinweise), methode: string
  (MonatsBericht-Typ wird in bericht.ts exportiert.)
tests/fixture.ts exportiert `TESTDATEN: Tankvorgang[]` (SPEC 10, betrag_chf gesetzt, Fahrzeug 45 l) und `FAHRZEUG: Fahrzeug`.

## src/lib (Shell-Team)
format.ts: chf(n), zahl(n, dez), datum(iso)->'24.09.2026', lPro100(n), rp(n), km(n) — Swiss: 1'234.50 (Apostroph). parseZahl(text)->number|null (akzeptiert , und .).
supabase.ts: `supabase` Client (VITE_SUPABASE_URL/ANON_KEY aus import.meta.env), `konfiguriert: boolean`.
data.ts (alle async, werfen bei Fehlern `Error` mit deutscher Meldung):
  holeFahrzeug(): Promise<Fahrzeug>                      // legt Standardfahrzeug an, falls keines existiert
  speichereFahrzeug(f: Partial<Fahrzeug>)
  holeTankvorgaenge(fahrzeugId): Promise<Tankvorgang[]>
  speichereTankvorgang(e: Omit<Tankvorgang,'id'|'betrag_chf'> & {id?: string}): Promise<Tankvorgang>
  loescheTankvorgang(id: string, fotosLoeschen: boolean)
  ladeFotoUrl(pfad: string): Promise<string>             // signierte URL
  ladeFotoHoch(blob: Blob): Promise<string>              // gibt Pfad <user_id>/<uuid>.jpg zurück
  ruftErkennung(req: ExtractRequest, signal?: AbortSignal): Promise<Erkennung>   // Timeout 20 s -> Error
  holeEinstellungen()/speichereEinstellungen(e: Einstellungen)   // localStorage + Supabase-Tabelle optional; einfach: localStorage ist ok für UI-Flags, unvollstaendigeSegmente aber in Tabelle `einstellung` (user_id pk, daten jsonb) – Migration liefert Backend-Team
  tankstellenAliase: holeAliase()/speichereAlias(von, nach)     // Tabelle `tankstelle_alias` (user_id, von, nach) – Backend-Team
store.ts: Preact-Signals-freier einfacher Store: `useDaten()` Hook -> { fahrzeug, eintraege, einst, segmente, laedt, fehler, neuLaden(), setEinst(e) }
ui/components.tsx (Shell-Team, Views nutzen sie):
  <Kachel titel wert einheit? sub? warnung? >{herleitung}</Kachel>   // Kennzahlkachel mit aufklappbarer Herleitung (details/summary, >=44px)
  <Bruch zaehler nenner />  // echter Bruch (CSS), <Sub/> Index
  <ZeitraumWahl wert onChange />  // Presets + von/bis; Zustand gehalten im Store (`useZeitraum()` -> [Zeitraum, setter, preset])
  <Status typ />  // Badge mit Text+Symbol (nie nur Farbe)
  <Seite titel>…</Seite>, <Hinweis stufe>…</Hinweis>, <Knopf>, <Feld label …>
  ui/router: `useRoute()` ; Routen: '/', '/erfassen', '/erfassen/bestaetigen', '/tankbuch', '/verlauf', '/preise', '/bericht', '/bericht/:jahr/:monat', '/einstellungen', '/eintrag/:id'
Views exportieren je eine Default-Komponente:
  src/ui/views/Start.tsx (Shell), Tankbuch.tsx, Verlauf.tsx, Preise.tsx, Bericht.tsx, Einstellungen.tsx (Shell), src/ui/capture/Erfassen.tsx (Fotos→Erkennung), Bestaetigen.tsx (Formular; auch für Bearbeiten: Prop `eintragId?`), Gespeichert.tsx
  Capture-Zustand läuft über `src/ui/capture/erfassung.ts` (Capture-Team).

## Edge Function (Backend-Team): POST /functions/v1/extract, Body ExtractRequest, Antwort Erkennung (types.ts); Fehler {error: string} mit Status 4xx/5xx.

Nutzerentscheid 30.09.2026: EIN Fotofeld für 1 bis 2 Bilder; die Erkennung ordnet selbst zu, welches Bild Beleg und welches Kilometerzähler ist.

Request (ExtractRequest):
  { bilder?: string[] /* 1–2 Pfade <user_id>/<uuid>.jpg, Aufnahmereihenfolge, keine Doppel */,
    beleg_pfad?: string|null, tacho_pfad?: string|null /* alt, feste Zuordnung; ignoriert, wenn bilder gesetzt ist */,
    hinweise?: { letzter_km_stand?, letzte_tankstellen? } }
  - bilder gesetzt: alle Bilder in EINEM Modellaufruf, nummeriert «Bild 1», «Bild 2»; das Modell bestimmt je Bild die Art.
  - Pfad- (eigenes Präfix, Muster), Grössen- (≤ 5 MB) und Dateikopfprüfung (JPEG/PNG) gelten für jedes Bild.
  - 400: bilder leer, > 2, Nicht-Strings oder doppelte Pfade; 403: fremder/ungültiger Pfad.
  - Der Client schickt zusätzlich beleg_pfad = bilder[0], tacho_pfad = bilder[1], damit eine noch nicht aktualisierte
    Funktion weiter antwortet (dann ohne zuordnung -> Client zeigt die Auswahl).

Antwort (Erkennung) zusätzlich:
  zuordnung: { pfad: string; art: 'beleg'|'tacho'|'unbekannt'; konfidenz: Konfidenz }[]
  - genau ein Eintrag je Eingabepfad, in Eingabereihenfolge; pfad ist immer einer der Eingabepfade.
  - Validierung (validate.ts `validiereZuordnung`): Modell verweist per `bild` (1-basiert) oder `pfad`; fremde Pfade/Nummern
    werden verworfen, pro Bild zählt der erste Eintrag; unbekannte Art -> 'unbekannt' (konfidenz 'unsicher'), fehlender Eintrag
    -> 'unbekannt' (konfidenz 'fehlt'); zwei Belege oder zwei Tachos -> beide 'unsicher' + Hinweis; 'unbekannt' -> Hinweis.
  - Alte Anfrageform: zuordnung = feste Zuordnung aus beleg_pfad/tacho_pfad (konfidenz 'sicher').
  - Im Typ optional (ältere roh_erkennung ohne zuordnung).

Client (src/ui/capture/logik.ts, rein): zuordnungAusErkennung(pfade, zuordnung) -> { fotos: {art, status}[], auswahl, hinweis };
  zuordnungOhneErkennung(n) (Fehler/Timeout: 1. Foto Beleg, 2. Kilometerzähler, Auswahl); tauscheZuordnung; waehleArt
  (das andere Foto bekommt automatisch die andere Art); fotoPfade(fotos) -> { beleg_foto_pfad, tacho_foto_pfad }.
  Datenbank unverändert (beleg_foto_pfad / tacho_foto_pfad).

Aufnahmedatum aus den Foto-Metadaten (Nutzerwunsch 01.10.2026):
  src/ui/capture/exif.ts (rein, ohne Abhängigkeit): leseExifDatum(datei: Blob, jetzt?) -> Promise<{datum:'yyyy-mm-dd', uhrzeit:'HH:MM'} | null>;
  exifDatumAusBytes(bytes, jetzt?), parseExifZeit(text, jetzt?). Nur JPEG (APP1 «Exif», TIFF II/MM, IFD0 + ExifIFD), liest nur die
  ersten 128 KB; DateTimeOriginal -> DateTimeDigitized -> DateTime; lokale Zeit (OffsetTime* ignoriert); keine GPS-/sonstigen Tags.
  Unplausibel (Jahr < 2000, > 1 Tag in der Zukunft, ungültiges Datum), HEIC/PNG, kaputte Daten -> null; wirft nie.
  erfassung.ts liest das Datum beim Hinzufügen VOR dem Verkleinern (FotoSlot.aufnahme, nur im Arbeitsspeicher; state.ausFoto).
  logik.ts: fotoZeitQuelle(fotos) (Beleg-Foto bevorzugt), uebernimmFotoZeit(entwurf, fotos, ausFoto, nurBestehende?) -> {entwurf, ausFoto}
  (nach der Erkennung auch bei Fehler/Timeout; leere Felder -> Konfidenz 'unsicher', Feldhinweis HINWEIS_AUS_FOTO; beim Tauschen
  nur Felder neu bestimmen, die noch aus dem Foto stammen; nie über Beleg- oder Handeingabe), istAusFoto(),
  zusatzWarnungen(entwurf, fotos, ausFoto) -> {feld, text}[] (nicht blockierend: Belegdatum vs. Aufnahmedatum > 2 Tage).
  roh_erkennung unverändert; EXIF-Daten werden nicht gespeichert.
