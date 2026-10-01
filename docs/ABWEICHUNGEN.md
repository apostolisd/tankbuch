# Abweichungen von SPEC.md, SPEC-Fehler und bekannte Restpunkte

Stand: 30.09.2026 (nach Umsetzung von docs/REVIEW.md).

## 1. Bewusste Abweichung: Untergrenze Verbrauch 3.5 statt 3.0 l/100 km

- SPEC 5.1 und 5.3 verlangen die Grenzen 3.0 bis 15.0 l/100 km. SPEC 10 verlangt zugleich, dass das Segment mit Ende 29.05.
  (1'270 km, 43.6 l = 3.43 l/100 km) «unplausibel» ist. Beides zusammen geht nicht: Bei 3.0 wäre dieses Segment gültig
  (12 von 12 Segmenten, SPEC 10 nennt 11 von 12).
- **Entscheid des Koordinators: Die Verbrauchsgrenze bleibt 3.5 bis 15.0 l/100 km.** Damit reproduziert die App die
  Erwartungswerte aus SPEC 10 (11 von 12 gültig, Verbrauch gesamt 6.93 l/100 km).
- Umsetzung: zwei Konstanten `VERBRAUCH_MIN` / `VERBRAUCH_MAX` in `src/core/segments.ts`. Alle Anzeigetexte (Segmentgrund,
  Prüfwarnung, Erklärungstexte, Einstellungen) bauen die Grenzen aus diesen Konstanten auf (`verbrauchsGrenzenText()`); keine
  hartkodierten Zahlen mehr. Zurück auf 3.0: nur `VERBRAUCH_MIN` ändern (das 29.05.-Segment ist dann gültig, Tests zu SPEC 10
  müssen angepasst werden).
- Fachliche Einschränkung (aus dem Review): Ein sehr sparsames Fahrzeug mit echten Verbräuchen unter 3.5 l/100 km würde als
  «unplausibel» ausgeschlossen. Die App weist in den Einstellungen auf die Grenzen hin. Eine relative Regel (Abweichung vom
  Median) wurde bewusst nicht eingeführt.

## 2. Fehler in SPEC.md (Code rechnet richtig)

| Stelle | SPEC | richtig | Begründung |
|---|---|---|---|
| SPEC 10, September 2026 | 6.57 l/100 km | **6.50** l/100 km | 82.5 l / 1'270 km × 100 = 6.496; passt auch zu «645 km, 6.50 l/100 km» in SPEC 6 |
| SPEC 10, Mehrkosten gegenüber Migrol | ≈ 23.40 CHF | **23.43** CHF | Summe der je Tankstelle auf Rappen gerundeten Mehrkosten (exakt 23.44); «≈» ist damit erfüllt |
| SPEC 10, Eintrag 18.07.2026 | 46.5 l bei Tankvolumen 45 l | Widerspruch in den Testdaten | Die Prüfung «Liter ≤ Tankvolumen» (SPEC 5.3, blockierend) würde diesen Eintrag beim Erfassen ablehnen. Die Testdaten werden unverändert als Fixture verwendet (die Prüfung greift nur beim Erfassen/Bearbeiten, nicht bei der Auswertung bestehender Einträge). Wer den Eintrag in der Demo bearbeitet, muss das Tankvolumen in den Einstellungen anpassen. |

## 3. Weitere Entscheide in der Umsetzung

- **Ø Preis pro Liter** einheitlich: Σ betrag_chf / Σ Liter über alle Belege (Fremdwährung in CHF umgerechnet, SPEC 5.4).
  Gilt im Tankbuch, im Verlauf und in der Preisanalyse. Fremdwährung ist gekennzeichnet. SPEC 5.2 nennt «nur Einträge in CHF; Fremdwährung
  separat ausweisen»; das wurde zugunsten einer einzigen, nachrechenbaren Definition geändert (Fremdwährung bleibt separat ausgewiesen).
- **Geschätzte Belege in der Preisanalyse** erscheinen im Diagramm (hohl markiert), fliessen aber nicht in Durchschnitt, Tabelle,
  «günstigste Tankstelle» und Ersparnis ein (der Preis ist frei geschätzt).
- **Preis pro Liter ist keine Pflicht** (SPEC 5.3: Pflicht sind Datum, km, Liter, Betrag). Er wird beim Tippen bzw. beim Speichern aus
  Betrag ÷ Liter berechnet und als «berechnet» gekennzeichnet. Ein vom Nutzer getippter Wert wird nie überschrieben.
- **Markierung «unvollständig»** hängt am Segment (Schlüssel `startId>endId`), nicht nur an der End-ID. Alte Markierungen (nur End-ID)
  werden weiter erkannt. Markierungen, die zu keinem Segment mehr passen, werden im Tankbuch und in den Einstellungen gemeldet und
  lassen sich dort entfernen.
- **Zeitraum-Presets** werden bei jedem Zugriff gegen das heutige Datum neu aufgelöst (auch nach Mitternacht und beim Zurückkehren in die App).
- **Monatsbericht:** «Ausgaben» heisst dort «Ausgaben (Segmentkosten)» (Kosten der im Monat endenden Segmente), im Tankbuch dagegen belegbasiert.
  Endet im Monat kein Segment, zeigt der Bericht «keine Kennzahlen» und weist die Belegsumme separat aus.
- **Missbrauchsschutz (W9):** Edge Function mit optionaler Allowlist (Secret `ALLOWED_EMAILS`, leer = alle angemeldeten Nutzer),
  6 Erkennungen pro Minute und Nutzer (im Speicher der Funktionsinstanz, deshalb bei mehreren Instanzen nur näherungsweise),
  Bildgrösse höchstens 5 MB, nur JPEG/PNG (Dateikopf geprüft). Bucket-Limits in Migration `0004_storage_limits.sql`.
  Sign-ups in Supabase nach der ersten Anmeldung zu deaktivieren ist in `docs/SETUP.md` als Pflichtschritt formuliert.

- **Ein Fotofeld statt zwei (Nutzerentscheid 30.09.2026, SPEC 6.2 / 7):** Erfassen hat ein Feld «Fotos aufnehmen» für 1 bis 2 Bilder
  («Foto aufnehmen» mit Kamera, danach «Weiteres Foto aufnehmen»; «Aus Fotos wählen» ohne Kamera, Mehrfachauswahl). Die Erkennung
  bestimmt je Bild, ob es Beleg oder Kilometerzähler ist (`bilder` im Request, `zuordnung` in der Antwort, siehe API.md).
  Bestätigen zeigt die Zuordnung über den Fotos mit «Zuordnung tauschen»; bei unbekannter/unsicherer Zuordnung oder Fehler/Timeout
  zusätzlich je Foto die Auswahl «Beleg / Kilometerzähler» (Vorschlag: Reihenfolge der Aufnahme). Datenmodell unverändert.

- **Datum/Uhrzeit aus dem Aufnahmedatum der Fotos (Nutzerwunsch 01.10.2026, Ergänzung zu SPEC 6.2 / 7):** Beim Hinzufügen wird vor dem
  Verkleinern das EXIF-Aufnahmedatum gelesen (eigener Parser `src/ui/capture/exif.ts`, nur JPEG, keine GPS-Daten). Liefert die Erkennung
  kein Datum (auch bei Fehler/Timeout), wird es aus dem Beleg-Foto (sonst dem anderen Foto) übernommen, gelb «unsicher» mit Hinweis
  «aus Aufnahmedatum des Fotos»; Uhrzeit analog («aus Aufnahmezeit des Fotos»), aber nur, wenn das Datum zum Aufnahmedatum passt.
  Nicht blockierende Warnung, wenn Belegdatum und Aufnahmedatum eines Fotos mehr als 2 Tage auseinanderliegen. Die EXIF-Werte selbst
  werden nicht gespeichert (nur das Formularergebnis). Die Warnung gilt auch für ein von Hand eingetipptes Datum («Beleg zeigt …»).

## 4. Bekannte Restpunkte (bewusst nicht behoben)

- **Verwaiste Fotos:** Fotos werden beim Verwerfen, bei «Anderes Foto» und beim Entfernen wieder aus dem Bucket gelöscht. Wird die App
  nach dem Hochladen, aber vor dem Speichern geschlossen, bleibt die Datei im Bucket (nur für den Nutzer sichtbar, in Supabase
  manuell löschbar, siehe SETUP.md). Eine periodische Bereinigung wäre eine serverseitige Funktion und ist nicht Teil von Version 1.
- **Service Worker:** Nicht gehashte Dateien (Manifest, Icons) werden netzwerk-zuerst geladen, gehashte Build-Dateien cache-zuerst; alte
  gehashte Dateien werden erst beim Erhöhen von `VERSION` entfernt.
- **Verlauf, Vergleich A/B:** Die Startzeiträume werden einmalig aus dem damals gewählten Zeitraum gebildet und folgen späteren Änderungen
  der Zeitraumwahl nicht (kein Fehler, nur überraschend).
- **Repository-Hygiene:** `src/lib/demo.ts` importiert `tests/fixture.ts`. Im Produktionsbuild nachweislich nicht enthalten
  (Demo-Code wird nur mit `VITE_DEMO=1` gebündelt; Prüfung beim Build siehe Abschlussbericht).
- **EXIF auf iOS/Android nicht auf Geräten getestet:** iOS Safari liefert bei «Foto aufnehmen» in der Regel ein JPEG mit EXIF, bei
  «Aus Fotos wählen» je nach Version/Einstellung ein umgewandeltes JPEG ohne EXIF oder HEIC; dann bleibt das Datum leer (wie bisher).
  Geprüft nur mit synthetischen JPEGs (vitest, Browser).
- **Mengenbegrenzung der Edge Function** ist pro Funktionsinstanz; ein hartes globales Limit bräuchte eine Tabelle in der Datenbank.
