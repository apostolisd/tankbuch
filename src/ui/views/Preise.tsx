import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Tankvorgang } from '../../core/types';
import { eintraegeImZeitraum, belegKennzahlen } from '../../core/kennzahlen';
import { preisAnalyse } from '../../core/preise';
import * as daten from '../../lib/data';
import { useDaten } from '../../lib/store';
import { datum, zahl } from '../../lib/format';
import { Seite, Kachel, ZeitraumWahl, useZeitraum, Hinweis } from '../components';
import { aliasMapKlein, wendeAliasAn } from '../capture/logik';
import Punkte from '../charts/Punkte';
import './preise.css';

export type AliasMap = Record<string, string>;

/** Alias-Antwort (Array {von,nach} oder Objekt) tolerant in eine Map (Schlüssel klein) umwandeln. */
export function aliasMapVon(roh: unknown): AliasMap {
  return aliasMapKlein(roh);
}

/** Tankstellennamen normalisieren: Alias anwenden (auch Ketten a→b→c), Leerraum bereinigen, leer -> «Unbekannt». */
export function normalisiereNamen(e: Tankvorgang[], aliase: AliasMap): Tankvorgang[] {
  return e.map((x) => ({ ...x, tankstelle: wendeAliasAn(x.tankstelle, aliase) ?? 'Unbekannt' }));
}

const ch = (n: number, d = 2) => zahl(n, d);

export default function Preise() {
  const d = useDaten();
  const [zeitraum] = useZeitraum();
  const [aliase, setAliase] = useState<AliasMap>({});

  useEffect(() => {
    let abgebrochen = false;
    const f = (daten as unknown as Record<string, unknown>).holeAliase;
    if (typeof f === 'function') {
      Promise.resolve((f as () => Promise<unknown>)())
        .then((r) => { if (!abgebrochen) setAliase(aliasMapVon(r)); })
        .catch(() => { /* Aliase optional */ });
    }
    return () => { abgebrochen = true; };
  }, []);

  const auswertung = useMemo(() => {
    const norm = normalisiereNamen(d.eintraege ?? [], aliase);
    const imZ = eintraegeImZeitraum(norm, zeitraum);
    return { imZ, analyse: preisAnalyse(norm, zeitraum), beleg: belegKennzahlen(norm, zeitraum) };
  }, [d.eintraege, aliase, zeitraum]);

  const { analyse, beleg, imZ } = auswertung;
  const punkte = analyse.punkte.map((p) => ({
    ...p,
    titel:
      `${datum(p.datum)}, ${p.tankstelle}: ${ch(p.preisChf, 3)} CHF/l` +
      (p.fremdwaehrung ? ` (Beleg in ${p.fremdwaehrung}, in CHF umgerechnet)` : '') +
      (p.geschaetzt ? ' (geschätzter Beleg, nicht in Ø und Tabelle)' : ''),
  }));

  return (
    <Seite titel="Preise">
      <ZeitraumWahl />
      <div class="preise">
        {d.fehler && <Hinweis stufe="fehler">{String(d.fehler)}</Hinweis>}
        {d.laedt && <p role="status">Daten werden geladen …</p>}
        {!d.laedt && (d.eintraege ?? []).length === 0 && (
          <Hinweis stufe="info">Noch keine Betankungen erfasst. Sobald Belege vorliegen, erscheint hier die Preisanalyse.</Hinweis>
        )}
        {!d.laedt && (d.eintraege ?? []).length > 0 && analyse.punkte.length === 0 && (
          <Hinweis stufe="info">
            Im gewählten Zeitraum gibt es keine Betankungen{imZ.length > 0 ? ' mit Literangabe' : ''}. Wähle einen anderen Zeitraum.
          </Hinweis>
        )}

        {analyse.punkte.length > 0 && (
          <>
            <section class="preise-block" aria-labelledby="preise-diagramm">
              <h2 id="preise-diagramm">Preis pro Liter</h2>
              <Punkte
                punkte={punkte}
                gruppen={analyse.gruppen}
                durchschnitt={analyse.durchschnitt}
                von={zeitraum.von}
                bis={zeitraum.bis}
              />
              <p class="preise-klein">
                Gestrichelte Linie: Durchschnitt des Zeitraums
                {analyse.durchschnitt != null ? ` (${ch(analyse.durchschnitt, 3)} CHF/l)` : ''}. Preise in CHF (Betrag in CHF ÷ Liter),
                Durchschnitt = Σ Betrag in CHF ÷ Σ Liter der nicht geschätzten Belege.
              </p>
              {analyse.geschaetztAusgenommen > 0 && (
                <p class="preise-klein">
                  <span aria-hidden="true">⚠ </span>
                  {analyse.geschaetztAusgenommen} {analyse.geschaetztAusgenommen === 1 ? 'geschätzter Beleg ist' : 'geschätzte Belege sind'} im Diagramm hohl
                  markiert, aber nicht in Durchschnitt, Tabelle, «günstigste Tankstelle» und Ersparnis enthalten (der Preis ist frei geschätzt).
                </p>
              )}
              {analyse.fremdBerechnet > 0 && (
                <p class="preise-klein">
                  {analyse.fremdBerechnet} {analyse.fremdBerechnet === 1 ? 'Beleg' : 'Belege'} in Fremdwährung, mit dem erfassten Kurs in CHF umgerechnet
                  (siehe unten).
                </p>
              )}
            </section>

            {analyse.guenstigste && (
              <Kachel
                titel={`Hättest du immer bei ${analyse.guenstigste} getankt`}
                wert={`−${ch(analyse.ersparnis)}`}
                einheit="CHF"
                sub={`Nur Preisunterschied; ohne geschätzte Belege${analyse.geschaetztAusgenommen > 0 ? ` (${analyse.geschaetztAusgenommen} ausgenommen)` : ''}.`}
              >
                <div class="preise-herleitung">
                  <p>
                    Mehrkosten je Tankstelle = Liter × (Ø Preis der Tankstelle − Ø Preis bei «{analyse.guenstigste}»). Die Summe ergibt die
                    mögliche Ersparnis:
                  </p>
                  <ul>
                    {analyse.tabelle
                      .filter((t) => t.tankstelle !== analyse.guenstigste)
                      .map((t) => (
                        <li key={t.tankstelle}>
                          {t.tankstelle}: {ch(t.liter, 1)} l × {ch(t.diffZurGuenstigsten, 3)} CHF/l = {ch(t.mehrkosten)} CHF
                        </li>
                      ))}
                  </ul>
                  <p class="preise-klein">
                    Nicht berücksichtigt: Umweg und Fahrzeit zur günstigsten Tankstelle, Standortunterschiede (Autobahn, Region),
                    Komfort, Öffnungszeiten, Treibstoffqualität.
                  </p>
                </div>
              </Kachel>
            )}

            <section class="preise-block" aria-labelledby="preise-tabelle">
              <h2 id="preise-tabelle">Je Tankstelle</h2>
              <div class="preise-tabelle-wrap preise-tabelle-gross">
                <table class="preise-tabelle">
                  <thead>
                    <tr>
                      <th scope="col">Tankstelle</th>
                      <th scope="col" class="zahl">Betankungen</th>
                      <th scope="col" class="zahl">Liter</th>
                      <th scope="col" class="zahl">Ø Preis (CHF/l)</th>
                      <th scope="col" class="zahl">Differenz zur günstigsten</th>
                      <th scope="col" class="zahl">Mehrkosten (CHF)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analyse.tabelle.map((t) => {
                      const g = t.tankstelle === analyse.guenstigste;
                      return (
                        <tr key={t.tankstelle}>
                          <th scope="row">
                            {t.tankstelle}
                            {g && <span class="preise-tag"> ✓ günstigste</span>}
                          </th>
                          <td class="zahl">{t.anzahl}</td>
                          <td class="zahl">{ch(t.liter, 1)}</td>
                          <td class="zahl">{ch(t.preisSchnitt, 3)}</td>
                          <td class="zahl">{g ? '–' : `+${ch(t.diffZurGuenstigsten, 3)}`}</td>
                          <td class="zahl">{g ? '–' : ch(t.mehrkosten)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ul class="preise-karten" aria-label="Je Tankstelle (Kartenliste)">
                {analyse.tabelle.map((t) => {
                  const g = t.tankstelle === analyse.guenstigste;
                  return (
                    <li key={t.tankstelle} class="preise-karte">
                      <div class="preise-karte-kopf">
                        <strong>{t.tankstelle}</strong>
                        {g && <span class="preise-tag">✓ günstigste</span>}
                      </div>
                      <dl>
                        <div><dt>Betankungen</dt><dd>{t.anzahl}</dd></div>
                        <div><dt>Liter</dt><dd>{ch(t.liter, 1)}</dd></div>
                        <div><dt>Ø Preis</dt><dd>{ch(t.preisSchnitt, 3)} CHF/l</dd></div>
                        <div><dt>Differenz zur günstigsten</dt><dd>{g ? '–' : `+${ch(t.diffZurGuenstigsten, 3)} CHF/l`}</dd></div>
                        <div><dt>Mehrkosten</dt><dd>{g ? '–' : `${ch(t.mehrkosten)} CHF`}</dd></div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}

        {beleg.fremdwaehrung.length > 0 && (
          <section class="preise-block" aria-labelledby="preise-fremd">
            <h2 id="preise-fremd">Belege in Fremdwährung</h2>
            <p class="preise-klein">
              Belege in Fremdwährung sind in Diagramm, Tabelle und Durchschnitt enthalten: Der Preis je Liter ist Betrag in CHF ÷ Liter,
              umgerechnet mit dem beim Erfassen eingetragenen Wechselkurs (ohne geschätzte Belege in Tabelle und Durchschnitt).
            </p>
            <ul class="preise-fremd">
              {beleg.fremdwaehrung.map((f) => (
                <li key={f.waehrung}>
                  {f.anzahl} {f.anzahl === 1 ? 'Beleg' : 'Belege'} in {f.waehrung}: {ch(f.betragOriginal)} {f.waehrung} ≙ {ch(f.betragChf)} CHF
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Seite>
  );
}
