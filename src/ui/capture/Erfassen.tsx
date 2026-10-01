import './capture.css';
import { useEffect, useState } from 'preact/hooks';
import { useDaten } from '../../lib/store';
import { heuteIso } from '../../lib/format';
import { Hinweis, Seite } from '../components';
import Btn from './Btn';
import {
  entferneFoto,
  fuegeFotosHinzu,
  holeErfassung,
  starteErkennung,
  startOhneFoto,
  useErfassung,
  zuruecksetzen,
  type FotoSlot,
} from './erfassung';
import { MAX_FOTOS } from './logik';

function useOnline(): boolean {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine !== false);
  useEffect(() => {
    const an = () => setOnline(true);
    const aus = () => setOnline(false);
    window.addEventListener('online', an);
    window.addEventListener('offline', aus);
    return () => {
      window.removeEventListener('online', an);
      window.removeEventListener('offline', aus);
    };
  }, []);
  return online;
}

/** Dateiauswahl als Knopf (Label mit unsichtbarem Input). Mit `kamera`: capture=environment (iOS liefert dann genau ein Bild). */
function DateiKnopf({ id, text, kamera, variante, gesperrt }: { id: string; text: string; kamera?: boolean; variante: 'sekundaer' | 'text'; gesperrt: boolean }) {
  return (
    <label class={`knopf knopf--${variante} cap-datei-label${gesperrt ? ' cap-datei-label--aus' : ''}`} for={id}>
      {kamera ? <KameraIcon /> : <BilderIcon />}
      {text}
      <input
        id={id}
        class="cap-datei"
        type="file"
        accept="image/*"
        multiple
        {...(kamera ? { capture: 'environment' } : {})}
        disabled={gesperrt}
        onChange={(e) => {
          const el = e.currentTarget as HTMLInputElement;
          const dateien = el.files ? Array.from(el.files) : [];
          el.value = '';
          if (dateien.length) void fuegeFotosHinzu(dateien);
        }}
      />
    </label>
  );
}

const KameraIcon = () => (
  <svg class="cap-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
    <circle cx="12" cy="13" r="3.5" />
  </svg>
);
const BilderIcon = () => (
  <svg class="cap-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="m4 16 4.5-4.5 3.5 3.5 2.5-2.5L20 17" />
    <circle cx="15.5" cy="9.5" r="1.5" />
  </svg>
);

function FotoKachel({ slot, nr, gesperrt }: { slot: FotoSlot; nr: number; gesperrt: boolean }) {
  return (
    <li class="cap-kachel">
      <div class="cap-kachel__bild">
        {slot.url ? (
          <img src={slot.url} alt={`Vorschau Foto ${nr}`} />
        ) : (
          <span class="cap-kachel__platz" aria-hidden="true">{slot.status === 'fehler' ? '✗' : '…'}</span>
        )}
        <span class="cap-kachel__nr">Foto {nr}</span>
      </div>
      {slot.status === 'verkleinern' ? <p class="cap-kachel__status" role="status">Wird verkleinert …</p> : null}
      {slot.status === 'fehler' && slot.fehler ? (
        <p class="cap-kachel__fehler" role="alert"><span aria-hidden="true">✗ </span>{slot.fehler}</p>
      ) : null}
      <Btn variante="text" klein disabled={gesperrt || slot.status === 'verkleinern'} onClick={() => entferneFoto(slot.id)} aria-label={`Foto ${nr} entfernen`}>
        Entfernen
      </Btn>
    </li>
  );
}

type Schritt = 'verkleinern' | 'hochladen' | 'erkennen';

function Fortschritt({ aktiv }: { aktiv: Schritt }) {
  const schritte: { id: Schritt; text: string }[] = [
    { id: 'verkleinern', text: 'Verkleinern' },
    { id: 'hochladen', text: 'Hochladen' },
    { id: 'erkennen', text: 'Erkennen' },
  ];
  const idx = schritte.findIndex((s) => s.id === aktiv);
  return (
    <ol class="cap-fortschritt" role="status" aria-live="polite">
      {schritte.map((s, i) => (
        <li key={s.id} class={i < idx ? 'cap-fortschritt--fertig' : i === idx ? 'cap-fortschritt--aktiv' : ''} aria-current={i === idx ? 'step' : undefined}>
          <span aria-hidden="true">{i < idx ? '✓ ' : i === idx ? '… ' : '○ '}</span>
          {s.text}
        </li>
      ))}
    </ol>
  );
}

export default function Erfassen() {
  const z = useErfassung();
  const daten = useDaten();
  const online = useOnline();

  // Frisch starten, wenn vorher ein Eintrag gespeichert oder bearbeitet wurde.
  useEffect(() => {
    const s = holeErfassung();
    if (s.gespeichert || s.modus === 'bearbeiten') zuruecksetzen();
  }, []);

  const verkleinert = z.fotos.some((f) => f.status === 'verkleinern');
  const laeuft = z.phase === 'hochladen' || z.phase === 'erkennen';
  const schritt: Schritt | null = laeuft ? (z.phase as Schritt) : verkleinert ? 'verkleinern' : null;
  const hatFoto = z.fotos.some((f) => f.status === 'bereit');
  const anzahl = z.fotos.length;
  const voll = anzahl >= MAX_FOTOS;
  const kontext = () => ({
    fahrzeug: daten.fahrzeug,
    eintraege: daten.eintraege,
    einst: daten.einst,
    heute: heuteIso(),
    neuLaden: daten.neuLaden,
  });

  return (
    <Seite titel="Tanken erfassen">
      <div class="cap">
        {!online ? (
          <Hinweis stufe="warnung">
            Kein Netz. Fotos können erst hochgeladen und ausgelesen werden, wenn du wieder online bist.
          </Hinweis>
        ) : null}
        {daten.fehler ? <Hinweis stufe="fehler">{daten.fehler}</Hinweis> : null}
        {z.fehler ? <Hinweis stufe="fehler">{z.fehler}</Hinweis> : null}

        <section class="cap-aufnahme" aria-labelledby="cap-fotos-t">
          <div class="cap-aufnahme__kopf">
            <h2 class="cap-aufnahme__titel" id="cap-fotos-t">Fotos aufnehmen</h2>
            <span class="cap-aufnahme__zahl" aria-live="polite">{anzahl} von {MAX_FOTOS}</span>
          </div>
          <p class="cap-klein" id="cap-fotos-hilfe">
            Beleg und Kilometerzähler – in beliebiger Reihenfolge, eines darf fehlen. Die Erkennung ordnet die Fotos selbst zu.
          </p>

          {anzahl ? (
            <ul class="cap-kacheln" aria-label="Aufgenommene Fotos">
              {z.fotos.map((f, i) => <FotoKachel key={f.id} slot={f} nr={i + 1} gesperrt={laeuft} />)}
            </ul>
          ) : (
            <div class="cap-aufnahme__leer" aria-hidden="true">
              <KameraIcon />
              <span>Noch kein Foto</span>
            </div>
          )}

          {z.fotoMeldung ? <Hinweis stufe="info">{z.fotoMeldung}</Hinweis> : null}

          {voll ? (
            <p class="cap-klein">Maximal {MAX_FOTOS} Fotos. Zum Ersetzen zuerst eines entfernen.</p>
          ) : (
            <div class="cap-aufnahme__aktionen" aria-describedby="cap-fotos-hilfe">
              <DateiKnopf id="cap-foto-kamera" kamera variante="sekundaer" text={anzahl ? 'Weiteres Foto aufnehmen' : 'Foto aufnehmen'} gesperrt={laeuft} />
              <DateiKnopf id="cap-foto-galerie" variante="text" text="Aus Fotos wählen" gesperrt={laeuft} />
            </div>
          )}
        </section>

        {schritt ? <Fortschritt aktiv={schritt} /> : null}

        <div class="cap-aktionen">
          <Btn
            gross
            disabled={!hatFoto || laeuft || verkleinert || !online}
            onClick={() => void starteErkennung(kontext())}
          >
            {laeuft ? 'Wird ausgelesen …' : 'Fotos auslesen'}
          </Btn>
          <Btn variante="sekundaer" disabled={laeuft} onClick={() => startOhneFoto(kontext())}>
            Ohne Foto erfassen (geschätzt)
          </Btn>
        </div>
        <p class="cap-klein">
          Ohne Foto gespeicherte Einträge werden überall als «geschätzt» markiert und zählen nicht im Durchschnitt (ausser du schaltest das in den Einstellungen ein).
        </p>
      </div>
    </Seite>
  );
}

