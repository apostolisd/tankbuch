import { useState } from 'preact/hooks';
import { pruefeAnmeldecode, sendeMagicLink } from '../../lib/data';
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
  const [email, setEmail] = useState('');
  const [sendet, setSendet] = useState(false);
  const [gesendet, setGesendet] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [prueft, setPrueft] = useState(false);

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

  const senden = async (e: Event) => {
    e.preventDefault();
    const adresse = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(adresse)) {
      setFehler('Bitte eine gültige E-Mail-Adresse eingeben.');
      return;
    }
    setFehler(null);
    setSendet(true);
    try {
      await sendeMagicLink(adresse);
      setGesendet(true);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Der Anmeldelink konnte nicht gesendet werden.');
    } finally {
      setSendet(false);
    }
  };

  const codePruefen = async (e: Event) => {
    e.preventDefault();
    const c = code.replace(/\D/g, '');
    if (c.length < 6) {
      setFehler('Bitte den Code aus der E-Mail eingeben (nur Ziffern).');
      return;
    }
    setFehler(null);
    setPrueft(true);
    try {
      await pruefeAnmeldecode(email.trim(), c);
      // Die App wechselt über onAuthStateChange automatisch in die Ansicht.
    } catch (err) {
      setFehler(err instanceof Error ? err.message : 'Die Anmeldung mit dem Code hat nicht geklappt.');
    } finally {
      setPrueft(false);
    }
  };

  return (
    <Seite titel="Anmelden">
      {linkFehler && !gesendet ? <Hinweis stufe="fehler">{linkFehler}</Hinweis> : null}
      {gesendet ? (
        <>
          <Hinweis stufe="ok">
            E-Mail gesendet an <strong>{email.trim()}</strong>. Tippe den <strong>Code</strong> aus der E-Mail hier ein.
            Das funktioniert auch in der App auf dem Homescreen. Am PC kannst du stattdessen auf den Link tippen.
          </Hinweis>
          <form class="formular" onSubmit={codePruefen} noValidate>
            <Feld
              label="Code aus der E-Mail" type="text" inputMode="numeric" autoComplete="one-time-code"
              maxLength={10} value={code}
              onInput={(e: Event) => setCode((e.currentTarget as HTMLInputElement).value)}
            />
            {fehler ? <Hinweis stufe="fehler">{fehler}</Hinweis> : null}
            <Knopf type="submit" gross disabled={prueft}>{prueft ? 'Wird geprüft …' : 'Anmelden'}</Knopf>
          </form>
          <p><Knopf variante="sekundaer" onClick={() => { setGesendet(false); setCode(''); setFehler(null); }}>Neuen Code anfordern / andere Adresse</Knopf></p>
        </>
      ) : (
        <form class="formular" onSubmit={senden} noValidate>
          <p>Wir senden dir einen Anmeldecode per E-Mail. Ein Passwort ist nicht nötig.</p>
          <Feld
            label="E-Mail-Adresse" type="email" inputMode="email" autoComplete="email"
            autoCapitalize="none" value={email} required
            onInput={(e: Event) => setEmail((e.currentTarget as HTMLInputElement).value)}
          />
          {fehler ? <Hinweis stufe="fehler">{fehler}</Hinweis> : null}
          <Knopf type="submit" gross disabled={sendet}>{sendet ? 'Wird gesendet …' : 'Code senden'}</Knopf>
        </form>
      )}
    </Seite>
  );
}
