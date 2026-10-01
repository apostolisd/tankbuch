# Design: Kritik und Designsystem «Petrol»

Stand: 30.09.2026. Die Mockups aus SPEC («Tankkosten – fünf Ideen») standen nicht zur Verfügung; die Gestaltung ist eigenständig.
Funktion, `src/core` und Fachlogik sind unverändert.

## 1. Kritik am Ausgangszustand (Rahmen: Erster Eindruck, Hierarchie, Konsistenz, Zugänglichkeit, Dichte)

| Rahmen | Befund |
|---|---|
| Erster Eindruck | Wirkte wie ein Formular-Prototyp: Dunkelgrün + Gelb (Demo-Banner, Warnungen) + Blau (Links, Diagramme) ohne gemeinsame Farbfamilie; schwere Rahmen; das gelbe Demo-Banner dominierte jede Seite. |
| Hierarchie | Alle Kennzahlkacheln gleich gross, keine Hero-Kennzahl; Herleitung nur als blauer Text-Link; der Erfassen-Knopf war ein einfacher grüner Balken. |
| Konsistenz | Jede Ansicht hatte eigene Farben (hartkodierte Hex-Werte in CSS und SVG), eigene Tabellen-, Karten- und Knopfstile; Preise-Icon war ein «$» (falsche Währung). |
| Zugänglichkeit | Kontraste und Tap-Ziele waren meist ok; Feldstatus im Bestätigen-Formular nur über Hintergrundfarbe plus kleinen Text, ohne erklärende Legende; Formular ungegliedert. |
| Dichte / Weissraum | Zu enge Karten, Zeitraumwahl belegte mobil viel Platz, Bestätigen-Formular war eine lange, gleichförmige Feldliste. |

## 2. Designrichtung

«Petrol»: ruhige, helle Oberfläche in einer einzigen Farbfamilie (Farbton ca. 195°). Eine Akzentfarbe (Petrol) für Knöpfe, Links, aktive Zustände und die Hauptserie in Diagrammen; Neutrale leicht petrol-getönt; Semantikfarben (ok, warn, fehler) mit gleicher Helligkeit/Sättigung je Stufe, «info» und «berechnet» verwenden die Akzent-Tönung. Karten mit sanftem Schatten statt Rahmen, 4/8-Raster, grosszügiger Weissraum. Hero-Kennzahl (Verbrauch) gross, Sekundärwerte klein; Herleitungen als echte Brüche in einer eigenen Formel-Box. Mobil: Tab-Leiste mit eigenem Icon-Set, grosser Erfassen-Knopf; Desktop: Seitenleiste mit Wortmarke.

## 3. Tokens (`src/ui/styles.css`, `:root`)

- Flächen: `--bg #f3f6f7`, `--bg-tief #e6ecee`, `--flaeche #fff`, `--flaeche-2 #f8fafb`, `--rand #d9e2e5`, `--rand-stark #74878e` (Eingabefelder, 3.8:1).
- Text: `--text #12232a` (16:1), `--text-2 #41545b` (8:1), `--text-3 #566870` (5.7:1).
- Akzent: `--akzent #0a6378` (6.8:1 auf Weiss), `--akzent-hover #084e5f`, `--akzent-aktiv #063d4b`, `--akzent-weich #e0f0f4`, `--akzent-rand #b0d5de`. Links und Fokusring nutzen den Akzent (kein separates Blau).
- Semantik (Fläche / Text / Rand): ok `#e4f3ea / #17573a / #8ac7a5`; warn `#fbf0d9 / #6a4500 / #e0b25a`; fehler `#fbe9e6 / #9b2316 / #e3958a`; info `#e0f0f4 / #0a4f60 / #b0d5de`. Text auf Fläche je >= 7:1. Semantik immer mit Symbol und Text (✓ ≈ ⚠ ✗ ? = ✎).
- Diagramme: `--c-serie-1` Akzent, `--c-serie-2 #c4581f` (Terrakotta), `--c-serie-3 #6b7c84` (Schiefer), `--c-linie`, `--c-raster`, `--c-achse`, `--c-tick`, `--c-luecke`, `--c-ausreisser(-hell)`, `--c-marke`, `--c-balken-blass`. Die SVGs lesen diese Variablen (`fill="var(--…)"`); Serien unterscheiden sich zusätzlich durch Form.
- Abstände `--s-1…--s-12` (4, 8, 12, 16, 20, 24, 32, 40, 48 px); Radien `--r-s 8`, `--r-m 12`, `--r-l 16`, `--r-xl 24`, `--r-pille`; Schatten `--schatten-1/-2/-akzent`.
- Typografie: Systemschrift-Stack (`system-ui`, Segoe UI, Roboto …), Skala `--fs-xs 12` bis `--fs-hero 48`, tabellarische Ziffern global (`font-variant-numeric: tabular-nums`).
- Offen: zwei Verlaufsstopps im grossen Knopf (`#0f7e97`, `#064b5c`) und der Active-Ton des Gefahr-Knopfs (`#f6d3cd`) sind Hex-Werte im CSS, nicht als Token geführt.

## 4. Knopfvarianten (`.knopf`, Komponenten `Knopf`/`Btn`)

Gemeinsam: Radius 12 px, Höhe >= 48 px (klein: 44 px), Innenabstand 10/20 px, Abstand zwischen Knöpfen 8 px, Fokusring 3 px (Akzent, 2 px Abstand).

| Variante | Einsatz | Normal | Hover | Active | Disabled |
|---|---|---|---|---|---|
| `primaer` | Hauptaktion (Speichern, CSV, Drucken) | Akzent-Fläche, weisser Text | dunklerer Akzent | noch dunkler, 1 px nach unten | graue Fläche, gedämpfter Text, kein Schatten |
| `sekundaer` | Nebenaktionen (Foto aufnehmen, Zurücksetzen, Einstellungen) | weiss, Akzent-Rand und -Text | Akzent-Tönung | kräftigere Tönung | blasse Fläche, gedämpfter Text |
| `dezent` / `text` | Tertiär («Alle Einträge», «Zurück», «Erneut versuchen») | transparent, Akzent-Text | Akzent-Tönung | kräftigere Tönung | gedämpfter Text |
| `gefahr` | Löschen, Abmelden | weiss, roter Rand und Text | rote Tönung | dunklere Tönung | blasse Fläche |
| `gross` (Zusatz) | Start «Tanken erfassen», «Speichern», «Weiteren erfassen» | 72 px hoch, Radius 16 px, Primär-Verlauf mit Akzent-Schatten | | | |

Das Demo-Banner nutzt `sekundaer` + `knopf--klein`.

## 5. Navigation und Icons

Eigenes Inline-SVG-Set (24 px-Raster, Strichstärke 1.75, runde Enden): Start (Haus), Tankbuch (Seite mit Zeilen), Verlauf (Liniendiagramm), Preise (Preisschild, kein Dollarzeichen), Bericht (Dokument), Einstellungen (Regler). Mobil Tab-Leiste, aktiver Eintrag mit Akzent-Pille; Desktop Seitenleiste mit Wortmarke (Tropfen-Logo).

## 6. Umgesetzt

Start (Hero-Knopf mit Kamera-Icon), Erfassen, Bestätigen (Fotos prominent und zoombar; Formular in vier Gruppen; Legende der Feldstatus; Prüfliste; mobil angeheftete Speichern-Leiste), Gespeichert, Tankbuch (Hero-Kachel Verbrauch, Herleitung als Bruch in Formel-Box, Kartenliste mobil), Verlauf, Preise (Diagramm misst die Containerbreite, Schrift bleibt mobil lesbar), Bericht (Liste, Monat, A4-Druckstil), Einstellungen, Login (nur Token-Stile, in der Demo nicht erreichbar).

## 7. Iteration nach eigener Kritik

- Preise-Diagramm: bei 390 px war die Schrift auf ca. 5 px geschrumpft (fester 640-px-ViewBox) → Breite wird gemessen, Schrift 12 px.
- Bestätigen: Foto-Vorschau nahm mobil zu viel Höhe ein → maximal 36 % der Fensterhöhe.
- Start: Listenzeilen brachen bei langen Tankstellennamen um → Zeilen ohne Umbruch, Werte rechts fixiert.
- Demo-Banner: auf Desktop zu breites Auswahlfeld → Breite begrenzt.

## 8. Geprüft und nicht geprüft

Siehe Schlussbericht der Umsetzung. Die Druckansicht wurde nur durch Einbinden der `@media print`-Regeln in die Bildschirmansicht beurteilt, nicht im Druckdialog.
