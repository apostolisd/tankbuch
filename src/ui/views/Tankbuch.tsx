// Tankbuch (SPEC 8.1): Kennzahlen mit Herleitung, Tabelle/Kartenliste, CSV-Export.
import type { JSX } from 'preact';
import { belegKennzahlen, eintraegeImZeitraum, segmentKennzahlen, segmenteImZeitraum, verwaisteMarkierungen, zaehltImDurchschnitt } from '../../core';
import type { Segment, Tankvorgang } from '../../core/types';
import { useDaten } from '../../lib/store';
import { datum, zahl } from '../../lib/format';
import { Bruch, Hinweis, Kachel, Knopf, Seite, ZeitraumWahl } from '../components';
import { useZeitraum } from '../../lib/store';
import { csvExport, dateiname } from './csv';
import { kostenBasis, kostenBasisText, type KostenBasis } from './herleitung';
import { STATUS_LABEL, segmentGrund } from './segmentText';
import './tankbuch.css';

const KEIN_WERT = '–';

function lade(text: string, datei: string) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = datei;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

interface ZeilenInfo {
  e: Tankvorgang;
  seg: Segment | null;
  /** Teilbetankung: Segment, zu dem sie gehört */
  teil: boolean;
  /** erste Volltankung im Bestand (eröffnet nur das erste Segment) */
  erste: boolean;
}

function zeilenInfos(eintraege: Tankvorgang[], segmente: Segment[]): ZeilenInfo[] {
  const endeZu = new Map<string, Segment>();
  const teilZu = new Map<string, Segment>();
  for (const s of segmente) {
    endeZu.set(s.endId, s);
    for (const id of s.teilIds) teilZu.set(id, s);
  }
  return eintraege.map((e) => {
    const teil = !e.volltankung;
    const seg = teil ? teilZu.get(e.id) ?? null : endeZu.get(e.id) ?? null;
    return { e, seg, teil, erste: !teil && !seg };
  });
}

function SegmentZelle({ z, einstMit }: { z: ZeilenInfo; einstMit: boolean }): JSX.Element {
  if (z.teil) {
    return (
      <span>
        Teilbetankung{z.seg ? <>: gehört zu Segment {datum(z.seg.enddatum)}</> : ': noch kein abschliessendes Segment'}
      </span>
    );
  }
  if (!z.seg) return <span>Erste Volltankung: eröffnet das erste Segment</span>;
  const s = z.seg;
  const v = s.verbrauch;
  return (
    <span>
      {zahl(s.km, 0)} km ·{' '}
      {v === null ? (
        <span>{KEIN_WERT} l/100 km</span>
      ) : (
        <span>
          {zahl(v, 2)} l/100 km
          {s.status === 'geschaetzt' && !einstMit ? ' (zählt nicht im Durchschnitt)' : ''}
        </span>
      )}
    </span>
  );
}

function StatusZelle({ z }: { z: ZeilenInfo }): JSX.Element {
  const teile: JSX.Element[] = [];
  if (z.e.geschaetzt) {
    teile.push(
      <span class="tb-warn" key="g">
        <span aria-hidden="true">⚠ </span>Geschätzt: Eintrag ohne Beleg
      </span>,
    );
  }
  if (z.seg && !z.teil && z.seg.status !== 'gueltig') {
    teile.push(
      <span class="tb-warn" key="s">
        <span aria-hidden="true">⚠ </span>
        {STATUS_LABEL[z.seg.status][0].toUpperCase() + STATUS_LABEL[z.seg.status].slice(1)}: {segmentGrund(z.seg)}
      </span>,
    );
  }
  if (z.seg && !z.teil && z.seg.status === 'gueltig' && !z.e.geschaetzt) {
    teile.push(
      <span class="tb-ok" key="ok">
        <span aria-hidden="true">✓ </span>Gültig
      </span>,
    );
  }
  if (teile.length === 0) teile.push(<span key="n">{z.teil ? 'Teil' : KEIN_WERT}</span>);
  return <>{teile}</>;
}

/** Erklärt, welche Segmente bei den Kosten fehlen (Σ km der Kosten ≠ «Gefahrene km»). */
function KostenHerleitung({ basis, einst }: { basis: KostenBasis; einst: Parameters<typeof kostenBasisText>[0] }): JSX.Element {
  return (
    <>
      <p class="tb-n">Segmentbasiert: Kosten und km der {kostenBasisText(einst)} mit Enddatum im Zeitraum.</p>
      {basis.fehlend.length > 0 && (
        <>
          <p class="tb-n">
            Nicht enthalten (Σ km {zahl(basis.km, 0)} statt {zahl(basis.kmAlle, 0)} km «Gefahrene km»), weil sie nicht zur Kostenbasis zählen
            (bei unplausiblen Segmenten fehlt vermutlich ein Beleg, die Kosten wären zu tief):
          </p>
          <ul class="tb-liste">
            {basis.fehlend.map((a) => (
              <li key={a.endId}>
                <span aria-hidden="true">⚠ </span>
                Segment bis {datum(a.enddatum)} ({zahl(a.km, 0)} km, {zahl(a.kosten, 2)} CHF): {segmentGrund(a)}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function gehe(id: string) {
  location.hash = `#/eintrag/${id}`;
}

export default function Tankbuch(): JSX.Element {
  const daten = useDaten();
  const [zeitraum, setZeitraum, preset] = useZeitraum();

  const kopf = (
    <div class="tb-kopf">
      <ZeitraumWahl wert={zeitraum} preset={preset} onChange={setZeitraum} />
    </div>
  );

  if (daten.laedt) {
    return (
      <Seite titel="Tankbuch">
        {kopf}
        <p role="status" class="tb-zustand">Tankbuch wird geladen …</p>
      </Seite>
    );
  }
  if (daten.fehler) {
    const msg = typeof daten.fehler === 'string' ? daten.fehler : (daten.fehler as Error).message;
    return (
      <Seite titel="Tankbuch">
        {kopf}
        <Hinweis stufe="fehler">Das Tankbuch konnte nicht geladen werden: {msg}</Hinweis>
        <Knopf onClick={() => daten.neuLaden()}>Erneut versuchen</Knopf>
      </Seite>
    );
  }

  const { eintraege, segmente, einst } = daten;
  const imZ = eintraegeImZeitraum(eintraege, zeitraum)
    .slice()
    .sort((a, b) => (a.datum === b.datum ? b.km_stand - a.km_stand : a.datum < b.datum ? 1 : -1));

  if (eintraege.length === 0) {
    return (
      <Seite titel="Tankbuch">
        {kopf}
        <div class="tb-zustand" role="status">
          <p>Noch keine Einträge vorhanden.</p>
          <p><a class="tb-link" href="#/erfassen">Erste Betankung erfassen</a></p>
        </div>
      </Seite>
    );
  }

  const bel = belegKennzahlen(eintraege, zeitraum);
  const sk = segmentKennzahlen(segmente, zeitraum, einst);
  const basis = kostenBasis(segmente, zeitraum, einst);
  const verwaist = verwaisteMarkierungen(segmente, einst);
  const nGeschaetztEingerechnet = segmenteImZeitraum(segmente, zeitraum).filter(
    (x) => x.status === 'geschaetzt' && zaehltImDurchschnitt(x, einst),
  ).length;
  const infos = zeilenInfos(imZ, segmente);
  const nSeg =
    `${sk.segmenteGueltig} von ${sk.segmenteGesamt} Segmenten gültig` +
    (nGeschaetztEingerechnet > 0 ? ` (davon ${nGeschaetztEingerechnet} geschätzt, eingerechnet)` : '');
  const keinVerbrauchGrund =
    sk.segmenteGesamt === 0
      ? 'Kein Segment endet im Zeitraum (mindestens zwei Volltankungen nötig).'
      : 'Kein gültiges Segment im Zeitraum.';

  const ausgeschlossen = (
    <>
      <p class="tb-n">{nSeg}</p>
      {sk.ausgeschlossen.length > 0 && (
        <>
          <p class="tb-n">Ausgeschlossene Segmente:</p>
          <ul class="tb-liste">
            {sk.ausgeschlossen.map((a) => (
              <li key={a.segment.endId}>
                <span aria-hidden="true">⚠ </span>
                Segment bis {datum(a.segment.enddatum)} ({zahl(a.segment.km, 0)} km, {zahl(a.segment.liter, 1)} l): {a.grund}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );

  return (
    <Seite titel="Tankbuch">
      {kopf}
      {verwaist.length > 0 && (
        <Hinweis stufe="warnung">
          {verwaist.length === 1 ? 'Eine Markierung «unvollständig» passt' : `${verwaist.length} Markierungen «unvollständig» passen`} zu
          keinem Segment mehr (z.B. nach dem Einfügen oder Löschen eines Eintrags). <a class="tb-link" href="#/einstellungen">In den
          Einstellungen prüfen und entfernen.</a>
        </Hinweis>
      )}
      <section class="tb-kacheln" aria-label="Kennzahlen">
        <Kachel
          titel="Verbrauch"
          hero
          wert={sk.verbrauch !== null ? zahl(sk.verbrauch, 2) : KEIN_WERT}
          einheit={sk.verbrauch !== null ? 'l/100 km' : undefined}
          sub={sk.verbrauch !== null ? `segmentbasiert, ${nSeg}` : keinVerbrauchGrund}
          warnung={sk.ausgeschlossen.length > 0 ? `${sk.ausgeschlossen.length} Segment(e) ausgeschlossen` : undefined}
        >
          <p class="tb-n">
            Segmentbasiert: nur gültige Segmente{einst.geschaetzteMitrechnen ? ' (und geschätzte, da «geschätzte Einträge mitrechnen» aktiv ist)' : ''} mit
            Enddatum im Zeitraum.
          </p>
          {sk.verbrauch !== null ? (
            <div class="tb-formel">
              <Bruch zaehler={`Σ Liter (gültige Segmente) = ${zahl(sk.literGueltig, 1)} l`} nenner={`Σ km (gültige Segmente) = ${zahl(sk.kmGueltig, 0)} km`} />
              × 100 = {zahl(sk.verbrauch, 2)} l/100 km
            </div>
          ) : (
            <p class="tb-formel">{KEIN_WERT}: {keinVerbrauchGrund}</p>
          )}
          {ausgeschlossen}
        </Kachel>

        <Kachel
          titel="Gefahrene km"
          wert={sk.segmenteGesamt > 0 ? zahl(sk.km, 0) : KEIN_WERT}
          einheit="km"
          sub={sk.segmenteGesamt > 0 ? `segmentbasiert, ${sk.segmenteGesamt} Segmente` : 'Kein Segment im Zeitraum'}
        >
          <p class="tb-n">Segmentbasiert: Σ km aller Segmente, deren Enddatum im Zeitraum liegt.</p>
          <p class="tb-formel">Σ km = {zahl(sk.km, 0)} km aus {sk.segmenteGesamt} Segmenten</p>
          {ausgeschlossen}
        </Kachel>

        <Kachel
          titel="Getankte Liter"
          wert={zahl(bel.liter, 1)}
          einheit="l"
          sub={`belegbasiert, ${bel.anzahl} Belege`}
        >
          <p class="tb-n">Belegbasiert: Σ Liter aller Belege mit Datum im Zeitraum.</p>
          <p class="tb-formel">
            {bel.anzahl} Belege, davon {bel.teilbetankungen} Teilbetankungen, {bel.geschaetzt} geschätzt
          </p>
        </Kachel>

        <Kachel
          titel="Ausgaben"
          wert={zahl(bel.ausgaben, 2)}
          einheit="CHF"
          sub={`belegbasiert, ${bel.anzahl} Belege`}
        >
          <p class="tb-n">Belegbasiert: Σ Betrag (CHF) aller Belege mit Datum im Zeitraum.</p>
          {bel.preisProLiter !== null && (
            <div class="tb-formel">
              Ø Preis pro Liter = Σ Betrag (CHF) ÷ Σ Liter aller Belege:
              <Bruch zaehler={`${zahl(bel.ausgaben, 2)} CHF`} nenner={`${zahl(bel.liter, 1)} l`} />
              = {zahl(bel.preisProLiter, 3)} CHF/l
            </div>
          )}
          {bel.fremdwaehrung.length > 0 && (
            <p class="tb-n">
              Belege in Fremdwährung sind in CHF umgerechnet (betrag_chf) in den Summen oben enthalten:
            </p>
          )}
          {bel.fremdwaehrung.map((f) => (
            <p class="tb-n" key={f.waehrung}>
              {f.anzahl} {f.anzahl === 1 ? 'Beleg' : 'Belege'} in {f.waehrung}: {zahl(f.betragOriginal, 2)} {f.waehrung} = {zahl(f.betragChf, 2)} CHF
            </p>
          ))}
        </Kachel>

        <Kachel
          titel="Kosten pro km"
          wert={sk.rpProKm !== null ? zahl(sk.rpProKm, 1) : KEIN_WERT}
          einheit={sk.rpProKm !== null ? 'Rp./km' : undefined}
          sub={sk.rpProKm !== null ? 'segmentbasiert' : keinVerbrauchGrund}
        >
          <KostenHerleitung basis={basis} einst={einst} />
          {sk.rpProKm !== null ? (
            <div class="tb-formel">
              <Bruch zaehler={`Σ Kosten = ${zahl(basis.kosten, 2)} CHF`} nenner={`Σ km = ${zahl(basis.km, 0)} km`} />
              × 100 = {zahl(sk.rpProKm, 1)} Rp./km
            </div>
          ) : (
            <p class="tb-formel">{KEIN_WERT}: {keinVerbrauchGrund}</p>
          )}
          <p class="tb-n">Rp. pro km entspricht CHF pro 100 km.</p>
        </Kachel>

        <Kachel
          titel="Kosten pro 100 km"
          wert={sk.kostenPro100km !== null ? zahl(sk.kostenPro100km, 2) : KEIN_WERT}
          einheit={sk.kostenPro100km !== null ? 'CHF/100 km' : undefined}
          sub={sk.kostenPro100km !== null ? 'segmentbasiert' : keinVerbrauchGrund}
        >
          <KostenHerleitung basis={basis} einst={einst} />
          {sk.kostenPro100km !== null ? (
            <div class="tb-formel">
              <Bruch zaehler={`Σ Kosten = ${zahl(basis.kosten, 2)} CHF`} nenner={`Σ km = ${zahl(basis.km, 0)} km`} />
              × 100 = {zahl(sk.kostenPro100km, 2)} CHF/100 km
            </div>
          ) : (
            <p class="tb-formel">{KEIN_WERT}: {keinVerbrauchGrund}</p>
          )}
        </Kachel>
      </section>

      <section aria-label="Einträge" class="tb-eintraege">
        <div class="tb-leiste">
          <h2 class="tb-h2">Einträge ({imZ.length})</h2>
          <Knopf onClick={() => lade(csvExport(imZ, segmente), dateiname(zeitraum.von, zeitraum.bis))}>CSV exportieren</Knopf>
        </div>

        {imZ.length === 0 ? (
          <p class="tb-zustand" role="status">Keine Einträge im gewählten Zeitraum.</p>
        ) : (
          <>
            <div class="tb-tabellenbox">
              <table class="tb-tabelle">
                <caption class="tb-nur-sr">Tankeinträge im Zeitraum, neueste zuerst. Zeile anwählen, um den Eintrag zu bearbeiten.</caption>
                <thead>
                  <tr>
                    <th scope="col">Datum</th>
                    <th scope="col" class="r">km-Stand</th>
                    <th scope="col" class="r">Liter</th>
                    <th scope="col" class="r">Preis</th>
                    <th scope="col" class="r">Betrag</th>
                    <th scope="col">Tankstelle</th>
                    <th scope="col">Voll</th>
                    <th scope="col">Segment (km · l/100 km)</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {infos.map((z) => (
                    <tr key={z.e.id} class="tb-zeile" onClick={() => gehe(z.e.id)}>
                      <td><a href={`#/eintrag/${z.e.id}`} class="tb-link" onClick={(ev) => ev.stopPropagation()}>{datum(z.e.datum)}</a></td>
                      <td class="r">{zahl(z.e.km_stand, 0)}</td>
                      <td class="r">{zahl(z.e.liter, 2)}</td>
                      <td class="r">{zahl(z.e.preis_pro_liter, 3)}{z.e.waehrung !== 'CHF' ? ` ${z.e.waehrung}` : ''}</td>
                      <td class="r">{zahl(z.e.betrag_chf, 2)}{z.e.waehrung !== 'CHF' ? ` (${zahl(z.e.betrag, 2)} ${z.e.waehrung})` : ''}</td>
                      <td>{z.e.tankstelle ?? KEIN_WERT}</td>
                      <td>{z.e.volltankung ? 'Ja' : 'Nein (Teil)'}</td>
                      <td><SegmentZelle z={z} einstMit={einst.geschaetzteMitrechnen} /></td>
                      <td><StatusZelle z={z} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul class="tb-karten">
              {infos.map((z) => (
                <li key={z.e.id}>
                  <a class="tb-karte" href={`#/eintrag/${z.e.id}`} aria-label={`Eintrag vom ${datum(z.e.datum)} bearbeiten`}>
                    <div class="tb-karte-kopf">
                      <strong>{datum(z.e.datum)}</strong>
                      <span>{zahl(z.e.betrag_chf, 2)} CHF</span>
                    </div>
                    <div>{zahl(z.e.liter, 2)} l · {zahl(z.e.preis_pro_liter, 3)} {z.e.waehrung}/l · {zahl(z.e.km_stand, 0)} km</div>
                    <div>{z.e.tankstelle ?? KEIN_WERT} · {z.e.volltankung ? 'Volltankung' : 'Teilbetankung'}</div>
                    <div class="tb-karte-seg"><SegmentZelle z={z} einstMit={einst.geschaetzteMitrechnen} /></div>
                    <div class="tb-karte-status"><StatusZelle z={z} /></div>
                  </a>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </Seite>
  );
}
