import './capture.css';
import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { EintragEntwurf, Pruefung } from '../../core/types';
import { kannSpeichern, pruefeEntwurf } from '../../core/pruefungen';
import { holeAliase } from '../../lib/data';
import { chf, heuteIso, parseZahl } from '../../lib/format';
import { useDaten } from '../../lib/store';
import { Feld, Hinweis, Knopf, Seite } from '../components';
import { useRoute } from '../router';
import Btn from './Btn';
import Gespeichert from './Gespeichert';
import Zoombild from './Zoombild';
import {
  aendere,
  holeErfassung,
  korrigiere,
  ladeEintrag,
  loeschen,
  setzeNotiz,
  setzeSchalter,
  speichern,
  tauscheFotos,
  useErfassung,
  waehleFotoArt,
  zuruecksetzen,
  type Kontext,
} from './erfassung';
import {
  ART_TEXT,
  HINWEIS_AUS_FOTO,
  betragInChf,
  istAusFoto,
  feldStatus,
  tankstellenVorschlaege,
  zuordnungStatusText,
  zusatzPruefungen,
  zusatzWarnungen,
  type FeldName,
  type FotoZeitFeld,
  type FotoArt,
} from './logik';

const KRAFTSTOFFE = ['Bleifrei 95', 'Bleifrei 98', 'Diesel'];
const WAEHRUNGEN = ['CHF', 'EUR', 'USD', 'GBP'];

/** Zahleneingabe mit Komma oder Punkt; hält den getippten Text, damit «1,» nicht verschwindet. */
function Zahlenfeld({
  id, wert, onWert, schritt, ganzzahl,
}: { id: string; wert: number | undefined; onWert: (n: number | null) => void; schritt?: string; ganzzahl?: boolean }) {
  const [text, setText] = useState(wert === undefined ? '' : String(wert));
  useEffect(() => {
    if (parseZahl(text) !== (wert ?? null)) setText(wert === undefined || wert === null ? '' : String(wert));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wert]);
  return (
    <input
      id={id}
      class="feld__eingabe"
      type="text"
      inputMode={ganzzahl ? 'numeric' : 'decimal'}
      autocomplete="off"
      value={text}
      data-schritt={schritt}
      onInput={(e) => {
        const v = (e.currentTarget as HTMLInputElement).value;
        setText(v);
        onWert(parseZahl(v));
      }}
    />
  );
}

/**
 * Feld mit Status (Symbol + Text, nie nur Farbe).
 * WICHTIG: bewusst ausserhalb von Bestaetigen() definiert. Eine im Render-Körper definierte Komponente ist bei jedem
 * Render ein neuer Komponententyp; Preact würde den Teilbaum abhängen und neu einhängen (Fokusverlust bei jedem Tastendruck).
 */
function F({ e, feld, label, fid, ausFoto, children }: { e: EintragEntwurf; feld: FeldName; label: string; fid: string; ausFoto?: readonly FotoZeitFeld[]; children: ComponentChildren }) {
  const st = feldStatus(e, feld);
  const konf = st.typ === 'unsicher' || st.typ === 'fehlt' || st.typ === 'berechnet' ? st.typ : undefined;
  const foto = (feld === 'datum' || feld === 'uhrzeit') && !!ausFoto && istAusFoto(e, feld, ausFoto);
  return (
    <Feld
      label={label}
      id={fid}
      konfidenz={konf}
      hinweis={
        st.typ === 'manuell' ? <span class="feld__konf cap-manuell"><span aria-hidden="true">✎ </span>von dir eingegeben</span>
        : foto ? <span class="cap-ausfoto">{HINWEIS_AUS_FOTO[feld as FotoZeitFeld]}</span>
        : undefined
      }
    >
      {children}
    </Feld>
  );
}

export default function Bestaetigen({ eintragId }: { eintragId?: string }) {
  const route = useRoute();
  const id = eintragId ?? (route.name === 'eintrag' ? route.params.id : undefined);
  const z = useErfassung();
  const daten = useDaten();
  const [aliase, setAliase] = useState<unknown>(undefined);
  const [loeschFrage, setLoeschFrage] = useState(false);
  const [fotosLoeschen, setFotosLoeschen] = useState(false);

  // Veraltete «Gespeichert»-Rückmeldung eines früheren Vorgangs nicht anzeigen (sonst zeigt jeder spätere
  // Klick auf einen Eintrag im Tankbuch fälschlich die Gespeichert-Seite).
  const [veraltet] = useState(() => !!holeErfassung().gespeichert);
  useEffect(() => {
    if (veraltet) zuruecksetzen();
  }, []);

  useEffect(() => {
    holeAliase().then(setAliase).catch(() => undefined);
  }, []);

  const bearbeiten = !!id;
  const eintrag = id ? daten.eintraege.find((e) => e.id === id) : undefined;
  useEffect(() => {
    if (eintrag) void ladeEintrag(eintrag);
  }, [eintrag?.id, daten.eintraege.length]);

  const kontext = (): Kontext => ({
    fahrzeug: daten.fahrzeug,
    eintraege: daten.eintraege,
    einst: daten.einst,
    heute: heuteIso(),
    aliase,
    neuLaden: daten.neuLaden,
  });

  if (z.gespeichert && !veraltet) return <Gespeichert />;

  if (bearbeiten && !z.entwurf) {
    return (
      <Seite titel="Eintrag bearbeiten">
        {daten.laedt || (!eintrag && !daten.fehler && daten.eintraege.length === 0) ? (
          <p role="status">Eintrag wird geladen …</p>
        ) : daten.fehler ? (
          <Hinweis stufe="fehler">{daten.fehler}</Hinweis>
        ) : (
          <Hinweis stufe="warnung">Dieser Eintrag wurde nicht gefunden.</Hinweis>
        )}
        <Knopf href="#/tankbuch" variante="sekundaer">Zum Tankbuch</Knopf>
      </Seite>
    );
  }

  if (!z.entwurf) {
    return (
      <Seite titel="Werte bestätigen">
        <Hinweis stufe="info">Es ist gerade keine Erfassung offen.</Hinweis>
        <Knopf href="#/erfassen">Tanken erfassen</Knopf>
      </Seite>
    );
  }

  const e = z.entwurf;
  const pruef: Pruefung[] = pruefeEntwurf(e, {
    fahrzeug: daten.fahrzeug,
    bestehende: daten.eintraege,
    heute: heuteIso(),
    einst: daten.einst,
  });
  const zusatz = zusatzPruefungen(e);
  const warnungen = zusatzWarnungen(e, z.fotos, z.ausFoto);
  const fehlerAnzahl = pruef.filter((p) => p.stufe === 'fehler').length + zusatz.length;
  const speicherbar = kannSpeichern(pruef) && zusatz.length === 0;
  const fremd = !!e.waehrung && e.waehrung.toUpperCase() !== 'CHF';
  const hatFotos = z.fotos.some((f) => !!f.pfad);
  const inChf = betragInChf(e);

  const set = (feld: FeldName, wert: string | number | null) => aendere(kontext(), feld, wert);

  const zugeordnet = z.fotos.filter((f) => f.art);
  const fotos = (
    <div class="cap-fotos">
      {zugeordnet.length ? (
        <section class="cap-zuordnung" aria-labelledby="cap-zuordnung-t">
          <h2 class="cap-zuordnung__titel" id="cap-zuordnung-t">Zuordnung der Fotos</h2>
          <ul class="cap-zuordnung__liste">
            {zugeordnet.map((f) => {
              const nr = z.fotos.indexOf(f) + 1;
              const st = zuordnungStatusText(f.zuordnung ?? 'standard');
              return (
                <li key={f.id}>
                  <span>Foto {nr}: <strong>{ART_TEXT[f.art as FotoArt]}</strong></span>
                  {st.text && f.zuordnung !== 'gespeichert' ? (
                    <span class={`status status--${st.stufe}`}>{st.symbol ? <span aria-hidden="true">{st.symbol}</span> : null}{st.text}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {z.zuordnungHinweis ? <Hinweis stufe="warnung">{z.zuordnungHinweis}</Hinweis> : null}
          <Btn variante="sekundaer" klein onClick={() => tauscheFotos()}>
            {zugeordnet.length === 2
              ? 'Zuordnung tauschen'
              : zugeordnet[0].art === 'beleg' ? 'Ist ein Kilometerzähler' : 'Ist ein Beleg'}
          </Btn>
        </section>
      ) : null}
      {z.fotos.map((f, i) => (
        <div class="cap-foto" key={f.id}>
          {f.art && z.zuordnungAuswahl ? (
            <fieldset class="cap-wahl">
              <legend class="cap-wahl__titel">Foto {i + 1} zeigt</legend>
              {(['beleg', 'tacho'] as FotoArt[]).map((a) => (
                <label key={a} class={`cap-wahl__option${f.art === a ? ' cap-wahl__option--aktiv' : ''}`}>
                  <input type="radio" name={`cap-art-${f.id}`} checked={f.art === a} onChange={() => waehleFotoArt(f.id, a)} />
                  {ART_TEXT[a]}
                </label>
              ))}
            </fieldset>
          ) : null}
          {f.url ? <Zoombild url={f.url} titel={`Foto ${i + 1}${f.art ? ` · ${ART_TEXT[f.art]}` : ''}`} /> : null}
          {f.fehler ? <Hinweis stufe="warnung">Foto {i + 1}: {f.fehler}</Hinweis> : null}
        </div>
      ))}
      {!z.fotos.some((f) => f.url || f.fehler) ? <p class="cap-klein">Kein Foto zu diesem Eintrag.</p> : null}
    </div>
  );

  return (
    <Seite titel={bearbeiten ? 'Eintrag bearbeiten' : 'Werte bestätigen'}>
      <div class="cap">
        {z.meldung ? <Hinweis stufe="warnung">{z.meldung}</Hinweis> : null}
        {z.hinweise.length ? (
          <Hinweis stufe="info">
            <ul class="cap-liste">{z.hinweise.map((h, i) => <li key={i}>{h}</li>)}</ul>
          </Hinweis>
        ) : null}
        {z.fehler ? <Hinweis stufe="fehler">{z.fehler}</Hinweis> : null}

        <div class="cap-bestaetigen">
          {fotos}

          <form
            class="cap-formular"
            noValidate
            onSubmit={(ev) => {
              ev.preventDefault();
              if (speicherbar) void speichern(kontext());
            }}
          >
            <ul class="cap-legende" aria-label="Bedeutung der Feldfarben">
              <li><span class="status status--warn"><span aria-hidden="true">?</span>gelb: unsicher gelesen</span></li>
              <li><span class="status status--fehler"><span aria-hidden="true">✗</span>rot: fehlt oder ungültig</span></li>
              <li><span class="status status--neutral"><span aria-hidden="true">=</span>gestrichelt: berechnet</span></li>
            </ul>

            <fieldset class="cap-gruppe">
            <legend class="cap-gruppe__titel">Wann und wie weit</legend>
            <div class="cap-zeile">
              <F e={e} feld="datum" label="Datum" fid="cap-datum" ausFoto={z.ausFoto}>
                <input id="cap-datum" class="feld__eingabe" type="date" value={e.datum ?? ''} onInput={(ev) => set('datum', (ev.currentTarget as HTMLInputElement).value)} />
              </F>
              <F e={e} feld="uhrzeit" label="Uhrzeit (optional)" fid="cap-uhrzeit" ausFoto={z.ausFoto}>
                <input id="cap-uhrzeit" class="feld__eingabe" type="time" value={e.uhrzeit ?? ''} onInput={(ev) => set('uhrzeit', (ev.currentTarget as HTMLInputElement).value)} />
              </F>
            </div>

            <F e={e} feld="km_stand" label="km-Stand (Gesamtkilometer)" fid="cap-km">
              <Zahlenfeld id="cap-km" ganzzahl wert={e.km_stand} onWert={(n) => set('km_stand', n)} />
            </F>
            </fieldset>

            <fieldset class="cap-gruppe">
            <legend class="cap-gruppe__titel">Betankung</legend>
            <div class="cap-zeile">
              <F e={e} feld="liter" label="Liter" fid="cap-liter">
                <Zahlenfeld id="cap-liter" wert={e.liter} onWert={(n) => set('liter', n)} />
              </F>
              <F e={e} feld="preis_pro_liter" label={`Preis pro Liter (${e.waehrung ?? 'CHF'}, optional)`} fid="cap-preis">
                <Zahlenfeld id="cap-preis" wert={e.preis_pro_liter} onWert={(n) => set('preis_pro_liter', n)} />
              </F>
            </div>

            <div class="cap-zeile">
              <F e={e} feld="betrag" label={`Betrag (${e.waehrung ?? 'CHF'})`} fid="cap-betrag">
                <Zahlenfeld id="cap-betrag" wert={e.betrag} onWert={(n) => set('betrag', n)} />
              </F>
              <F e={e} feld="waehrung" label="Währung" fid="cap-waehrung">
                <input
                  id="cap-waehrung" class="feld__eingabe" list="cap-waehrungen" maxLength={3} autocomplete="off"
                  value={e.waehrung ?? ''}
                  onInput={(ev) => set('waehrung', (ev.currentTarget as HTMLInputElement).value)}
                />
                <datalist id="cap-waehrungen">{WAEHRUNGEN.map((w) => <option key={w} value={w} />)}</datalist>
              </F>
            </div>

            {fremd ? (
              <F e={e} feld="wechselkurs" label={`Wechselkurs (1 ${e.waehrung} = … CHF)`} fid="cap-kurs">
                <Zahlenfeld id="cap-kurs" wert={e.wechselkurs} onWert={(n) => set('wechselkurs', n)} />
              </F>
            ) : null}
            {fremd || inChf !== null ? (
              <p class="cap-chf" aria-live="polite">
                Betrag in CHF: <strong>{inChf === null ? 'noch nicht berechenbar' : `CHF ${chf(inChf)}`}</strong>
                {fremd ? <span class="cap-klein"> (kein automatischer Kursabruf; Vorschlag = zuletzt verwendeter Kurs)</span> : null}
              </p>
            ) : null}

            </fieldset>

            <fieldset class="cap-gruppe">
            <legend class="cap-gruppe__titel">Tankstelle</legend>
            <F e={e} feld="tankstelle" label="Tankstelle" fid="cap-tankstelle">
              <input
                id="cap-tankstelle" class="feld__eingabe" list="cap-tankstellen" autocomplete="off"
                value={e.tankstelle ?? ''}
                onInput={(ev) => set('tankstelle', (ev.currentTarget as HTMLInputElement).value)}
              />
              <datalist id="cap-tankstellen">
                {tankstellenVorschlaege(daten.eintraege, aliase).map((n) => <option key={n} value={n} />)}
              </datalist>
            </F>

            <F e={e} feld="kraftstoff" label="Kraftstoff" fid="cap-kraftstoff">
              <input
                id="cap-kraftstoff" class="feld__eingabe" list="cap-kraftstoffe" autocomplete="off"
                value={e.kraftstoff ?? ''}
                onInput={(ev) => set('kraftstoff', (ev.currentTarget as HTMLInputElement).value)}
              />
              <datalist id="cap-kraftstoffe">
                {[...new Set([...KRAFTSTOFFE, ...daten.eintraege.map((x) => x.kraftstoff).filter((k): k is string => !!k)])].map((k) => <option key={k} value={k} />)}
              </datalist>
            </F>

            </fieldset>

            <fieldset class="cap-gruppe">
            <legend class="cap-gruppe__titel">Angaben</legend>
            <label class="cap-schalter">
              <input type="checkbox" checked={e.volltankung ?? true} onChange={(ev) => setzeSchalter('volltankung', (ev.currentTarget as HTMLInputElement).checked)} />
              <span>
                <strong>Volltankung</strong>
                <span class="cap-klein"> Tank bis zum Abschalten der Zapfpistole gefüllt. Nur dann kann ein Verbrauch berechnet werden.</span>
              </span>
            </label>

            {!hatFotos || e.geschaetzt ? (
              <label class="cap-schalter">
                <input type="checkbox" checked={e.geschaetzt ?? false} onChange={(ev) => setzeSchalter('geschaetzt', (ev.currentTarget as HTMLInputElement).checked)} />
                <span>
                  <strong>geschätzt (ohne Beleg)</strong>
                  <span class="cap-klein"> Wird überall als «geschätzt» markiert.</span>
                </span>
              </label>
            ) : null}

            <Feld label="Notiz (optional)" id="cap-notiz">
              <textarea id="cap-notiz" class="feld__eingabe" rows={2} value={e.notiz ?? ''} onInput={(ev) => setzeNotiz((ev.currentTarget as HTMLTextAreaElement).value)} />
            </Feld>
            </fieldset>

            <section class="cap-pruefungen" aria-label="Prüfungen" aria-live="polite">
              {pruef.length === 0 && zusatz.length === 0 && warnungen.length === 0 ? (
                <p class="cap-ok"><span aria-hidden="true">✓ </span>Alle Prüfungen bestanden.</p>
              ) : (
                <ul class="cap-pruefliste">
                  {zusatz.map((p, i) => (
                    <li key={`z${i}`} class="cap-pruef cap-pruef--fehler">
                      <span class="cap-pruef__symbol" aria-hidden="true">✗</span>
                      <span><span class="nur-leser">Fehler: </span>{p.text}</span>
                    </li>
                  ))}
                  {warnungen.map((p, i) => (
                    <li key={`w${i}`} class="cap-pruef cap-pruef--warnung">
                      <span class="cap-pruef__symbol" aria-hidden="true">⚠</span>
                      <span class="cap-pruef__text"><span class="nur-leser">Warnung: </span>{p.text}</span>
                    </li>
                  ))}
                  {pruef.map((p, i) => (
                    <li key={`${p.code}${i}`} class={`cap-pruef cap-pruef--${p.stufe}`}>
                      <span class="cap-pruef__symbol" aria-hidden="true">{p.stufe === 'fehler' ? '✗' : '⚠'}</span>
                      <span class="cap-pruef__text">
                        <span class="nur-leser">{p.stufe === 'fehler' ? 'Fehler: ' : 'Warnung: '}</span>{p.text}
                      </span>
                      {p.korrektur ? (
                        <Btn variante="sekundaer" onClick={() => korrigiere(p.korrektur!)}>{p.korrektur.label}</Btn>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div class="cap-aktionen">
              <Btn gross type="submit" disabled={!speicherbar || z.speichert} aria-describedby="cap-speichern-info">
                {z.speichert ? 'Wird gespeichert …' : bearbeiten ? 'Änderungen speichern' : 'Speichern'}
              </Btn>
              {bearbeiten ? (
                <Btn variante="gefahr" disabled={z.speichert} onClick={() => setLoeschFrage(true)}>Eintrag löschen</Btn>
              ) : (
                <Knopf variante="text" href="#/erfassen">Zurück zu den Fotos</Knopf>
              )}
            </div>
            <p class="cap-klein" id="cap-speichern-info">
              {speicherbar
                ? 'Bitte die Werte mit dem Foto vergleichen, bevor du speicherst.'
                : `Speichern ist erst möglich, wenn ${fehlerAnzahl === 1 ? 'der Fehler (✗)' : `die ${fehlerAnzahl} Fehler (✗)`} behoben ${fehlerAnzahl === 1 ? 'ist' : 'sind'}.`}
            </p>

            {loeschFrage ? (
              <div class="cap-loeschen" role="alertdialog" aria-labelledby="cap-loeschen-t">
                <h2 id="cap-loeschen-t" class="cap-loeschen__titel">Eintrag wirklich löschen?</h2>
                <p>Dieser Schritt kann nicht rückgängig gemacht werden.</p>
                {hatFotos ? (
                  <label class="cap-schalter">
                    <input type="checkbox" checked={fotosLoeschen} onChange={(ev) => setFotosLoeschen((ev.currentTarget as HTMLInputElement).checked)} />
                    <span>Fotos ebenfalls löschen <span class="cap-klein">(Standard: Fotos behalten)</span></span>
                  </label>
                ) : null}
                <div class="cap-aktionen">
                  <Btn variante="gefahr" disabled={z.speichert} onClick={() => void loeschen(kontext(), fotosLoeschen && hatFotos)}>
                    Endgültig löschen
                  </Btn>
                  <Btn variante="sekundaer" onClick={() => { setLoeschFrage(false); setFotosLoeschen(false); }}>Abbrechen</Btn>
                </div>
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </Seite>
  );
}
