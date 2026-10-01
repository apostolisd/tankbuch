import { useMemo } from 'preact/hooks';
import type { Tankvorgang, Segment } from '../../core/types';
import { monatsBericht } from '../../core/bericht';
import { useDaten } from '../../lib/store';
import { zahl } from '../../lib/format';
import { useRoute } from '../router';
import { Seite, Kachel, Bruch, Sub, Hinweis, Knopf } from '../components';
import MonatsBalken from '../charts/MonatsBalken';
import './bericht.css';

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

export interface Delta {
  pfeil: '▲' | '▼' | '▶';
  text: string;
}

/** Veränderung als Pfeil + Text mit Vorzeichen (nie nur Farbe). */
export function deltaText(aktuell: number | null | undefined, vergleich: number | null | undefined, einheit: string, dez: number, bezug: string): Delta | null {
  if (aktuell == null || vergleich == null) return null;
  const diff = aktuell - vergleich;
  const gerundet = Math.round(diff * 10 ** dez) / 10 ** dez;
  const pfeil = gerundet > 0 ? '▲' : gerundet < 0 ? '▼' : '▶';
  const vz = gerundet > 0 ? '+' : gerundet < 0 ? '−' : '±';
  const abs = zahl(Math.abs(gerundet), dez);
  const proz = vergleich !== 0 ? ` (${vz}${zahl(Math.abs(diff / vergleich) * 100, 1)} %)` : '';
  return { pfeil, text: `${vz}${abs} ${einheit}${gerundet === 0 ? '' : proz} ${bezug}` };
}

/** Monate (yyyy-mm), in denen Daten vorliegen: Beleg- oder Segment-Enddatum. Neueste zuerst. */
export function monateMitDaten(e: Tankvorgang[], s: Segment[]): { jahr: number; monat: number }[] {
  const set = new Set<string>();
  for (const x of e) set.add(x.datum.slice(0, 7));
  for (const x of s) set.add(x.enddatum.slice(0, 7));
  return [...set]
    .sort()
    .reverse()
    .map((k) => ({ jahr: Number(k.slice(0, 4)), monat: Number(k.slice(5, 7)) }));
}

export function parseBerichtHash(hash: string): { jahr: number; monat: number } | null {
  const m = /\/bericht\/(\d{4})\/(\d{1,2})/.exec(hash);
  if (!m) return null;
  const jahr = Number(m[1]), monat = Number(m[2]);
  return monat >= 1 && monat <= 12 ? { jahr, monat } : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type K = any;
const g = (o: K, k: string): number | null => (o && typeof o[k] === 'number' ? o[k] : null);

function Liste() {
  const d = useDaten();
  const monate = useMemo(() => monateMitDaten(d.eintraege ?? [], d.segmente ?? []), [d.eintraege, d.segmente]);
  return (
    <Seite titel="Monatsbericht">
      {d.fehler && <Hinweis stufe="fehler">{String(d.fehler)}</Hinweis>}
      {d.laedt && <p role="status">Daten werden geladen …</p>}
      {!d.laedt && monate.length === 0 && <Hinweis stufe="info">Noch keine Daten vorhanden. Erfasse zuerst eine Betankung.</Hinweis>}
      {monate.length > 0 && (
        <nav aria-label="Monate mit Daten">
          <ul class="bericht-liste">
            {monate.map((m) => (
              <li key={`${m.jahr}-${m.monat}`}>
                <a href={`#/bericht/${m.jahr}/${m.monat}`}>{MONATE[m.monat - 1]} {m.jahr}</a>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </Seite>
  );
}

function Monat({ jahr, monat }: { jahr: number; monat: number }) {
  const d = useDaten();
  const b: K = useMemo(() => {
    if (!d.eintraege || !d.segmente || !d.einst) return null;
    return monatsBericht(d.eintraege, d.segmente, jahr, monat, d.einst);
  }, [d.eintraege, d.segmente, d.einst, jahr, monat]);

  const vm = monat === 1 ? { jahr: jahr - 1, monat: 12 } : { jahr, monat: monat - 1 };
  const titel = `${MONATE[monat - 1]} ${jahr}`;
  // Kein Segment endet im Monat: «keine Daten» (nicht 0 km / 0.00 CHF). Belegsumme wird separat ausgewiesen.
  const leer = !b || b.segmenteGesamt === 0;

  const kennzahlen = b
    ? [
        { key: 'km', name: 'Gefahrene km', einheit: 'km', dez: 0, akt: g(b, 'km') },
        { key: 'ausgaben', name: 'Ausgaben (Segmentkosten)', einheit: 'CHF', dez: 2, akt: g(b, 'ausgaben') },
        { key: 'verbrauch', name: 'Verbrauch', einheit: 'l/100 km', dez: 2, akt: g(b, 'verbrauch') },
        { key: 'kostenPro100km', name: 'Kosten pro 100 km', einheit: 'CHF/100 km', dez: 2, akt: g(b, 'kostenPro100km') },
      ].map((k) => ({ ...k, vm: g(b.vormonat, k.key), vj: g(b.vorjahr, k.key) }))
    : [];

  return (
    <Seite titel={`Monatsbericht ${titel}`}>
      <div class="bericht-werkzeuge">
        <a class="bericht-zurueck" href="#/bericht">← Alle Monate</a>
        <Knopf onClick={() => window.print()}>Drucken / PDF</Knopf>
      </div>

      {d.fehler && <Hinweis stufe="fehler">{String(d.fehler)}</Hinweis>}
      {d.laedt && <p role="status">Daten werden geladen …</p>}

      {!d.laedt && leer && (
        <Hinweis stufe="info">
          Für {titel} liegen keine Kennzahlen vor: Es endet kein Segment in diesem Monat (dafür braucht es eine Volltankung, die ein Segment abschliesst).
          {b && b.belege.anzahl > 0
            ? ` Belege mit Datum in diesem Monat: ${b.belege.anzahl} (${zahl(b.belege.ausgaben, 2)} CHF, belegbasiert). Sie fliessen in das Segment ein, das später endet.`
            : ' In diesem Monat wurden keine Belege erfasst.'}
        </Hinweis>
      )}

      {!d.laedt && b && !leer && (
        <article class="bericht-seite" aria-label={`Monatsbericht ${titel}`}>
          <header class="bericht-kopf">
            <h2>Tankbuch – Monatsbericht {titel}</h2>
            <p class="bericht-fahrzeug">{d.fahrzeug?.name ?? ''}</p>
          </header>

          <section class="bericht-kacheln" aria-label="Kennzahlen">
            {kennzahlen.map((k) => {
              const dm = deltaText(k.akt, k.vm, k.einheit, k.dez, `ggü. ${MONATE[vm.monat - 1]}`);
              const dj = deltaText(k.akt, k.vj, k.einheit, k.dez, `ggü. ${MONATE[monat - 1]} ${jahr - 1}`);
              return (
                <Kachel
                  key={k.key}
                  titel={k.name}
                  wert={k.akt == null ? '–' : zahl(k.akt, k.dez)}
                  einheit={k.akt == null ? undefined : k.einheit}
                  sub={
                    <span class="bericht-deltas">
                      <span>{dm ? `${dm.pfeil} ${dm.text}` : 'Vormonat: keine Daten'}</span>
                      <span>{dj ? `${dj.pfeil} ${dj.text}` : 'Vorjahresmonat: keine Daten'}</span>
                    </span>
                  }
                >
                  <KennzahlHerleitung k={k.key} b={b} />
                </Kachel>
              );
            })}
          </section>

          <section class="bericht-block" aria-labelledby="b-einordnung">
            <h3 id="b-einordnung">Einordnung</h3>
            <p>{b.text}</p>
            {b.treiber && <p class="bericht-klein">Wichtigster Treiber der Veränderung (gegenüber dem {b.treiberReferenz}): {b.treiber}.</p>}
          </section>

          <section class="bericht-block" aria-labelledby="b-verlauf">
            <h3 id="b-verlauf">CHF pro 100 km, Verlauf {jahr}</h3>
            <MonatsBalken werte={((b.jahresverlauf ?? []) as { kostenPro100km: number | null }[]).map((x) => x.kostenPro100km)} aktiverMonat={monat} jahr={jahr} />
          </section>

          <section class="bericht-block" aria-labelledby="b-tabelle">
            <h3 id="b-tabelle">Vergleich</h3>
            <table class="bericht-tabelle">
              <thead>
                <tr>
                  <th scope="col">Kennzahl</th>
                  <th scope="col" class="zahl">{titel}</th>
                  <th scope="col" class="zahl">{MONATE[vm.monat - 1]} {vm.jahr}</th>
                  <th scope="col" class="zahl">{MONATE[monat - 1]} {jahr - 1}</th>
                </tr>
              </thead>
              <tbody>
                {kennzahlen.map((k) => (
                  <tr key={k.key}>
                    <th scope="row">{k.name} ({k.einheit})</th>
                    <td class="zahl">{k.akt == null ? '–' : zahl(k.akt, k.dez)}</td>
                    <td class="zahl">{k.vm == null ? '–' : zahl(k.vm, k.dez)}</td>
                    <td class="zahl">{k.vj == null ? '–' : zahl(k.vj, k.dez)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {Array.isArray(b.luecken) && b.luecken.length > 0 && (
            <aside class="bericht-luecken" aria-labelledby="b-luecken">
              <h3 id="b-luecken">⚠ Hinweise zu Datenlücken</h3>
              <ul>
                {b.luecken.map((t: string, i: number) => <li key={i}>{t}</li>)}
              </ul>
            </aside>
          )}

          <footer class="bericht-fuss">
            <p>{b.methode}</p>
            <p>Erstellt mit Tankbuch, kein Ersatz für Belege.</p>
          </footer>
        </article>
      )}
    </Seite>
  );
}

function KennzahlHerleitung({ k, b }: { k: string; b: K }) {
  const a = b?.aktuell;
  if (k === 'verbrauch') {
    return (
      <p class="bericht-herleitung">
        Verbrauch = <Bruch zaehler="Σ Liter (gültige Segmente)" nenner="Σ km (gültige Segmente)" /> × 100
        {a && a.kmGueltig > 0 ? <> = <Bruch zaehler={`${zahl(a.literGueltig, 1)} l`} nenner={`${zahl(a.kmGueltig, 0)} km`} /> × 100 = {zahl(a.verbrauch, 2)} l/100 km</> : null}
      </p>
    );
  }
  if (k === 'kostenPro100km') {
    return (
      <p class="bericht-herleitung">
        CHF/100 km = <Bruch zaehler={<>Σ Kosten<Sub>Segmente</Sub></>} nenner="Σ km" /> × 100
        {a && a.kmKosten > 0 ? <> = <Bruch zaehler={`${zahl(a.kostenKosten, 2)} CHF`} nenner={`${zahl(a.kmKosten, 0)} km`} /> × 100 = {zahl(a.kostenPro100km, 2)} CHF/100 km</> : null}
        {a && a.kmKosten < a.km ? <span class="bericht-klein"> Nicht enthalten: {zahl(a.km - a.kmKosten, 0)} km aus unplausiblen oder nicht eingerechneten geschätzten Segmenten.</span> : null}
      </p>
    );
  }
  if (k === 'km') return <p class="bericht-herleitung">Σ km der Segmente, die im Monat enden (Voll- zu Volltankung){a ? `: ${zahl(a.km, 0)} km aus ${a.segmenteGesamt} Segment(en)` : ''}.</p>;
  return <p class="bericht-herleitung">Ausgaben (Segmentkosten) = Σ Kosten aller Segmente, die im Monat enden{a ? `: ${zahl(a.ausgaben, 2)} CHF` : ''}. Das ist nicht die Summe der Belege des Monats (siehe Tankbuch).</p>;
}

export default function Bericht() {
  useRoute(); // Re-Render bei Routenwechsel
  const p = parseBerichtHash(typeof window !== 'undefined' ? window.location.hash : '');
  return p ? <Monat jahr={p.jahr} monat={p.monat} /> : <Liste />;
}
