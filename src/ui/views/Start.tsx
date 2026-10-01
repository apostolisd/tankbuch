import { sortiereEintraege } from '../../core';
import { chf, datum, km, zahl } from '../../lib/format';
import { konfiguriert } from '../../lib/supabase';
import { useDaten } from '../../lib/store';
import { Hinweis, Knopf, Seite, Status } from '../components';
import { href } from '../router';

export default function Start() {
  const { eintraege, laedt, fehler, neuLaden } = useDaten();
  const letzte = sortiereEintraege(eintraege).slice(-3).reverse();

  return (
    <Seite titel="Tankbuch">
      {!konfiguriert ? (
        <Hinweis stufe="warnung">
          Nicht konfiguriert: <code>VITE_SUPABASE_URL</code> und <code>VITE_SUPABASE_ANON_KEY</code> fehlen.
          Speichern und Auswerten ist erst nach der Konfiguration möglich.
        </Hinweis>
      ) : null}
      {fehler ? (
        <Hinweis stufe="fehler">
          {fehler} <Knopf variante="text" onClick={() => void neuLaden()}>Erneut versuchen</Knopf>
        </Hinweis>
      ) : null}

      <p class="start__aktion">
        <Knopf href={href('/erfassen')} gross class="start-hero">
          <span class="start-hero__icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8a2 2 0 0 1 2-2h1.600l1.200-1.600A1 1 0 0 1 9.600 4h4.800a1 1 0 0 1 .800.400L16.400 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM12 16.500a3.250 3.250 0 1 0 0-6.500 3.250 3.250 0 0 0 0 6.500z" /></svg>
          </span>
          <span class="start-hero__text">
            Tanken erfassen
            <small>Beleg und Kilometerzähler fotografieren</small>
          </span>
        </Knopf>
      </p>

      <section aria-labelledby="letzte-titel">
        <h2 id="letzte-titel" class="abschnitt">Letzte Einträge</h2>
        {laedt && letzte.length === 0 ? <p class="lade">Wird geladen …</p> : null}
        {!laedt && !fehler && letzte.length === 0 ? (
          <p class="leer">Noch keine Einträge. Tippe auf «Tanken erfassen», um den ersten anzulegen.</p>
        ) : null}
        <ul class="liste">
          {letzte.map((e) => (
            <li key={e.id}>
              <a class="liste__zeile" href={href(`/eintrag/${encodeURIComponent(e.id)}`)}>
                <span class="liste__haupt">
                  <strong>{datum(e.datum)}</strong>
                  <span>{e.tankstelle ?? 'Tankstelle unbekannt'}</span>
                </span>
                <span class="liste__neben">
                  <span>{zahl(e.liter, 2)} l · {chf(e.betrag_chf)} CHF</span>
                  <span>{km(e.km_stand)} km
                    {!e.volltankung ? <> <Status typ="teil" /></> : null}
                    {e.geschaetzt ? <> <Status typ="geschaetzt" /></> : null}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
        {letzte.length > 0 ? <p class="start__alle"><Knopf href={href('/tankbuch')} variante="dezent">Alle Einträge im Tankbuch</Knopf></p> : null}
      </section>
    </Seite>
  );
}
