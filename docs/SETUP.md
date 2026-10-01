# Tankbuch – Einrichtung Schritt für Schritt

Diese Anleitung richtet sich an Personen ohne Programmiererfahrung. Du brauchst:
ein GitHub-Konto, ein Supabase-Konto (kostenlos genügt), einen Anthropic-API-Zugang
(console.anthropic.com) und einmalig einen Computer mit Node.js.

Was wo liegt:

| Teil | Wo |
|---|---|
| App (Webseite) | GitHub Pages |
| Daten, Fotos, Anmeldung, Erkennung | Supabase (Region Frankfurt) |
| Bilderkennung | Claude (Anthropic) über die Supabase-Funktion `extract` |

---

## 1. Supabase-Projekt anlegen (Frankfurt)

1. Gehe auf https://supabase.com und melde dich an.
2. Klicke auf **New project**.
3. Name: `tankbuch`. Wähle ein **Database Password** und speichere es im Passwortmanager.
4. **Region: Europe**, unter **Advanced configuration** genauer **Central EU (Frankfurt)** wählen.
5. **Security**: «Enable Data API» eingeschaltet lassen. «Automatically expose new tables» **ausschalten** (die Rechte vergibt Migration `0005_grants.sql`). «Enable automatic RLS» **einschalten**.
6. **Create new project** und 1 bis 2 Minuten warten.
7. Öffne **Project Settings → API**. Notiere dir:
   - **Project URL** (z.B. `https://abcdxyz.supabase.co`)
   - **anon public** Key (langer Text). Dieser Schlüssel ist öffentlich und darf in der App stehen.
   - Den **service_role** Key brauchst du nicht und gibst du nie weiter.

## 2. Datenbank einrichten (Migrationen)

Die fünf Dateien im Ordner `supabase/migrations/` legen Tabellen, Fotospeicher, Zugriffsregeln und Upload-Grenzen an.

1. In Supabase links **SQL Editor** öffnen, **New query**.
2. Öffne die Datei `supabase/migrations/0001_schema.sql`, kopiere den ganzen Inhalt in den Editor, **Run**.
   Erwartet: «Success. No rows returned».
3. Dasselbe mit `0002_storage.sql` (privater Bucket `belege` und Zugriffsregeln).
4. Dasselbe mit `0003_einstellungen.sql` (Einstellungen und Tankstellen-Namen).
5. Dasselbe mit `0004_storage_limits.sql` (Bucket `belege`: höchstens 5 MB je Datei, nur JPEG und PNG).
6. Dasselbe mit `0005_grants.sql` (Zugriffsrechte für angemeldete Nutzer).
7. Prüfung: **Table Editor** zeigt die Tabellen `fahrzeug`, `tankvorgang`, `einstellung`, `tankstelle_alias`.
   Unter **Storage** gibt es den Bucket `belege` mit der Kennzeichnung «Private».

Reihenfolge einhalten (0001 bis 0005). Jede Datei nur einmal ausführen.

## 3. Anmeldung per E-Mail-Link (Magic Link)

1. **Authentication → Providers → Email**: aktiv lassen. **Confirm email** aktiv lassen.
   Das Passwort-Login brauchst du nicht; die App nutzt den Link per E-Mail.
2. **Authentication → URL Configuration**:
   - **Site URL**: die Adresse deiner App auf GitHub Pages, z.B.
     `https://DEIN-BENUTZERNAME.github.io/DEIN-REPO-NAME/`
   - **Redirect URLs** (Add URL), beide eintragen:
     - `https://DEIN-BENUTZERNAME.github.io/DEIN-REPO-NAME/`
     - `https://DEIN-BENUTZERNAME.github.io/DEIN-REPO-NAME/**`
   - Zum Testen am eigenen Rechner zusätzlich: `http://localhost:5173/**`
3. **Save changes**.
4. **Wichtig (Kostenschutz):** Sobald du dich einmal selbst erfolgreich angemeldet hast, unter
   **Authentication → Sign In / Providers** (bzw. **Authentication → Settings**) die Option
   **Allow new users to sign up** **ausschalten**. Sonst kann sich jede Person, die die Adresse der App kennt,
   per E-Mail-Link registrieren und Bilder auf Kosten deines Anthropic-Kontos auswerten lassen.
   Ergänzend schützt die Funktion `extract` selbst (siehe Schritt 4: Secret `ALLOWED_EMAILS`).

Hinweis: Der kostenlose Supabase-Standardversand von E-Mails ist auf wenige Mails pro Stunde begrenzt.
Für den Privatgebrauch reicht das.

## 4. Secret für die Bilderkennung

1. Auf https://console.anthropic.com einen **API Key** erstellen (Settings → API Keys) und kopieren.
2. Das Secret wird über die Supabase-Kommandozeile gesetzt (siehe Schritt 5, dort ist die Installation beschrieben):

   ```
   supabase secrets set ANTHROPIC_API_KEY=sk-ant-DEIN-SCHLUESSEL
   ```

   Alternativ in der Weboberfläche: **Edge Functions → Secrets → Add new secret**,
   Name `ANTHROPIC_API_KEY`, Wert = dein Schlüssel.
3. Der Schlüssel liegt nur bei Supabase, nie in der App und nie im Repository.
4. **Empfohlen: Erkennung auf dich beschränken.** Zweites Secret `ALLOWED_EMAILS` mit deiner E-Mail-Adresse
   (mehrere Adressen kommagetrennt):

   ```
   supabase secrets set ALLOWED_EMAILS=du@example.ch
   ```

   Ist das Secret leer oder nicht gesetzt, dürfen alle angemeldeten Personen die Erkennung nutzen.
   Andere Konten erhalten Fehler 403.
5. Eingebaute Begrenzungen der Funktion: höchstens 6 Erkennungen pro Minute und Nutzer (Fehler 429),
   Bilder höchstens 5 MB und nur JPEG/PNG (geprüft am Dateikopf). Die Werte stehen in
   `supabase/functions/extract/config.ts`.

## 5. Edge Function `extract` veröffentlichen

Einmalig am Computer (Windows, PowerShell):

1. Node.js installieren (https://nodejs.org, LTS-Version), falls noch nicht vorhanden.
2. Im Ordner des Projekts (dort, wo `package.json` liegt) ausführen:

   ```
   npx supabase login
   npx supabase link --project-ref DEINE-PROJEKT-REF
   npx supabase functions deploy extract
   ```

   - `DEINE-PROJEKT-REF` ist der Teil vor `.supabase.co` in deiner Project URL
     (auch sichtbar unter Project Settings → General → Reference ID).
   - `login` öffnet den Browser zur Bestätigung. `link` fragt das Datenbank-Passwort aus Schritt 1.
3. Falls du Schritt 4 noch nicht gemacht hast: jetzt
   `npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-...` ausführen.
4. Prüfung: In Supabase unter **Edge Functions** erscheint `extract` mit Status aktiv.

Das verwendete Claude-Modell steht in `supabase/functions/extract/config.ts` (`MODELL_ID`).
Nach einer Änderung die Funktion erneut veröffentlichen (`functions deploy extract`).

## 6. GitHub: Repository und Secrets

1. Lege auf GitHub ein Repository an (z.B. `tankbuch`) und lade den Projektinhalt hoch
   (Branch `main`).
2. Im Repository: **Settings → Secrets and variables → Actions → New repository secret**.
   Zwei Secrets anlegen:

   | Name | Wert |
   |---|---|
   | `VITE_SUPABASE_URL` | Project URL aus Schritt 1 |
   | `VITE_SUPABASE_ANON_KEY` | anon public Key aus Schritt 1 |

   Die Namen müssen genau so geschrieben sein.

## 7. GitHub Pages aktivieren

1. Im Repository: **Settings → Pages**.
2. Bei **Build and deployment → Source** wählen: **GitHub Actions**.
3. Nach einem Push auf `main` läuft unter dem Reiter **Actions** der Ablauf «Deploy nach GitHub Pages»
   (Tests, Build, Veröffentlichung). Er kann auch von Hand gestartet werden (**Run workflow**).
4. Nach grünem Haken ist die App unter
   `https://DEIN-BENUTZERNAME.github.io/DEIN-REPO-NAME/` erreichbar.
   Diese Adresse muss mit der Site URL aus Schritt 3 übereinstimmen.

## 8. Erster Start und iPhone

1. Öffne die App-Adresse, gib deine E-Mail-Adresse ein, tippe auf den Link in der Mail.
   Der Link muss im selben Browser geöffnet werden (auf dem iPhone: Safari).
2. iPhone: In Safari **Teilen → Zum Home-Bildschirm**. Erst danach die App von dort öffnen.
   Hinweis: Nach der Installation als Home-Bildschirm-App ist die Anmeldung separat;
   einmal dort erneut per Link anmelden.
3. Teste mit einem Tankbeleg: «Tanken erfassen», Foto, Werte prüfen, speichern.

## Lokal entwickeln (optional)

Datei `.env.local` im Projektordner anlegen (wird nicht ins Repository hochgeladen):

```
VITE_SUPABASE_URL=https://DEINE-REF.supabase.co
VITE_SUPABASE_ANON_KEY=DEIN-ANON-KEY
```

Dann `npm ci` und `npm run dev`; die App läuft auf `http://localhost:5173`.

## Fehlersuche

| Problem | Ursache / Lösung |
|---|---|
| Link in der Mail führt zu Fehler oder falscher Seite | Site URL / Redirect URLs in Schritt 3 prüfen (Gross-/Kleinschreibung, Schrägstrich am Ende) |
| Keine Mail kommt an | Spam-Ordner; Mail-Limit von Supabase (mehrere Minuten warten) |
| App zeigt «nicht konfiguriert» | GitHub-Secrets fehlen oder falsch benannt; danach Workflow erneut starten |
| Erkennung meldet Fehler 401 | Neu anmelden (Sitzung abgelaufen) |
| Erkennung meldet Fehler 403 | Deine E-Mail steht nicht in `ALLOWED_EMAILS` (Schritt 4) |
| Erkennung meldet Fehler 429 | Zu viele Anfragen in kurzer Zeit: eine Minute warten |
| Anmeldung meldet «nicht zugelassen» | Registrierung ist geschlossen (Schritt 3.4): nur bereits angelegte Konten können sich anmelden |
| Erkennung meldet «ANTHROPIC_API_KEY ist nicht gesetzt» | Schritt 4 wiederholen, dann Funktion neu veröffentlichen |
| Erkennung meldet Fehler 502 | Anthropic-Konto ohne Guthaben, ungültiger Schlüssel oder falsche Modell-ID in `config.ts` |
| Foto-Upload verweigert | Migration `0002_storage.sql` nicht ausgeführt, oder Bild grösser als 5 MB / nicht JPEG/PNG (`0004`) |
| Workflow schlägt bei «npm test» fehl | Tests im Projekt fehlgeschlagen; Details im Actions-Protokoll |

## Verwaiste Fotos

Fotos werden hochgeladen, bevor der Eintrag gespeichert ist. Verwirfst du den Vorgang oder wählst ein anderes Foto, löscht die App
die nicht gespeicherten Dateien wieder. Schliesst du die App mitten im Ablauf (nach dem Hochladen, vor dem Speichern), kann eine Datei
im Bucket `belege` ohne Eintrag zurückbleiben. Sie ist nur für dich sichtbar (Zugriff nur unter deinem Ordner) und lässt sich in Supabase unter
**Storage → belege** bei Bedarf von Hand löschen.

## Datenschutz

Daten und Fotos liegen im eigenen Supabase-Projekt (Frankfurt). Für die Erkennung werden die Fotos
kurzzeitig an Anthropic gesendet; die Funktion speichert sie nicht und schreibt keine Bilder oder
Schlüssel ins Protokoll.
