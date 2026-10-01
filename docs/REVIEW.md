# Unabhängige Prüfung Tankbuch (Stand Code-Snapshot 30.09.2026 ca. 22:20)

Geprüft gegen SPEC.md und API.md. Fachzahlen aus SPEC 10 mit eigenem Skript nachgerechnet (nicht mit den Tests).
`tsc --noEmit` ohne Fehler, `vitest run` 146/146 grün. Produktions-Build (ohne VITE_DEMO) enthält keinen Demo-Code
und keine Schlüssel; Demo-Build wurde in einem Temp-Ordner gebaut und im Browser geprüft (Befunde K1/K2 sind dort
reproduziert). Die Dateien wurden während der Prüfung teils noch geändert; Zeilennummern beziehen sich auf den Snapshot.

## Nachrechnung SPEC 10 (eigenes Skript)

| Grösse | SPEC | eigene Rechnung | Code |
|---|---|---|---|
| Segmente | 12 | 12 | 12 |
| gültig | 11 | 11 mit Untergrenze 3.5; 12 mit Untergrenze 3.0 | 11 |
| Segment 29.05. | 1'270 km, 43.6 l, «3.4» | 3.433 l/100 km | unplausibel (wegen 3.5) |
| Segment 24.03. (mit Teilbetankung) | 882 km, 59.9 l, 6.79 | 6.791 | ok |
| Verbrauch gesamt | 484.4 l / 6'990 km = 6.93 | 6.9299 | ok |
| Ausgaben / Liter / Ø | 1'041.29 / 570.3 / 1.826 | identisch | ok |
| km segmentbasiert | 8'260 | 8'260 | ok |
| Preise Migrol / Coop | 6 Belege, 253.4 l, 1.785 / 250.4 l, 1.840 | 1.7848 / 1.8401 | ok |
| Mehrkosten ggü. Migrol | ≈ 23.40 | 23.44 (Code 23.43 wegen Rundung je Zeile) | ok (≈) |
| September 2026 | 1'270 km, 82.5 l, 146.82, **6.57**, 11.56 | 6.496 (= 6.50), 11.561 | 6.50 |
| August 2026 | 640 km, 41.0 l, 77.08, 6.41, 12.04 | identisch | ok |

Die SPEC enthält zwei eigene Fehler: (a) «6.57 l/100 km» im September ist falsch (82.5 / 1270 × 100 = 6.496; passt auch
zu «645 km, 6.50 l/100 km» in SPEC 6); der Code rechnet richtig. (b) Die Untergrenze 3.0 (SPEC 5.1/5.3) widerspricht der
Erwartung in SPEC 10 (29.05. «unplausibel» bei 3.43 l/100 km).

### Beurteilung der Abweichung Untergrenze 3.5 statt 3.0

Vertretbar als bewusste, dokumentierte Notlösung (Code-Kommentar `segments.ts:13-17`, eine Konstante), aber fachlich
eine Anpassung an den Testfall, keine Begründung aus dem Fahrzeug: Ein sparsames Hybrid-/Dieselfahrzeug mit echten 3.4
l/100 km würde künftig fälschlich als «unplausibel» aus Verbrauch und Kosten pro 100 km ausgeschlossen. Die Erkennung
des 29.05.-Segments beruht eigentlich auf dem Ausreisser-Charakter (43.6 l in 1'270 km bei sonst ~6.9). Besser wäre eine
zusätzliche relative Regel (z.B. Abweichung > 40 % vom Median der übrigen Segmente oder km > Tankvolumen-Reichweite) und
die Untergrenze bei 3.0 zu belassen; das ändert die Erwartung in SPEC 10 aber nur, wenn man sie mit aufnimmt. Der
Auftraggeber sollte die Wahl bewusst treffen. Konsistenz der UI-Texte: nicht vollständig, siehe W7.

---

## KRITISCH

### K1. Monatsbericht stürzt ab: weisse Seite (ganze App tot bis Reload)
- `src/ui/views/Bericht.tsx:147` übergibt `b.jahresverlauf` an `MonatsBalken`; `core/bericht.ts:184-187` liefert
  `{monat, kostenPro100km}[]`, `src/ui/charts/MonatsBalken.tsx:32,63` erwartet `(number|null)[]`.
- Szenario (im Browser reproduziert, `#/bericht/2026/9`): Jeder Monat mit Daten wirft
  `TypeError: h.wert.toFixed is not a function`; Preact rendert nichts mehr, auch die Navigation verschwindet.
  Der Monatsbericht (SPEC 8.4) ist damit nicht nutzbar.
- Korrektur: `werte={b.jahresverlauf.map((x) => x.kostenPro100km)}` (oder MonatsBalken auf das Objektformat umstellen);
  zusätzlich ein Render-Test bzw. einen Error-Boundary-Fallback um die Views legen, damit ein Fehler nicht die ganze App leert.

### K2. Bestätigen-Formular verliert bei jedem Tastendruck den Fokus
- `src/ui/capture/Bestaetigen.tsx:142`: Die Komponente `F` wird innerhalb des Render-Körpers definiert. Bei jedem Render
  ist es ein neuer Komponententyp, Preact hängt den ganzen Teilbaum ab und neu ein.
- Szenario (reproduziert: Feld «Liter» fokussiert, «4» eingegeben): das Input-Element wird ersetzt
  (`isConnected === false`, Fokus weg). Auf dem iPhone schliesst sich bei jeder Ziffer die Tastatur; Werte lassen sich nur
  einzeln antippen. Betrifft alle Felder (Datum, km, Liter, Preis, Betrag, Währung, Tankstelle, Kraftstoff, Kurs), also
  den zentralen Erfassungsablauf, insbesondere «Ohne Foto» und jede Korrektur.
- Korrektur: `F` ausserhalb von `Bestaetigen` definieren (Props: `e`, Kinder) oder statt Komponente eine Funktion aufrufen
  (`{feldMitStatus(...)}`), sodass der Komponententyp stabil bleibt.

---

## WICHTIG

### W1. «Ausreisser»-Anzeige widerspricht sich (Verlauf)
- `src/core/verlauf.ts:378-383` bewertet den Ausreisser gegen das Mittel der bis zu drei VORANGEHENDEN Segmente
  (18.07.: Mittel 6.60, 8.02 / 6.60 = +21 %). `src/ui/views/Verlauf.tsx:235` zeigt aber
  `(wert / r.gleitend − 1) × 100` mit dem gleitenden Mittel INKLUSIVE des Segments selbst (7.07).
- Szenario (im Browser gesehen): Kachel «mehr als 15 % über dem gleitenden Mittel», Eintrag «18.07.2026: 8.02 l/100 km
  (13 % über Mittel 7.07)». 13 % ist nicht > 15 %; der Nutzer hält die Markierung für einen Fehler.
- Korrektur: in `verbrauchsReihe` zusätzlich `referenz` (Mittel der Vorgänger) zurückgeben und dieses anzeigen
  («+21 % über Mittel der 2 Vorgänger 6.60»). Tooltip im Diagramm (`BalkenLinie`) nennt nur das einschliessende Mittel.

### W2. Notizen erscheinen nie im Verlauf (SPEC 8.2: «Ausreisser mit Notiz», Markierung im Diagramm)
- `src/ui/views/Verlauf.tsx:108` ruft `verbrauchsReihe(segmente, einst)` ohne den dritten Parameter `eintraege`;
  `verlauf.ts:363` setzt `notiz` nur damit.
- Szenario (Demo-Daten, Notiz «Ferienfahrt, Dachbox» am 18.07.): Ausreisser-Kachel zeigt «Keine Notiz erfasst.»; im
  Diagramm keine Notizmarkierung im Verbrauchsmodus.
- Korrektur: `verbrauchsReihe(segmente, einst, eintraege)` (deps von `useMemo` ergänzen).

### W3. Herleitung «Ø Preis pro Liter» im Tankbuch passt bei Fremdwährung nicht zum angezeigten Wert
- `src/ui/views/Tankbuch.tsx:218-224` zeigt den Bruch `bel.ausgaben / bel.liter` (alle Belege inkl. umgerechneter
  EUR-Belege), das Resultat ist aber `bel.preisProLiter` = nur CHF-Belege (`core/kennzahlen.ts:43`).
- Szenario: 10 CHF-Belege + 1 EUR-Beleg im Zeitraum: Zähler/Nenner ergeben z.B. 1.812, daneben steht «= 1.826 CHF/l».
  Nachrechnen des Nutzers geht nicht auf.
- Korrektur: Bruch mit CHF-Belegen allein darstellen (Summen aus `belegKennzahlen` mitliefern) oder `preisProLiter`
  über alle Belege rechnen (SPEC 5.4: «Preis pro Liter in Auswertungen = betrag_chf / liter»). Dann auch in
  `Verlauf` («Ø Preis pro Liter (belegbasiert)») und `Preise` einheitlich: heute rechnet Preise alle Belege (umgerechnet),
  Tankbuch/Verlauf nur CHF-Belege; drei verschiedene Definitionen.

### W4. Preise-Ansicht: Text zur Fremdwährung ist falsch, geschätzte Belege ungekennzeichnet
- `src/ui/views/Preise.tsx:164` behauptet «Fremdwährungsbelege sind im Diagramm und in der Tabelle oben nicht enthalten».
  `core/preise.ts:275-296` schliesst sie nicht aus (Preis = betrag_chf / liter). Dasselbe bei
  `Preise.tsx:~71` «keine Betankungen mit Preis in CHF».
- Geschätzte Einträge (SPEC 5.5: «in allen Ansichten sichtbar markiert») fliessen in Punktdiagramm, Ø-Preis, Tabelle,
  «günstigste Tankstelle» und «−X CHF» ein, ohne Markierung (nur im Verlauf-Tooltip markiert). Der Preis eines Schätzeintrags
  («ca. 75 CHF / 40 l») ist frei erfunden und kann eine Tankstelle fälschlich zur günstigsten machen.
- Korrektur: Text korrigieren (oder Fremdwährung wirklich ausschliessen); geschätzte Belege im Diagramm markieren
  (anderes Symbol + Legende) oder aus Durchschnitt/Mehrkosten ausnehmen bzw. Hinweis «n geschätzte Belege enthalten».

### W5. Monatsbericht: Monat ohne endendes Segment zeigt «0 km / 0.00 CHF» statt «keine Daten»
- `src/ui/views/Bericht.tsx:84`: `leer` prüft `g(b,'km') == null`, aber `core/bericht.ts:211-212` liefert `km: 0`,
  `ausgaben: 0` (nie null). `leer` ist damit nie wahr.
- Szenario: Monat mit nur einem Beleg, der eine Teilbetankung ist oder die allererste Volltankung (z.B. Dezember mit
  einer Teilbetankung) oder manuell eingegebene Adresse `#/bericht/2030/5`: Bericht zeigt «Gefahrene km 0», «Ausgaben
  0.00 CHF», obwohl Belege über z.B. 74.03 CHF existieren (Liste `monateMitDaten` führt solche Monate sogar auf).
  Irreführend (Ausgaben 0 statt unbekannt).
- Korrektur: `leer = b.segmenteGesamt === 0`; in diesem Fall Hinweis «Kein Segment endet im Monat» und die Belegsumme
  separat ausweisen.
- Verwandt: «Ausgaben» heisst im Tankbuch belegbasiert, im Monatsbericht Segmentkosten (SPEC-konform, aber gleicher Name
  für verschiedene Zahlen; im Bericht «Ausgaben (Segmentkosten)» benennen).

### W6. Zeitraum «Jahr/Quartal/30 Tage» wird beim App-Start eingefroren (PWA bleibt tagelang offen)
- `src/lib/store.ts:85-86` berechnet den Preset-Zeitraum einmal beim Modulstart (`bis = heute`). iOS hält installierte
  PWAs im Hintergrund; nach Mitternacht/Tagen bleibt `bis` auf dem alten Datum.
- Szenario: App am 29.09. geöffnet, am 30.09. tanken und speichern (Datum 30.09.): Tankbuch/Verlauf/Preise («Jahr» aktiv)
  zeigen den neuen Eintrag und das neue Segment nicht; Kennzahlen bleiben alt, ohne Hinweis.
- Korrektur: Preset speichern und `zeitraumVonPreset(preset, heuteIso())` bei jedem Render berechnen (nur
  «benutzerdefiniert» fest lassen), oder bei `visibilitychange` neu setzen.

### W7. Untergrenze-Text/Konstanten uneinheitlich (3.0 vs. 3.5)
- `src/ui/views/segmentText.ts:14` (`STATUS_ERKLAERUNG.unplausibel`: «3.0 bis 15.0») und `src/core/types.ts:38` nennen 3.0;
  der Code rechnet mit 3.5. Der Grund-Text in `segments.ts` und die Warnung in `pruefungen.ts:173` verwenden
  die Konstanten und sind korrekt. `STATUS_ERKLAERUNG` wird nur als Rückfall genutzt (`segmentGrund`, wenn `grund` leer),
  ist heute also selten sichtbar, bleibt aber falsch; Einstellungen/Tankbuch zeigen `s.grund` (3.5).
- Korrektur: Text aus `VERBRAUCH_MIN/MAX` aufbauen (Import aus `core/segments`), Kommentar in `types.ts` anpassen,
  Nutzer in den Einstellungen/im Methodentext über die Grenzen informieren.

### W8. Herleitungstexte «Kosten pro km / 100 km» stimmen nicht in allen Fällen (kostenBasis-Heuristik)
- `src/ui/views/herleitung.ts:323-337` rät die Segmentmenge, indem es vier Kandidatenmengen gegen das Ergebnis prüft,
  statt dieselbe Regel wie die Fachlogik zu nutzen (`zaehltFuerKosten` ist in `core/kennzahlen.ts:68` bereits exportiert).
  Rechenwert und Anzeige stimmen im Normalfall überein (mit SPEC-10-Daten geprüft: 6'990 km / 889.6 CHF), aber:
  (i) bei zufälligem Gleichstand (±0.005) einer falschen Kandidatenmenge (z.B. Einstellung «geschätzte mitrechnen» an)
  wird Σ Kosten/Σ km der falschen Menge gezeigt; (ii) findet sich keine Menge, entfällt der Bruch ohne Hinweis.
- Texte `Tankbuch.tsx:257` («ohne ausgeschlossene Schätzungen») und `:275` («gültige und unvollständige Segmente») sind
  bei aktivierter Einstellung «geschätzte mitrechnen» falsch, und nennen nie, dass unplausible Segmente (im Beispiel
  1'270 km / 77.61 CHF) bei den Kosten fehlen, obwohl sie in «Gefahrene km» enthalten sind. Der Nutzer sieht Σ km = 6'990
  neben 8'260 km ohne Erklärung.
- Korrektur: `kostenBasis` aus `segmenteImZeitraum(...).filter(s => zaehltFuerKosten(s, einst))` berechnen und
  die ausgeschlossenen Segmente mit Grund auch in diesen beiden Herleitungen auflisten (SPEC 5.2: «listet ausgeschlossene
  Segmente mit Grund»).

### W9. Offene Registrierung + API-Schlüssel: Kostenrisiko
- `src/lib/data.ts:303` (`shouldCreateUser: true`); Supabase erlaubt Sign-ups standardmässig. `docs/SETUP.md` Schritt 3.4
  empfiehlt nur, sie nachträglich auszuschalten. Die Edge Function (`extract/index.ts:232-242`) prüft nur «angemeldet»,
  nicht «erlaubter Nutzer», und hat kein Limit.
- Szenario: Vergisst der Nutzer den Schalter (oder Domain wird bekannt), kann sich jeder per Magic Link registrieren und
  unbegrenzt Bilder auf Kosten des Anthropic-Kontos auswerten lassen.
- Korrektur: Edge Function mit Secret `ERLAUBTE_EMAILS` / `ERLAUBTE_USER_IDS` absichern (403 sonst) und einfache
  Mengenbegrenzung (z.B. max. 30 Aufrufe/Stunde pro Nutzer); SETUP.md: Schalter als Pflichtschritt formulieren.

### W10. Manuelle Eingabe: Preis pro Liter ist Pflicht und wird nicht berechnet (SPEC 5.3/5.5)
- `src/ui/capture/logik.ts:291-293` blockiert das Speichern ohne Preis. `ergaenzeFehlendenWert` wird nur auf das
  Erkennungsergebnis angewendet (`logik.ts:131`), nicht beim Eintippen oder bei «Ohne Foto».
- Szenario: «ca. 40 l, ca. 75 CHF» ohne Foto (SPEC 5.5): Speichern bleibt gesperrt, bis der Nutzer zusätzlich den Preis
  von Hand rechnet; SPEC verlangt nur Datum, km, Liter, Betrag als Pflicht und Berechnung des dritten Werts mit
  Konfidenz «berechnet».
- Korrektur: beim Verlassen eines der drei Felder `ergaenzeFehlendenWert` anwenden (nur wenn genau einer fehlt), sonst
  Preis beim Speichern aus Betrag/Liter ableiten und als «berechnet» kennzeichnen.

---

## KLEIN

- **Segment-Markierung «unvollständig» hängt an `endId`** (`segments.ts:68`, `Einstellungen.tsx:284`). Fügt man nachträglich
  einen Eintrag zwischen A und B ein, gilt die Markierung für das neue, kürzere Segment (endet nun am neuen Eintrag) oder
  geht beim Löschen verloren (Einstellung verweist auf gelöschte ID), ohne Hinweis. Korrektur: beim Laden verwaiste IDs
  entfernen/melden; nach Einfügen Hinweis.
- **Kein Retry-Schutz gegen doppeltes Speichern bei Netzabbruch:** Schutz gegen Doppeltippen ist vorhanden
  (`state.speichert`, `erfassung.ts:279`; nach dem Speichern sperrt auch die km-Prüfung einen identischen Eintrag). Bricht
  aber die Antwort des Inserts ab (Timeout), obwohl die Zeile geschrieben wurde, führt «Erneut speichern» zu
  einem Fehler «km-Stand muss grösser sein» erst nach Neuladen; vorher (Liste ohne neuen Eintrag) entsteht ein Doppel.
  Korrektur: Client-generierte UUID als `id` beim Insert (upsert) verwenden.
- **Verwaiste Fotos:** Nach erfolgreichem Upload, aber Abbruch/«Anderes Foto»/Verwerfen bleiben Dateien im Bucket
  (`erfassung.ts:175`, `zuruecksetzen`). Datenschutz-relevant, weil ohne Eintrag unauffindbar. Korrektur: beim Verwerfen
  `storage.remove` für nicht gespeicherte Pfade oder periodische Bereinigung.
- **`loescheTankvorgang`** (`data.ts:141-156`): Zeile ist gelöscht, schlägt danach das Löschen der Fotos fehl, meldet die UI
  «Löschen fehlgeschlagen», obwohl der Eintrag weg ist; Wiederholen endet in «nicht gefunden».
- **Service Worker** (`public/sw.js`): (a) Navigationsantworten werden ohne `res.ok`-Prüfung in den Cache geschrieben
  (eine 404/5xx-Seite überschreibt `index.html`, Offline-Start zeigt dann diese Seite); (b) `VERSION` konstant, Manifest
  und Icons (nicht gehasht, Cache-first) werden nie aktualisiert, alte gehashte Assets werden nie entfernt. Positiv:
  Cross-Origin (Supabase) und Nicht-GET werden nie angefasst, keine Daten im Cache.
- **Bucket ohne Serverlimits** (`0002_storage.sql`): kein `file_size_limit`/`allowed_mime_types`; das Verkleinern ist nur
  clientseitig. Vorschlag: `file_size_limit = 5242880`, `allowed_mime_types = {image/jpeg}` (Edge Function lehnt >5 MB ohnehin ab).
- **Währungsfeld** (`Bestaetigen.tsx`, `maxLength=3`): ein zweistelliger Code («EU») ist speicherbar; `zusatzPruefungen`
  prüft nicht auf drei Buchstaben. `wechselkurs` wird in der DB auf 4 Stellen gerundet (`numeric(8,4)`), die Anzeige «Betrag in
  CHF» rechnet mit dem ungerundeten Wert (Differenz bis 1 Rappen möglich).
- **`holeTankvorgaenge` `limit(5000)`** (`data.ts:108`): Supabase/PostgREST deckelt standardmässig bei 1'000 Zeilen
  (`max-rows`); bei >1'000 Einträgen fehlen ältere stumm (Segmente falsch). Bei 500 Einträgen (SPEC) unkritisch.
  Korrektur: nach `range()` paginieren.
- **Alias-Normalisierung nur bei Anzeige** (`Preise.tsx:84-87`), nicht beim Bestätigen (SPEC 8.3): Erkennung liefert
  «Migrol Dietikon»-Variante, Alias wird nur im Datalist vorgeschlagen, nicht angewendet; Ketten-Alias (a→b, b→c) werden nicht aufgelöst.
- **Magic-Link-Fehler unsichtbar:** Kommt die Rückleitung als `#error=...&error_code=otp_expired`, zeigt die App
  nur die Anmeldemaske ohne Meldung (`router.ts:38` verwirft Nicht-Pfad-Hashes). Redirect selbst ist korrekt
  (`location.origin + pathname`, Redirect-Liste in SETUP.md).
- **Monatsbericht-Text:** Der Satz «Die Veränderung der Ausgaben geht hauptsächlich auf … zurück» (`core/bericht.ts:177-183`)
  nennt die Referenz nicht; der Treiber wird gegen den Vorjahresmonat ermittelt, wenn der Vormonat fehlt, steht aber nach dem
  Vormonats-Satz. Treiber beruht auf gültigen Segmenten, «Ausgaben» auf allen. Die Herleitungen im Bericht (`Bericht.tsx:196-213`)
  zeigen nur Formeln, keine eingesetzten Zahlen, und der Fuss nennt «gültige und unvollständige», auch bei
  aktivierter Einstellung «geschätzte mitrechnen».
- **«n von m Segmenten gültig»** zählt bei aktivierter Einstellung auch «geschätzte» Segmente als gültig
  (`kennzahlen.ts`, `zaehltImDurchschnitt`); Kennzeichnung im Tankbuch nur pro Zeile.
- **Verlauf Vergleich A/B** (`Verlauf.tsx:38-39`): Initialzeiträume werden einmalig aus dem damals gewählten Zeitraum
  gebildet und folgen späteren Änderungen der Zeitraumwahl nicht (kein Fehler, aber überraschend).
- **Repository-Hygiene:** `src/lib/demo.ts` importiert `../../tests/fixture` (Produktivcode hängt von Testdaten ab). Im
  Produktionsbuild nachweislich nicht enthalten (geprüft), aber fragil, falls `VITE_DEMO` versehentlich im Workflow gesetzt wird.

---

## Geprüft und in Ordnung (Belege)

- **Fachlogik:** Segmentbildung (Voll-zu-Voll, Teilbetankungen, unsortierte Eingabe, gleicher km → «Kilometerstand nicht
  gestiegen», leere Daten → `[]`/null), Gewichtung Liter/km statt Mittel von Verhältnissen, Rundung (`summe`/`rundeZahl`),
  Fremdwährung über `betrag_chf`, Kennzahlen, Monats- und Saisonzuordnung, gleitendes Mittel mit Reset nach Lücken.
  Alle SPEC-10-Werte ausser den zwei SPEC-Fehlern reproduziert.
- **Prüfungen 5.3:** Betragsabweichung (Toleranz 0.05, Schnellkorrektur), km-Reihenfolge inkl. Bearbeiten (eigener Eintrag
  ausgeschlossen, gleicher km → Fehler, auch bei gleichem Datum), Tankvolumen ✗, Preis 1.00–3.50 in CHF, Datum Zukunft/vor
  Vorgänger, Verbrauchswarnung, Pflichtfelder, Berechnung des fehlenden Werts.
- **Datenhaltung/Sicherheit:** RLS auf allen vier Tabellen (`for all`, `using` + `with check` = `auth.uid()`);
  Storage-Policies nach Präfix `<uid>/` für select/insert/update/delete; Bucket privat; `upsert onConflict` passt zu den
  Primärschlüsseln (`einstellung(user_id)`, `tankstelle_alias(user_id, von)`); Edge Function: JWT mit `getUser`, `verify_jwt`,
  Pfadvalidierung (Präfix, Regex, `..`), Download mit Nutzer-JWT, Grössenlimit, Timeout 18 s, Schema-Validierung der
  Modellantwort, Fehlertexte generisch, Logs ohne Schlüssel/Bilder, Schlüssel nur als Secret (nicht im Client-Bundle:
  Build durchsucht). CORS `*` ist mit JWT-Pflicht vertretbar.
- **Client:** keine `dangerouslySetInnerHTML`/`innerHTML`/`eval`, keine externen Skripte, Schriften, CDN-Verweise (Build
  enthält nur eigene Dateien); CSV-Export mit Formel-Schutz (`=,+,-,@,Tab,CR`) und Anführungszeichen-Escaping;
  Zoombild-Link `rel=noopener`; Erkennungstexte werden von Preact escaped.
- **Fehlerbehandlung:** Timeout/Fehler der Erkennung → leeres Formular mit Hinweis, Foto bleibt; Upload-Fehler → Retry ohne
  erneuten Upload bereits hochgeladener Bilder; Offline-Hinweis; Doppeltippen auf «Speichern» gesperrt; Bearbeiten, das die
  km-Reihenfolge verletzt, wird blockiert; Löschen fragt nach, Fotos standardmässig behalten (SPEC 4).
- **Kohärenz:** Routen (`/erfassen/gespeichert`, `/eintrag/:id`, `/bericht/:jahr/:monat`) in `router.ts` und `app.tsx`
  vorhanden; Props `eintragId`; Gespeichert-Seite wird bei veralteter Rückmeldung zurückgesetzt (`Bestaetigen.tsx`, neu).
