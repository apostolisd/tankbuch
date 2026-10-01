import { useState } from 'preact/hooks';
import { meldeMitPasswortAn, sendeMagicLink } from '../../lib/data';
import { konfiguriert } from '../../lib/supabase';
import { Feld, Hinweis, Knopf, Seite } from '../components';

/** Fehler aus der Rückleitung des Magic Links (#error=...&error_code=otp_expired): sichtbar machen statt stillschweigend zu verwerfen. */
export function linkFehlerAusHash(hash: string): string | null {
  const t = hash.startsWith('#') ? hash.slice(1) : hash;
  if (t.startsWith('/') || !t.includes('error')) return null;
  const p = new URLSearchParams(t);
  if (!p.get('error') && !p.get('error_code')) return null;
  if (p.get('error_code') === 'otp_expired') return 'Der Anmeldelink ist abgelaufen oder wurde schon verwendet. Bitte unten einen neuen Link anfordern.';
  return 'Die Anmeldung über den Link hat nicht geklappt. Bitte unten einen neuen Link anfordern.';
}

export default function Login() {
  const [linkFehler] = useState<string | null>(() => {
    try {
      const f = linkFehlerAusHash(location.hash);
      if (f) history.replaceState(null, '', location.pathname + location.search);
      return f;
    } catch { return null; }
  });
  // Passwort ist der Standard: funktioniert auch in der App auf dem iPhone-Homescreen.
  const [modus, setModus] = useState<'passwort' | 'link'>('passwort');
  const [email, setEmail] = useState('');
  const [passwort, setPasswort] = useState('');
  const [laeuft, setLaeuft] = useState(false);
  const [gesendet, setGesendet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  if (!konfiguriert) {
    return (
      <Seite titel="Tankbuch">
        <Hinweis stufe="warnung">
          Die App ist noch nicht mit Supabase verbunden. Es fehlen <code>VITE_SUPABASE_URL</code> und{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> (Datei <code>.env.local</code> bzw. Build-Variablen).
          Nach dem Eintragen die App neu bauen bzw. neu starten.
        </Hinweis>
      </Seite>
    );
  }

  const adresseOk = () => {
    if (/^\S+@\S+\.\S+$/.test(email.trim())) return true;
    setFehler('Bitte eine gültige E-Mail-Adresse eingeben.');
    return false;
  };

  const anmelden = async (e: Event) => {
    e.preventDefault();
    if (!adresseOk()) return;
    if (passwort === '') { setFehler('Bitte das Passwort eingeben.'); return; }
    setFehler(null);
    setLaeuft(true);
    try {
      await meldeMitPasswortAn(email.trim(), passwort);
      // Die App wechselt über onAuthStateChange automatisch in die Ansicht.
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Die Anmeldung hat nicht geklappt.');
    } finally {
      setLaeuft(false);
    }
  };

  const linkSenden = async (e: Event) => {
    e.preventDefault();
    if (!adresseOk()) return;
    setFehler(null);
    setLaeuft(true);
    try {
      await sendeMagicLink(email.trim());
      setGesendet(true);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Der Anmeldelink konnte nicht gesendet werden.');
    } finally {
      setLaeuft(false);
    }
  };

  const wechsle = (m: 'passwort' | 'link') => { setModus(m); setFehler(null); setGesendet(false); };

  const emailFeld = (
    <Feld
      label="E-Mail-Adresse" type="email" inputMode="email" autoComplete="username"
      autoCapitalize="none" value={email} required
      onInput={(e: Event) => setEmail((e.currentTarget as HTMLInputElement).value)}
    />
  );

  return (
    <Seite titel="Anmelden">
      {linkFehler && !gesendet ? <Hinweis stufe="fehler">{linkFehler}</Hinweis> : null}
      {modus === 'passwort' ? (
        <>
          <form class="formular" onSubmit={anmelden} noValidate>
            {emailFeld}
            <Feld
              label="Passwort" type="password" autoComplete="current-password" value={passwort} required
              onInput={(e: Event) => setPasswort((e.currentTarget as HTMLInputElement).value)}
            />
            {fehler ? <Hinweis stufe="fehler">{fehler}</Hinweis> : null}
            <Knopf type="submit" gross disabled={laeuft}>{laeuft ? 'Wird angemeldet …' : 'Anmelden'}</Knopf>
          </form>
          <p>
            Noch kein Passwort? Einmal per Link anmelden und unter <strong>Einstellungen</strong> ein Passwort festlegen.
          </p>
          <p><Knopf variante="sekundaer" onClick={() => wechsle('link')}>Ohne Passwort: Link per E-Mail</Knopf></p>
        </>
      ) : gesendet ? (
        <>
          <Hinweis stufe="ok">
            Link gesendet an <strong>{email.trim()}</strong>. Bitte die E-Mail öffnen und auf den Link tippen.
            Hinweis: Auf dem iPhone öffnet sich der Link in Safari, nicht in der App auf dem Homescreen.
          </Hinweis>
          <p><Knopf variante="sekundaer" onClick={() => wechsle('passwort')}>Zurück zur Anmeldung mit Passwort</Knopf></p>
        </>
      ) : (
        <>
          <form class="formular" onSubmit={linkSenden} noValidate>
            <p>Wir senden dir einen Anmeldelink per E-Mail.</p>
            {emailFeld}
            {fehler ? <Hinweis stufe="fehler">{fehler}</Hinweis> : null}
            <Knopf type="submit" gross disabled={laeuft}>{laeuft ? 'Wird gesendet …' : 'Anmeldelink senden'}</Knopf>
          </form>
          <p><Knopf variante="sekundaer" onClick={() => wechsle('passwort')}>Mit Passwort anmelden</Knopf></p>
        </>
      )}
    </Seite>
  );
}
