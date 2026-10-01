import { useState } from 'preact/hooks';
import { sendeMagicLink } from '../../lib/data';
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

  return (
    <Seite titel="Anmelden">
      {linkFehler && !gesendet ? <Hinweis stufe="fehler">{linkFehler}</Hinweis> : null}
      {gesendet ? (
        <>
          <Hinweis stufe="ok">
            Link gesendet an <strong>{email.trim()}</strong>. Bitte das E-Mail öffnen und auf den Link tippen.
            Auf dem iPhone den Link im gleichen Gerät öffnen; er ist nur kurz gültig.
          </Hinweis>
          <p><Knopf variante="sekundaer" onClick={() => setGesendet(false)}>Andere Adresse verwenden</Knopf></p>
        </>
      ) : (
        <form class="formular" onSubmit={senden} noValidate>
          <p>Wir senden dir einen Anmeldelink per E-Mail. Ein Passwort ist nicht nötig.</p>
          <Feld
            label="E-Mail-Adresse" type="email" inputMode="email" autoComplete="email"
            autoCapitalize="none" value={email} required
            onInput={(e: Event) => setEmail((e.currentTarget as HTMLInputElement).value)}
          />
          {fehler ? <Hinweis stufe="fehler">{fehler}</Hinweis> : null}
          <Knopf type="submit" gross disabled={sendet}>{sendet ? 'Wird gesendet …' : 'Anmeldelink senden'}</Knopf>
        </form>
      )}
    </Seite>
  );
}
