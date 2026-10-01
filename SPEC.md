# Tankbuch – Spezifikation für die Umsetzung

Übergabedokument aus der Konzeptphase (Cowork, 30.09.2026) an Claude Code.
Dieses Dokument legt die Fachlogik und die Rahmenentscheide fest. Die technische
Ausgestaltung innerhalb dieser Vorgaben ist frei.

Mockups der vier Ansichten liegen auf der Design-Fläche «Tankkosten – fünf Ideen»
(claude.ai, Artboards 1 bis 4; Artboard 5 «Kostenkompass» wird nicht umgesetzt).

---

## 1. Ziel

Eine persönliche App, mit der der Nutzer nach jedem Tankvorgang zwei Fotos macht
(Tankbeleg und Kilometerzähler), daraus die Werte automatisch ausgelesen und nach
Bestätigung gespeichert werden, und die daraus für frei wählbare Zeiträume
gefahrene Kilometer, Ausgaben, Verbrauch, Kosten pro Kilometer und deren Verlauf
zeigt.

Nicht Ziel der ersten Version: Gesamtkosten des Autos (Versicherung, Wertverlust
usw.), mehrere Nutzer pro Fahrzeug, Fahrtenbuch mit Einzelfahrten.

## 2. Rahmenentscheide (fix)

| Thema | Entscheid |
|---|---|
| App-Form | Progressive Web App (PWA), primär für iPhone/Safari, «Zum Home-Bildschirm». Desktop-Browser muss ebenfalls funktionieren (Auswertung am PC). |
| Hosting App | Statische Dateien auf GitHub Pages aus diesem Repo. |
| Backend | Supabase: Postgres (Einträge), Storage (Fotos), Auth (E-Mail-Magic-Link), Edge Function (Erkennung). Region Frankfurt (EU). |
| Erkennung | Claude API (Bildverständnis) über eine Supabase Edge Function. Der Anthropic-API-Schlüssel liegt ausschliesslich als Supabase-Secret, nie im Client. |
| Sprache der Oberfläche | Deutsch (Schweiz): «ss» statt «ß», Zahlenformat 1'234.50, Datum 24.09.2026, Währung CHF. |
| Gestaltung | Helle Oberfläche, kein Dunkelmodus. Formeln und Herleitungen gut lesbar (echte Brüche, Indizes), nicht als Kleintext. Farben und Aufbau gemäss Mockups. |
| Fahrzeuge | Datenmodell sieht mehrere Fahrzeuge vor, Oberfläche der ersten Version zeigt eines (Standardfahrzeug). |
| Rechenprinzip | Kennzahlen werden nie gespeichert, sondern bei jeder Anzeige aus den Einträgen berechnet. Jede Kennzahl hat eine aufklappbare Herleitung. |

Technologie innerhalb dieser Vorgaben frei; empfohlen: Vite + TypeScript, ein
leichtes Framework (Preact oder Svelte) oder Vanilla, keine schwere UI-Bibliothek,
Diagramme als SVG selbst gezeichnet oder mit einer kleinen Bibliothek (z.B. uPlot).
Keine Abhängigkeit, die ohne Build-Schritt nicht auf GitHub Pages läuft.

## 3. Architektur

```
iPhone (Safari / PWA)
  │  1. Foto aufnehmen, clientseitig verkleinern (max. 1600 px, JPEG ~0.8)
  │  2. Upload nach Supabase Storage (Bucket «belege», Pfad <user_id>/<uuid>.jpg)
  │  3. POST /functions/v1/extract  { beleg_pfad?, tacho_pfad? }   (mit Supabase-JWT)
  ▼
Supabase Edge Function «extract»
  │  – prüft JWT, lädt die Bilder aus dem Storage (signierte URL oder direkt)
  │  – ruft Anthropic Messages API mit Bild(ern) + Prompt (Abschnitt 7)
  │  – validiert die JSON-Antwort gegen das Schema, ergänzt Plausibilitätsprüfungen
  ▼
Antwort an den Client: Felder mit Wert + Konfidenz + Hinweise
  │  4. Bestätigungsbildschirm, Nutzer korrigiert, setzt «Volltankung», speichert
  ▼
Tabelle «tankvorgang» (Row Level Security: nur eigene Zeilen)
  │
  ▼
Ansichten Tankbuch / Verlauf / Preise / Monatsbericht rechnen clientseitig
```

Secrets: `ANTHROPIC_API_KEY` als Supabase-Secret der Edge Function. Im Client nur
`SUPABASE_URL` und `SUPABASE_ANON_KEY` (öffentlich, durch RLS abgesichert).

## 4. Datenmodell (Supabase / Postgres)

```sql
create table fahrzeug (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  tankvolumen_l numeric(5,1),          -- für Plausibilitätsprüfung, optional
  created_at    timestamptz not null default now()
);

create table tankvorgang (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  fahrzeug_id       uuid not null references fahrzeug(id) on delete cascade,
  datum             date not null,
  uhrzeit           time,
  km_stand          integer not null,
  liter             numeric(6,2) not null,
  betrag            numeric(8,2) not null,     -- in Belegwährung
  waehrung          text not null default 'CHF',
  wechselkurs       numeric(8,4) not null default 1,  -- Belegwährung -> CHF
  betrag_chf        numeric(8,2) generated always as (round(betrag * wechselkurs, 2)) stored,
  preis_pro_liter   numeric(6,3) not null,     -- in Belegwährung
  tankstelle        text,
  kraftstoff        text,
  volltankung       boolean not null default true,
  geschaetzt        boolean not null default false,   -- manuell nachgetragen ohne Beleg
  notiz             text,
  konfidenz         jsonb,          -- {"liter":"sicher","betrag":"unsicher",...}
  roh_erkennung     jsonb,          -- vollständige Antwort der Erkennung
  beleg_foto_pfad   text,
  tacho_foto_pfad   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index on tankvorgang (fahrzeug_id, datum, km_stand);

alter table fahrzeug    enable row level security;
alter table tankvorgang enable row level security;
create policy "eigene fahrzeuge"  on fahrzeug    for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "eigene vorgaenge"  on tankvorgang for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

Storage: Bucket `belege`, privat, Policy: Lesen/Schreiben nur unter dem eigenen
Präfix `<auth.uid()>/`. Fotos werden nie gelöscht, wenn ein Eintrag gelöscht wird,
ohne dass der Nutzer es bestätigt.

Konfidenzwerte: `sicher` | `unsicher` | `fehlt` | `berechnet` (aus den anderen
beiden Werten hergeleitet) | `manuell` (vom Nutzer eingegeben oder geändert).

## 5. Fachlogik

### 5.1 Segmente (Voll-zu-Voll)

Einträge eines Fahrzeugs werden nach `km_stand` sortiert. Ein **Segment** reicht
von einer Volltankung A bis zur nächsten Volltankung B und umfasst alle Einträge
nach A bis und mit B (also auch Teilbetankungen dazwischen).

```
Segment.km      = km_stand(B) − km_stand(A)
Segment.liter   = Σ liter aller Einträge nach A bis und mit B
Segment.kosten  = Σ betrag_chf derselben Einträge
Segment.verbrauch [l/100 km] = Segment.liter / Segment.km × 100
Segment.enddatum = datum(B)
```

Die erste Volltankung im Datenbestand eröffnet nur das erste Segment; ihr Beleg
zählt bei «Ausgaben nach Belegdatum», aber in keinem Segment.

Ein Segment ist **gültig**, wenn alle folgenden Bedingungen erfüllt sind:

- Anfang und Ende sind Volltankungen.
- Kein Eintrag im Segment ist `geschaetzt` (sonst Status «geschätzt»: wird
  angezeigt, aber nicht in Durchschnitte einbezogen; Umschalter in den
  Einstellungen «geschätzte Einträge mitrechnen»).
- Verbrauch liegt zwischen 3.0 und 15.0 l/100 km (sonst Status «unplausibel»,
  Hinweis: «vermutlich fehlt ein Beleg oder die Volltankungs-Markierung stimmt nicht»).
- Der Nutzer hat das Segment nicht manuell als «unvollständig» markiert.

Ein Segment mit Status `unvollständig` oder `unplausibel` liefert km und Kosten,
aber keinen Verbrauch; es wird in Diagrammen als Lücke gezeichnet (nicht
interpoliert) und in Tabellen mit Warnsymbol gezeigt.

Ein Eintrag mit `volltankung = false` (Teilbetankung) schliesst kein Segment ab.
Er wird in der Tabelle mit dem Vermerk «gehört zu Segment <Enddatum>» gezeigt.

### 5.2 Kennzahlen für einen Zeitraum [von, bis]

Zwei Zuordnungsprinzipien, beide in der Herleitung sichtbar:

**Belegbasiert** (Was habe ich in diesem Zeitraum bezahlt?)

```
Ausgaben         = Σ betrag_chf aller Einträge mit von ≤ datum ≤ bis
Getankte Liter   = Σ liter derselben Einträge
Ø Preis pro Liter = Ausgaben / Getankte Liter      (nur Einträge in CHF; Fremdwährung separat ausweisen)
Anzahl Belege, davon Teilbetankungen, davon geschätzt
```

**Segmentbasiert** (Was hat das Fahren in diesem Zeitraum gekostet?) – es zählen
alle Segmente, deren `enddatum` im Zeitraum liegt:

```
Gefahrene km       = Σ Segment.km
Verbrauch          = Σ Segment.liter (nur gültige) / Σ Segment.km (nur gültige) × 100
Kosten pro 100 km  = Σ Segment.kosten / Σ Segment.km × 100        (gültige + unvollständige Segmente)
Kosten pro km [Rp.] = Kosten pro 100 km
```

Die Anzeige nennt immer «n von m Segmenten gültig» und listet ausgeschlossene
Segmente mit Grund.

Vordefinierte Zeiträume: letzte 30 Tage, laufendes Quartal, laufendes Jahr,
letzte 12 Monate, benutzerdefiniert (von/bis). Vergleich zweier Zeiträume
nebeneinander (Verlauf-Ansicht).

### 5.3 Plausibilitätsprüfungen (beim Bestätigen, blockierend = ✗, Warnung = ⚠)

| Prüfung | Regel | Stufe |
|---|---|---|
| Betrag stimmt | \|liter × preis_pro_liter − betrag\| ≤ 0.05 (Rappenrundung) | ⚠, mit Schnellkorrektur «Liter aus Betrag ÷ Preis übernehmen» |
| km-Stand steigend | km_stand > km_stand des zeitlich vorangehenden Eintrags und < des nachfolgenden | ✗ |
| Tankvolumen | liter ≤ fahrzeug.tankvolumen_l (falls gesetzt) | ✗ |
| Preis plausibel | 1.00 ≤ preis_pro_liter ≤ 3.50 (CHF) | ⚠ |
| Datum plausibel | nicht in der Zukunft, nicht vor dem vorangehenden Eintrag | ⚠ |
| Verbrauch des entstehenden Segments | 3.0 – 15.0 l/100 km | ⚠, Text: «Beleg fehlt?» |
| Fehlendes Feld | Pflichtfelder datum, km_stand, liter, betrag | ✗ |

Fehlt genau einer der drei Werte Liter / Preis / Betrag, wird er berechnet und
mit Konfidenz `berechnet` vorgeschlagen.

### 5.4 Fremdwährung

Belege in EUR (oder anderer Währung) werden in Belegwährung gespeichert. Beim
Bestätigen wird ein Wechselkurs abgefragt (Vorschlag: zuletzt verwendeter Kurs;
kein automatischer Kursabruf in Version 1). Alle Auswertungen rechnen mit
`betrag_chf`; der Preis pro Liter in Auswertungen ist `betrag_chf / liter`.

### 5.5 Fehlender Beleg nachtragen

Der Nutzer kann einen Eintrag ohne Foto anlegen (`geschaetzt = true`), z.B. «ca.
40 l, ca. 75 CHF». Solche Einträge sind in allen Ansichten sichtbar markiert.

## 6. Erfassungsablauf (Screens)

1. **Start**: grosser Knopf «Tanken erfassen», darunter die letzten drei Einträge.
2. **Fotos**: zwei Aufnahmefelder «Beleg» und «Kilometerzähler», jeweils
   `<input type="file" accept="image/*" capture="environment">`. Eines der beiden
   darf leer bleiben. Fotos werden clientseitig verkleinert (längste Seite 1600 px,
   JPEG-Qualität 0.8, EXIF-Ausrichtung berücksichtigen) und hochgeladen; während
   der Erkennung Fortschrittsanzeige.
3. **Bestätigen**: Foto (zoombar) und Formular nebeneinander bzw. untereinander
   (Handy). Felder: Datum, Uhrzeit, km-Stand, Liter, Preis/Liter, Betrag,
   Währung (+ Kurs), Tankstelle, Kraftstoff, Volltankung (Standard: ja), Notiz.
   Unsichere Felder gelb hinterlegt, fehlende rot, berechnete mit Hinweis.
   Plausibilitätsprüfungen live. Knopf «Speichern» erst aktiv ohne ✗-Fehler.
   Jede Änderung durch den Nutzer setzt die Konfidenz des Feldes auf `manuell`.
4. **Gespeichert**: Kurzrückmeldung mit dem neu entstandenen Segment («645 km,
   6.50 l/100 km») oder dem Hinweis «Teilbetankung – wird dem nächsten Segment
   zugeschlagen».

Fehlerfälle: Erkennung schlägt fehl oder dauert länger als 20 s → Formular leer
öffnen, Foto bleibt beim Eintrag, Hinweis «Werte bitte eintippen».
Kein Netz → Hinweis; Offline-Warteschlange ist Version 2 (siehe Abschnitt 11).

## 7. Erkennung (Edge Function «extract»)

Eingabe: `{ "beleg_pfad": "<user>/<uuid>.jpg" | null, "tacho_pfad": ... | null, "hinweise": { "letzter_km_stand": 91845, "letzte_tankstellen": ["Migrol Dietikon", "Coop Pronto Birmensdorf"] } }`

Ausgabe (Schema, gegen das die Funktion validiert):

```json
{
  "datum":            { "wert": "2026-09-24", "konfidenz": "sicher" },
  "uhrzeit":          { "wert": "17:42",      "konfidenz": "unsicher" },
  "liter":            { "wert": 40.62,        "konfidenz": "sicher" },
  "preis_pro_liter":  { "wert": 1.799,        "konfidenz": "sicher" },
  "betrag":           { "wert": 73.08,        "konfidenz": "sicher" },
  "waehrung":         { "wert": "CHF",        "konfidenz": "sicher" },
  "tankstelle":       { "wert": "Coop Pronto Birmensdorf", "konfidenz": "unsicher" },
  "kraftstoff":       { "wert": "Bleifrei 95", "konfidenz": "sicher" },
  "km_stand":         { "wert": 92470,        "konfidenz": "sicher" },
  "hinweise":         ["Beleg unten abgeschnitten, MwSt-Zeile nicht lesbar"]
}
```

Jedes Feld kann `"wert": null, "konfidenz": "fehlt"` sein. Zahlen als Zahlen,
nicht als Strings; Datum ISO; km-Stand ganzzahlig (Zehntelkilometer ignorieren).

Prompt-Entwurf (System-Teil; wird nach dem Test mit echten Belegen nachgeschärft):

> Du liest Schweizer Tankbelege und Fotos von Kilometerzählern aus. Antworte
> ausschliesslich mit einem JSON-Objekt nach dem vorgegebenen Schema.
> Regeln: Gib nur Werte an, die im Bild stehen; rate nicht. Markiere ein Feld als
> «unsicher», wenn Ziffern schlecht lesbar sind oder mehrere Kandidaten in Frage
> kommen (z.B. Total inkl. Shop-Artikel vs. Kraftstoff-Betrag: nimm den
> Kraftstoff-Betrag und schreibe einen Hinweis). Betrag = bezahlter Kraftstoff-
> Betrag, nicht MwSt., nicht Zwischensumme. Liter mit zwei Dezimalen, Preis pro
> Liter mit drei Dezimalen, falls angegeben. Erkenne die Währung am Beleg (CHF,
> EUR). Beim Kilometerzähler: nimm den Gesamtkilometerstand (Odometer), nicht den
> Tageskilometerzähler (Trip) und nicht die Reichweite; ignoriere Nachkommastellen.
> Wenn ein Hinweis zum letzten bekannten km-Stand mitgegeben wird und der gelesene
> Wert kleiner ist oder mehr als 3000 km grösser, markiere «unsicher» und
> schreibe einen Hinweis. Tankstellenname: bevorzugt einer aus der Liste der
> bekannten Tankstellen, wenn er offensichtlich derselbe ist.

Modell: ein aktuelles Sonnet-Modell (Modell-ID in einer Konfigurationsdatei,
nicht im Code verstreut). Antwort mit JSON-Modus / Structured Output, falls im
SDK verfügbar, sonst Prompt + serverseitige Schema-Validierung mit einem
Wiederholungsversuch bei ungültigem JSON.

Die Funktion speichert nichts; sie gibt nur zurück. Die vollständige Antwort
landet nach dem Bestätigen in `roh_erkennung`, damit Fehlerkennungen später
ausgewertet werden können.

## 8. Ansichten

Alle Ansichten: Zeitraumwahl oben (siehe 5.2), Kennzahlen mit aufklappbarer
Herleitung, helles Design gemäss Mockups, funktionsfähig auf 390 px Breite.

### 8.1 Tankbuch (Mockup 1)

Sechs Kennzahlkacheln: km, Liter, Ausgaben, Verbrauch, Rp./km, CHF/100 km.
Herleitung Verbrauch als Bruch: Σ Liter (gültige Segmente) / Σ km (gültige
Segmente) × 100, mit Liste der ausgeschlossenen Segmente und Grund.
Tabelle aller Einträge im Zeitraum, neueste zuerst: Datum, km-Stand, Liter,
Preis, Betrag, Tankstelle, Voll, Segment (km · l/100 km), Status. Zeile
antippen → Eintrag bearbeiten (gleiches Formular wie Bestätigen, Foto sichtbar).
CSV-Export des Zeitraums.

### 8.2 Verlauf (Mockup 2)

Balken: Verbrauch pro Segment (x = Enddatum), Linie: gleitendes Mittel über die
letzten drei gültigen Segmente (setzt nach einer Lücke neu an), Lücken als
gestrichelte Platzhalter. Umschaltbar auf Preis pro Liter (pro Beleg) und
Ausgaben (pro Monat). Kacheln: Saisonvergleich (Nov–Mär vs. Mai–Sep, aus
Segmenten), Ausreisser (> 15 % über dem gleitenden Mittel) mit Notiz, Vergleich
zweier frei wählbarer Zeiträume. Notizfeld je Eintrag; Notizen erscheinen als
Markierung im Diagramm.

### 8.3 Preise (Mockup 3)

Punktdiagramm Preis pro Liter über die Zeit, Farbe = Tankstelle (max. drei
Farben: die zwei häufigsten Tankstellen und «Übrige»; Legende immer sichtbar),
gestrichelte Linie = Durchschnitt des Zeitraums. Tabelle je Tankstelle:
Betankungen, Liter, Ø Preis, Differenz zur günstigsten, Mehrkosten = Liter ×
Differenz. Kachel «Hättest du immer bei <günstigste> getankt: −X CHF».
Tankstellennamen werden beim Bestätigen normalisiert (Vorschlagsliste bekannter
Namen), Umbenennen/Zusammenführen in den Einstellungen.

### 8.4 Monatsbericht (Mockup 4)

Pro Monat eine druckbare Seite (A4, Browser-Druck als PDF): Kennzahlen km,
Ausgaben, Verbrauch, CHF/100 km mit Veränderung gegenüber Vormonat und
Vorjahresmonat; ein Absatz automatisch erzeugter Einordnung aus festen
Satzbausteinen (kein KI-Aufruf nötig; welcher Faktor die Veränderung treibt:
Fahrleistung, Preis oder Verbrauch); Balken CHF/100 km Jahresverlauf; Tabelle
Monat / Vormonat / Vorjahr; Hinweiskasten bei Datenlücken; Methodenzeile im Fuss.
Monatszuordnung: Segmente, die im Monat enden (segmentbasiert, siehe 5.2).
Kein E-Mail-Versand in Version 1.

## 9. Nichtfunktionale Anforderungen

- PWA: `manifest.webmanifest` (Name «Tankbuch», Icon, `display: standalone`),
  Service Worker cached nur die App-Hülle (kein Daten-Caching in Version 1).
- iOS-Besonderheiten: Safari löscht Website-Speicher nach 7 Tagen Nichtnutzung –
  deshalb keine Daten nur lokal halten; Login-Sitzung über Supabase-Refresh-Token.
  Kamera-Aufruf nur über `<input capture>`, keine getUserMedia-Vorschau nötig.
- Leistung: Erkennung < 10 s im Normalfall; Ansichten mit 500 Einträgen flüssig.
- Datenschutz: Fotos und Daten nur im eigenen Supabase-Projekt (Frankfurt) und,
  für die Erkennung, transient bei Anthropic. Kein Tracking, keine Drittanbieter-
  Skripte, keine Schriften von externen Servern ausser Google Fonts (optional,
  Systemschrift ist akzeptabel).
- Barrierefreiheit: echte Buttons/Inputs mit Labels, Tap-Ziele ≥ 44 px,
  Kontrast ≥ 4.5:1, Farben nie alleiniger Bedeutungsträger.
- Tests: Unit-Tests für die Segmentlogik (5.1), Kennzahlen (5.2) und
  Plausibilitätsprüfungen (5.3) sind Pflicht; die Beispieldaten aus Abschnitt 10
  dienen als Testfixture.

## 10. Testdaten (aus den Mockups; erwartete Ergebnisse)

Fahrzeug mit 45 l Tank. Einträge (Datum, km, l, CHF/l, CHF, Tankstelle, voll):

```
04.01.2026  84210  42.3  1.75  74.03  Migrol Dietikon           ja
22.01.2026  84788  44.1  1.83  80.70  Coop Pronto Birmensdorf   ja
09.02.2026  85351  43.0  1.86  79.98  Coop Pronto Birmensdorf   ja
27.02.2026  85930  41.8  1.82  76.08  Migrol Dietikon           ja
16.03.2026  86540  20.0  1.88  37.60  Tamoil Urdorf             nein
24.03.2026  86812  39.9  1.81  72.22  Migrol Dietikon           ja
14.04.2026  87420  40.5  1.85  74.93  Coop Pronto Birmensdorf   ja
29.05.2026  88690  43.6  1.78  77.61  Migrol Dietikon           ja   (Beleg dazwischen fehlt)
20.06.2026  89335  41.2  1.82  74.98  Coop Pronto Birmensdorf   ja
11.07.2026  89980  43.9  1.79  78.58  Migrol Dietikon           ja
18.07.2026  90560  46.5  1.95  90.68  Raststätte Gotthard       ja   (Notiz: Ferienfahrt, Dachbox)
09.08.2026  91200  41.0  1.88  77.08  Coop Pronto Birmensdorf   ja
02.09.2026  91845  41.9  1.76  73.74  Migrol Dietikon           ja
24.09.2026  92470  40.6  1.80  73.08  Coop Pronto Birmensdorf   ja
```

Erwartet für 01.01.–30.09.2026: 12 Segmente, davon 11 gültig; Segment mit Ende
29.05. unplausibel (1'270 km, 43.6 l → 3.4 l/100 km). Segment mit Ende 24.03.
umfasst die Teilbetankung: 882 km, 59.9 l → 6.79 l/100 km. Verbrauch gesamt
484.4 l / 6'990 km = 6.93 l/100 km. Ausgaben belegbasiert 1'041.29 CHF,
570.3 l, Ø 1.826 CHF/l. Gefahrene km segmentbasiert 8'260.
Preise: Migrol 6 Belege, 253.4 l, Ø 1.785; Coop 6 Belege, 250.4 l, Ø 1.840;
Mehrkosten gegenüber Migrol total ≈ 23.40 CHF.
September 2026 (segmentbasiert): 1'270 km, 82.5 l, 146.82 CHF, 6.57 l/100 km,
11.56 CHF/100 km; August: 640 km, 41.0 l, 77.08 CHF, 6.41 l/100 km, 12.04 CHF/100 km.

## 11. Umsetzungsreihenfolge

1. Repo-Grundgerüst, Supabase-Schema (Abschnitt 4), Auth, Storage-Policies,
   Fahrzeug anlegen. Deployment auf GitHub Pages läuft.
2. Fachlogik als reines Modul mit Unit-Tests (Segmente, Kennzahlen, Prüfungen)
   gegen die Testdaten aus Abschnitt 10 – bevor eine Ansicht gebaut wird.
3. Erfassung: Fotos → Upload → Edge Function → Bestätigen → Speichern.
   Manuelles Anlegen ohne Foto.
4. Tankbuch-Ansicht.
5. Verlauf, Preise, Monatsbericht.
6. Test mit echten Belegen des Nutzers; Prompt (Abschnitt 7) nachschärfen;
   Tankstellen-Normalisierung.

Version 2 (nicht jetzt): Offline-Warteschlange für Fotos, automatischer
Wechselkurs, mehrere Fahrzeuge in der Oberfläche, Verpackung für den App Store
(Capacitor), E-Mail-Versand des Monatsberichts.

## 12. Offene Punkte (beim Nutzer klären, wenn relevant)

- Tankvolumen des Fahrzeugs (für die Plausibilitätsprüfung).
- Ob Uhrzeit vom Beleg erfasst werden soll (für Zuordnung Beleg ↔ Tacho-Foto
  reicht die Aufnahmereihenfolge in der App).
- Kraftstoffsorte auswerten (z.B. 95 vs. 98) – vorerst nur speichern.

## 13. Startprompt für Claude Code

> Lies SPEC.md vollständig. Setze Schritt 1 und 2 der Umsetzungsreihenfolge um:
> Repo-Grundgerüst (Vite + TypeScript, PWA-Manifest, GitHub-Pages-Workflow),
> Supabase-Migrationen gemäss Abschnitt 4, und das Fachlogik-Modul aus Abschnitt 5
> mit Unit-Tests gegen die Testdaten in Abschnitt 10. Die Tests müssen die dort
> genannten erwarteten Werte reproduzieren. Baue noch keine Oberfläche. Frage
> nach, wenn eine Regel in Abschnitt 5 mehrdeutig ist, statt sie zu erraten.
