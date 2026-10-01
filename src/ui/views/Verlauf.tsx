// Verlauf (SPEC 8.2): Diagramm mit Umschalter, Saisonvergleich, Ausreisser, Vergleich zweier Zeiträume.
import { useMemo, useState } from 'preact/hooks';
import type { JSX } from 'preact';
import {
  AUSREISSER_FAKTOR,
  GLEITEND_FENSTER,
  ausgabenProMonat,
  eintraegeImZeitraum,
  saisonvergleich,
  vergleicheZeitraeume,
  verbrauchsReihe,
  vorherigerZeitraum,
} from '../../core';
import type { Zeitraum } from '../../core/types';
import { useDaten } from '../../lib/store';
import { datum, zahl } from '../../lib/format';
import { Hinweis, Kachel, Knopf, Seite, ZeitraumWahl } from '../components';
import { useZeitraum } from '../../lib/store';
import BalkenLinie, { type BalkenDatum } from '../charts/BalkenLinie';
import { segmentGrund } from './segmentText';
import './verlauf.css';

type Modus = 'verbrauch' | 'preis' | 'ausgaben';
const KEIN = '–';

const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const AUSREISSER_PROZENT = Math.round((AUSREISSER_FAKTOR - 1) * 100);
const AUSREISSER_TEXT = `mehr als ${AUSREISSER_PROZENT} % über dem Mittel der bis zu ${GLEITEND_FENSTER} vorangehenden gültigen Segmente`;
const kurz = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

function differenz(a: number | null, b: number | null, dez: number, einheit: string): string {
  if (a === null || b === null) return KEIN;
  const d = b - a;
  if (Math.abs(d) < Math.pow(10, -dez) / 2) return `unverändert`;
  return `${d > 0 ? '▲ +' : '▼ −'}${zahl(Math.abs(d), dez)} ${einheit} (${d > 0 ? 'B höher' : 'B tiefer'})`;
}

export default function Verlauf(): JSX.Element {
  const daten = useDaten();
  const [zeitraum, setZeitraum, preset] = useZeitraum();
  const [modus, setModus] = useState<Modus>('verbrauch');
  const [a, setA] = useState<Zeitraum>(() => vorherigerZeitraum(zeitraum));
  const [b, setB] = useState<Zeitraum>(zeitraum);

  const kopf = (
    <div class="vl-kopf">
      <ZeitraumWahl wert={zeitraum} preset={preset} onChange={setZeitraum} />
    </div>
  );

  if (daten.laedt) {
    return <Seite titel="Verlauf">{kopf}<p role="status" class="vl-zustand">Verlauf wird geladen …</p></Seite>;
  }
  if (daten.fehler) {
    const msg = typeof daten.fehler === 'string' ? daten.fehler : (daten.fehler as Error).message;
    return (
      <Seite titel="Verlauf">
        {kopf}
        <Hinweis stufe="fehler">Der Verlauf konnte nicht geladen werden: {msg}</Hinweis>
        <Knopf onClick={() => daten.neuLaden()}>Erneut versuchen</Knopf>
      </Seite>
    );
  }
  if (daten.eintraege.length === 0) {
    return (
      <Seite titel="Verlauf">
        {kopf}
        <div class="vl-zustand" role="status">
          <p>Noch keine Einträge vorhanden.</p>
          <p><a href="#/erfassen">Erste Betankung erfassen</a></p>
        </div>
      </Seite>
    );
  }

  const { eintraege, segmente, einst } = daten;
  return (
    <Seite titel="Verlauf">
      {kopf}
      <Inhalt
        eintraege={eintraege}
        segmente={segmente}
        einst={einst}
        zeitraum={zeitraum}
        modus={modus}
        setModus={setModus}
        a={a}
        b={b}
        setA={setA}
        setB={setB}
      />
    </Seite>
  );
}

type DatenT = ReturnType<typeof useDaten>;
interface InhaltProps {
  eintraege: DatenT['eintraege'];
  segmente: DatenT['segmente'];
  einst: DatenT['einst'];
  zeitraum: Zeitraum;
  modus: Modus;
  setModus: (m: Modus) => void;
  a: Zeitraum;
  b: Zeitraum;
  setA: (z: Zeitraum) => void;
  setB: (z: Zeitraum) => void;
}

function Inhalt(p: InhaltProps): JSX.Element {
  const { eintraege, segmente, einst, zeitraum, modus, a, b } = p;
  const reiheAlle = useMemo(() => verbrauchsReihe(segmente, einst, eintraege), [segmente, einst, eintraege]);
  const reihe = reiheAlle.filter((r) => r.segment.enddatum >= zeitraum.von && r.segment.enddatum <= zeitraum.bis);
  const jahr = Number(zeitraum.bis.slice(0, 4));
  const saison = useMemo(() => saisonvergleich(segmente, einst, jahr), [segmente, einst, jahr]);
  const ausreisser = reihe.filter((r) => r.ausreisser);
  const vergleich = useMemo(() => vergleicheZeitraeume(eintraege, segmente, a, b, einst), [eintraege, segmente, a, b, einst]);

  const diagramm = useMemo(() => {
    if (modus === 'verbrauch') {
      const d: BalkenDatum[] = reihe.map((r) => ({
        id: r.segment.endId,
        label: kurz(r.segment.enddatum),
        titel: `Segment bis ${datum(r.segment.enddatum)} (${zahl(r.segment.km, 0)} km, ${zahl(r.segment.liter, 1)} l)`,
        wert: r.luecke ? null : r.wert,
        linie: r.gleitend,
        luecke: r.luecke || r.wert === null,
        lueckeGrund: r.luecke || r.wert === null ? segmentGrund(r.segment) : null,
        ausreisser: r.ausreisser,
        notiz: r.notiz,
        zusatz:
          r.ausreisser && r.wert !== null && r.referenz !== null
            ? [`+${zahl((r.wert / r.referenz - 1) * 100, 0)} % über dem Mittel der ${r.referenzAnzahl} Vorgänger (${zahl(r.referenz, 2)} l/100 km)`]
            : undefined,
      }));
      return { d, einheit: 'l/100 km', balken: 'Verbrauch je Segment', linie: `Gleitendes Mittel (${GLEITEND_FENSTER} gültige Segmente)`, dez: 1, leer: 'Kein Segment endet im gewählten Zeitraum.' };
    }
    if (modus === 'preis') {
      const d: BalkenDatum[] = eintraegeImZeitraum(eintraege, zeitraum)
        .slice()
        .sort((x, y) => (x.datum === y.datum ? x.km_stand - y.km_stand : x.datum < y.datum ? -1 : 1))
        .map((e) => ({
          id: e.id,
          label: kurz(e.datum),
          titel: `Beleg vom ${datum(e.datum)}${e.tankstelle ? `, ${e.tankstelle}` : ''}`,
          wert: e.liter > 0 ? e.betrag_chf / e.liter : null,
          luecke: e.liter <= 0,
          lueckeGrund: 'Liter fehlen',
          notiz: e.notiz,
          zusatz: e.geschaetzt ? ['⚠ Geschätzter Eintrag ohne Beleg'] : undefined,
        }));
      return { d, einheit: 'CHF/l', balken: 'Preis pro Liter (pro Beleg)', linie: undefined, dez: 2, leer: 'Keine Belege im gewählten Zeitraum.' };
    }
    const notizen = new Map<string, string[]>();
    for (const e of eintraegeImZeitraum(eintraege, zeitraum)) {
      if (e.notiz) {
        const k = e.datum.slice(0, 7);
        notizen.set(k, [...(notizen.get(k) ?? []), `${datum(e.datum)}: ${e.notiz}`]);
      }
    }
    const d: BalkenDatum[] = ausgabenProMonat(eintraege, zeitraum).map((m) => {
      const [jj, mm] = m.monat.split('-').map(Number);
      const n = notizen.get(m.monat);
      return {
        id: m.monat,
        label: `${String(mm).padStart(2, '0')}.${String(jj).slice(2)}`,
        titel: `${MONATE[mm - 1]} ${jj}`,
        wert: m.ausgaben,
        notiz: n ? n.join(' | ') : null,
      };
    });
    return { d, einheit: 'CHF', balken: 'Ausgaben pro Monat (Belegdatum)', linie: undefined, dez: 0, leer: 'Keine Ausgaben im gewählten Zeitraum.' };
  }, [modus, reihe, eintraege, zeitraum]);

  const fmt = (n: number) => zahl(n, diagramm.dez === 0 && Math.abs(n) < 10 ? 0 : diagramm.dez);
  const modi: { id: Modus; text: string }[] = [
    { id: 'verbrauch', text: 'Verbrauch' },
    { id: 'preis', text: 'Preis pro Liter' },
    { id: 'ausgaben', text: 'Ausgaben pro Monat' },
  ];
  const seasonDiff =
    saison.winter.verbrauch !== null && saison.sommer.verbrauch !== null
      ? saison.winter.verbrauch - saison.sommer.verbrauch
      : null;

  return (
    <>
      <section class="vl-diagramm" aria-label="Diagramm">
        <div class="vl-umschalter" role="group" aria-label="Darstellung wählen">
          {modi.map((m) => (
            <button key={m.id} type="button" class="vl-modus" aria-pressed={modus === m.id} onClick={() => p.setModus(m.id)}>
              {modus === m.id ? '● ' : '○ '}
              {m.text}
            </button>
          ))}
        </div>
        <BalkenLinie
          daten={diagramm.d}
          formatWert={fmt}
          einheit={diagramm.einheit}
          balkenName={diagramm.balken}
          linieName={diagramm.linie}
          titel={`${diagramm.balken} von ${datum(zeitraum.von)} bis ${datum(zeitraum.bis)}`}
          leerText={diagramm.leer}
          ausreisserName={modus === 'verbrauch' ? AUSREISSER_TEXT : undefined}
        />
        {modus === 'verbrauch' && reihe.some((r) => r.luecke) && (
          <p class="vl-fussnote">
            Lücken (gestrichelt, «?») sind Segmente ohne gültigen Verbrauch. Das gleitende Mittel wird dort nicht interpoliert und setzt nach der Lücke neu an.
          </p>
        )}
      </section>

      <section class="vl-kacheln" aria-label="Auswertungen">
        <Kachel
          titel={`Saisonvergleich ${jahr}`}
          wert={seasonDiff === null ? KEIN : `${seasonDiff > 0 ? '+' : seasonDiff < 0 ? '−' : ''}${zahl(Math.abs(seasonDiff), 2)}`}
          einheit={seasonDiff === null ? undefined : 'l/100 km (Winter gegenüber Sommer)'}
          sub={seasonDiff === null ? 'Für einen Vergleich fehlen gültige Segmente in einer der beiden Saisons.' : 'segmentbasiert, nach Enddatum'}
        >
          <table class="vl-tabelle">
            <thead><tr><th scope="col">Saison</th><th scope="col" class="r">Verbrauch</th><th scope="col" class="r">Gültige Segmente</th></tr></thead>
            <tbody>
              <tr><th scope="row">Winter (Nov–Mär)</th><td class="r">{saison.winter.verbrauch === null ? KEIN : `${zahl(saison.winter.verbrauch, 2)} l/100 km`}</td><td class="r">{saison.winter.n}</td></tr>
              <tr><th scope="row">Sommer (Mai–Sep)</th><td class="r">{saison.sommer.verbrauch === null ? KEIN : `${zahl(saison.sommer.verbrauch, 2)} l/100 km`}</td><td class="r">{saison.sommer.n}</td></tr>
            </tbody>
          </table>
          <p class="vl-n">Jahr {jahr} (Jahr des Zeitraum-Endes). Verbrauch je Saison = Σ Liter / Σ km × 100 der gültigen Segmente.</p>
        </Kachel>

        <Kachel
          titel="Ausreisser"
          wert={String(ausreisser.length)}
          einheit={ausreisser.length === 1 ? 'Segment' : 'Segmente'}
          sub={AUSREISSER_TEXT}
        >
          {ausreisser.length === 0 ? (
            <p class="vl-n">Keine Ausreisser im Zeitraum.</p>
          ) : (
            <ul class="vl-liste">
              {ausreisser.map((r) => (
                <li key={r.segment.endId}>
                  <strong>! {datum(r.segment.enddatum)}</strong>: {r.wert === null ? KEIN : zahl(r.wert, 2)} l/100 km
                  {r.wert !== null && r.referenz !== null && r.referenz > 0 && (
                    <> (+{zahl((r.wert / r.referenz - 1) * 100, 0)} % über dem Mittel der {r.referenzAnzahl} Vorgänger: {zahl(r.referenz, 2)} l/100 km)</>
                  )}
                  <div>{r.notiz ? `Notiz: ${r.notiz}` : 'Keine Notiz erfasst.'}</div>
                </li>
              ))}
            </ul>
          )}
        </Kachel>
      </section>

      <section class="vl-vergleich" aria-label="Vergleich zweier Zeiträume">
        <h2 class="vl-h2">Vergleich zweier Zeiträume</h2>
        <div class="vl-wahl">
          <ZeitraumFeld name="A" z={a} onChange={p.setA} />
          <ZeitraumFeld name="B" z={b} onChange={p.setB} />
        </div>
        <div class="vl-tabellenbox">
          <table class="vl-tabelle vl-vtabelle">
            <caption class="vl-nur-sr">Kennzahlen Zeitraum A und B nebeneinander</caption>
            <thead>
              <tr>
                <th scope="col">Kennzahl</th>
                <th scope="col" class="r">A: {datum(a.von)} bis {datum(a.bis)}</th>
                <th scope="col" class="r">B: {datum(b.von)} bis {datum(b.bis)}</th>
                <th scope="col">Differenz (B gegenüber A)</th>
              </tr>
            </thead>
            <tbody>
              <VRow t="Gefahrene km (segmentbasiert)" a={vergleich.a.seg.segmenteGesamt > 0 ? vergleich.a.seg.km : null} b={vergleich.b.seg.segmenteGesamt > 0 ? vergleich.b.seg.km : null} dez={0} einheit="km" />
              <VRow t="Verbrauch (segmentbasiert)" a={vergleich.a.seg.verbrauch} b={vergleich.b.seg.verbrauch} dez={2} einheit="l/100 km" />
              <VRow t="Kosten pro 100 km (segmentbasiert)" a={vergleich.a.seg.kostenPro100km} b={vergleich.b.seg.kostenPro100km} dez={2} einheit="CHF" />
              <VRow t="Ausgaben (belegbasiert)" a={vergleich.a.beleg.ausgaben} b={vergleich.b.beleg.ausgaben} dez={2} einheit="CHF" />
              <VRow t="Getankte Liter (belegbasiert)" a={vergleich.a.beleg.liter} b={vergleich.b.beleg.liter} dez={1} einheit="l" />
              <VRow t="Ø Preis pro Liter (belegbasiert, alle Belege in CHF)" a={vergleich.a.beleg.preisProLiter} b={vergleich.b.beleg.preisProLiter} dez={3} einheit="CHF/l" />
              <tr>
                <th scope="row">Gültige Segmente</th>
                <td class="r">{vergleich.a.seg.segmenteGueltig} von {vergleich.a.seg.segmenteGesamt}</td>
                <td class="r">{vergleich.b.seg.segmenteGueltig} von {vergleich.b.seg.segmenteGesamt}</td>
                <td>{KEIN}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {(vergleich.a.seg.verbrauch === null || vergleich.b.seg.verbrauch === null) && (
          <p class="vl-n">
            {KEIN} bedeutet: In diesem Zeitraum endet kein gültiges Segment, daher gibt es keinen Verbrauch.
          </p>
        )}
      </section>
    </>
  );
}

function VRow(p: { t: string; a: number | null; b: number | null; dez: number; einheit: string }): JSX.Element {
  const f = (n: number | null) => (n === null ? KEIN : `${zahl(n, p.dez)} ${p.einheit}`);
  return (
    <tr>
      <th scope="row">{p.t}</th>
      <td class="r">{f(p.a)}</td>
      <td class="r">{f(p.b)}</td>
      <td>{differenz(p.a, p.b, p.dez, p.einheit)}</td>
    </tr>
  );
}

function ZeitraumFeld(p: { name: string; z: Zeitraum; onChange: (z: Zeitraum) => void }): JSX.Element {
  const ok = p.z.von <= p.z.bis;
  return (
    <fieldset class="vl-feldset">
      <legend>Zeitraum {p.name}</legend>
      <label>
        Von
        <input type="date" value={p.z.von} onInput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; if (v) p.onChange({ ...p.z, von: v }); }} />
      </label>
      <label>
        Bis
        <input type="date" value={p.z.bis} onInput={(e) => { const v = (e.currentTarget as HTMLInputElement).value; if (v) p.onChange({ ...p.z, bis: v }); }} />
      </label>
      {!ok && <span class="vl-fehler" role="alert"><span aria-hidden="true">✗ </span>«Von» liegt nach «Bis».</span>}
    </fieldset>
  );
}
