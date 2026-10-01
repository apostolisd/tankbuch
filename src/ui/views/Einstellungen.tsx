import { useEffect, useState } from 'preact/hooks';
import { istMarkiert, segmentSchluessel, verbrauchsGrenzenText, verwaisteMarkierungen, type Segment } from '../../core';
import { benenneTankstelleUm, holeAliase, meldeAb, speichereFahrzeug } from '../../lib/data';
import { datum, km, lPro100, parseZahl, zahl } from '../../lib/format';
import { leereStore, useDaten } from '../../lib/store';
import { Feld, Hinweis, Knopf, Seite, Status } from '../components';

export default function Einstellungen() {
  const { fahrzeug, eintraege, einst, segmente, fehler, neuLaden, setEinst } = useDaten();
  const [meldung, setMeldung] = useState<{ stufe: 'ok' | 'fehler'; text: string } | null>(null);

  // Fahrzeug
  const [name, setName] = useState('');
  const [volumen, setVolumen] = useState('');
  useEffect(() => {
    if (fahrzeug) {
      setName(fahrzeug.name);
      setVolumen(fahrzeug.tankvolumen_l === null ? '' : String(fahrzeug.tankvolumen_l).replace('.', ','));
    }
  }, [fahrzeug?.id, fahrzeug?.name, fahrzeug?.tankvolumen_l]);

  // Tankstellen
  const [aliase, setAliase] = useState<Record<string, string>>({});
  const [von, setVon] = useState('');
  const [nach, setNach] = useState('');
  useEffect(() => { holeAliase().then(setAliase).catch(() => { /* Tabelle evtl. noch nicht migriert */ }); }, []);

  const stationen = new Map<string, number>();
  for (const e of eintraege) if (e.tankstelle) stationen.set(e.tankstelle, (stationen.get(e.tankstelle) ?? 0) + 1);
  const stationsListe = [...stationen.entries()].sort((a, b) => b[1] - a[1]);

  const melde = (stufe: 'ok' | 'fehler', text: string) => setMeldung({ stufe, text });
  const fehlerText = (e: unknown) => (e instanceof Error ? e.message : 'Unbekannter Fehler.');

  const speichereAuto = async (e: Event) => {
    e.preventDefault();
    const v = volumen.trim() === '' ? null : parseZahl(volumen);
    if (volumen.trim() !== '' && (v === null || v <= 0 || v > 500)) {
      melde('fehler', 'Tankvolumen: bitte eine Zahl in Litern eingeben (z.B. 45).');
      return;
    }
    if (name.trim() === '') { melde('fehler', 'Bitte einen Fahrzeugnamen eingeben.'); return; }
    try {
      await speichereFahrzeug({ id: fahrzeug?.id, name: name.trim(), tankvolumen_l: v });
      await neuLaden();
      melde('ok', 'Fahrzeug gespeichert.');
    } catch (err) { melde('fehler', fehlerText(err)); }
  };

  const fuehreZusammen = async (e: Event) => {
    e.preventDefault();
    const ziel = nach.trim();
    if (!von || ziel === '') { melde('fehler', 'Bitte eine Tankstelle wählen und den neuen Namen eingeben.'); return; }
    if (ziel === von) { melde('fehler', 'Alter und neuer Name sind gleich.'); return; }
    const vorhanden = stationen.has(ziel);
    if (vorhanden && !window.confirm(`«${von}» wird mit «${ziel}» zusammengeführt. Fortfahren?`)) return;
    try {
      await benenneTankstelleUm(von, ziel);
      setAliase({ ...aliase, [von]: ziel });
      setVon(''); setNach('');
      await neuLaden();
      melde('ok', vorhanden ? 'Tankstellen zusammengeführt.' : 'Tankstelle umbenannt.');
    } catch (err) { melde('fehler', fehlerText(err)); }
  };

  const umschalten = (seg: Segment) => {
    const schluessel = segmentSchluessel(seg.startId, seg.endId);
    const war = istMarkiert(seg.startId, seg.endId, einst);
    // Markierung setzen: neuer Schlüssel (genau dieses Segment). Zurücknehmen: neuen UND alten Schlüssel (nur endId) entfernen.
    const liste = war
      ? einst.unvollstaendigeSegmente.filter((x) => x !== schluessel && x !== seg.endId)
      : [...einst.unvollstaendigeSegmente, schluessel];
    void setEinst({ ...einst, unvollstaendigeSegmente: liste });
  };

  const verwaist = verwaisteMarkierungen(segmente, einst);
  const bereinige = () => {
    void setEinst({ ...einst, unvollstaendigeSegmente: einst.unvollstaendigeSegmente.filter((m) => !verwaist.includes(m)) });
  };

  const abmelden = async () => {
    try { await meldeAb(); leereStore(); } catch (err) { melde('fehler', fehlerText(err)); }
  };

  const segmenteNeuZuAlt = [...segmente].reverse();

  return (
    <Seite titel="Einstellungen">
      {fehler ? <Hinweis stufe="fehler">{fehler}</Hinweis> : null}
      {meldung ? <Hinweis stufe={meldung.stufe}>{meldung.text}</Hinweis> : null}

      <section class="block" aria-labelledby="h-rechnen">
        <h2 id="h-rechnen" class="abschnitt">Berechnung</h2>
        <label class="schalter">
          <input type="checkbox" checked={einst.geschaetzteMitrechnen}
            onChange={(e) => void setEinst({ ...einst, geschaetzteMitrechnen: (e.currentTarget as HTMLInputElement).checked })} />
          <span>
            <strong>Geschätzte Einträge mitrechnen</strong>
            <span class="klein">Segmente mit nachgetragenen Einträgen ohne Beleg fliessen dann in Durchschnitte ein.</span>
          </span>
        </label>
      </section>

      <section class="block" aria-labelledby="h-seg">
        <h2 id="h-seg" class="abschnitt">Segmente</h2>
        <p class="klein">
          Segment als «unvollständig» markieren, wenn dazwischen ein Beleg fehlt. Es zählt dann bei km und Kosten,
          aber nicht beim Verbrauch. Die Markierung gilt für genau dieses Segment (von Volltankung bis Volltankung): Wird
          später ein fehlender Beleg dazwischen nachgetragen, entsteht ein anderes Segment und die Markierung verfällt.
        </p>
        <p class="klein">
          Plausibilitätsgrenzen: Ein Segment mit einem Verbrauch ausserhalb von {verbrauchsGrenzenText()} gilt als «unplausibel»
          (vermutlich fehlt ein Beleg oder die Volltankungs-Markierung stimmt nicht) und liefert keinen Verbrauch. Die Grenzen sind in
          der App fest eingestellt.
        </p>
        {verwaist.length > 0 ? (
          <Hinweis stufe="warnung">
            {verwaist.length === 1 ? 'Eine Markierung «unvollständig» passt' : `${verwaist.length} Markierungen «unvollständig» passen`} zu
            keinem Segment mehr (ein Eintrag wurde eingefügt, geändert oder gelöscht).{' '}
            <Knopf variante="sekundaer" onClick={bereinige}>Verwaiste Markierungen entfernen</Knopf>
          </Hinweis>
        ) : null}
        {segmente.length === 0 ? <p class="leer">Noch keine Segmente (mindestens zwei Volltankungen nötig).</p> : (
          <details class="aufklapp">
            <summary>{segmente.length} Segmente anzeigen</summary>
            <div class="tabelle-wrap">
              <table class="tabelle tabelle--segmente">
                <caption class="nur-leser">Segmente mit Status</caption>
                <thead><tr><th>Ende</th><th class="zahl">km</th><th class="zahl">l/100 km</th><th>Status</th><th><span class="nur-leser">Aktion</span></th></tr></thead>
                <tbody>
                  {segmenteNeuZuAlt.map((s) => {
                    const markiert = istMarkiert(s.startId, s.endId, einst);
                    return (
                      <tr key={s.endId}>
                        <td>{datum(s.enddatum)}</td>
                        <td class="zahl">{km(s.km)}</td>
                        <td class="zahl">{s.verbrauch === null ? '–' : lPro100(s.verbrauch)}</td>
                        <td><Status typ={s.status} />{s.grund ? <span class="klein"> {s.grund}</span> : null}</td>
                        <td>
                          <Knopf variante="sekundaer" onClick={() => umschalten(s)}>
                            {markiert ? 'Markierung zurücknehmen' : 'Als unvollständig markieren'}
                          </Knopf>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      <section class="block" aria-labelledby="h-tank">
        <h2 id="h-tank" class="abschnitt">Tankstellen</h2>
        {stationsListe.length === 0 ? <p class="leer">Noch keine Tankstellen erfasst.</p> : (
          <ul class="liste liste--kompakt">
            {stationsListe.map(([n, anz]) => (
              <li key={n} class="liste__zeile liste__zeile--statisch">
                <span>{n}</span><span class="klein">{zahl(anz, 0)} {anz === 1 ? "Beleg" : "Belege"}</span>
              </li>
            ))}
          </ul>
        )}
        {stationsListe.length > 0 ? (
          <form class="formular" onSubmit={fuehreZusammen}>
            <Feld label="Tankstelle" id="st-von">
              <select id="st-von" class="feld__eingabe" value={von} onChange={(e) => setVon((e.currentTarget as HTMLSelectElement).value)}>
                <option value="">Bitte wählen</option>
                {stationsListe.map(([n]) => <option key={n} value={n}>{n}</option>)}
              </select>
            </Feld>
            <Feld label="Neuer Name (oder bestehende Tankstelle zum Zusammenführen)" id="st-nach" list="st-liste"
              value={nach} onInput={(e: Event) => setNach((e.currentTarget as HTMLInputElement).value)} />
            <datalist id="st-liste">{stationsListe.map(([n]) => <option key={n} value={n} />)}</datalist>
            <Knopf type="submit" variante="sekundaer">Umbenennen / zusammenführen</Knopf>
          </form>
        ) : null}
        {Object.keys(aliase).length > 0 ? (
          <p class="klein">Gemerkte Zuordnungen: {Object.entries(aliase).map(([a, b]) => `${a} → ${b}`).join('; ')}</p>
        ) : null}
      </section>

      <section class="block" aria-labelledby="h-auto">
        <h2 id="h-auto" class="abschnitt">Fahrzeug</h2>
        <form class="formular" onSubmit={speichereAuto}>
          <Feld label="Name" value={name} onInput={(e: Event) => setName((e.currentTarget as HTMLInputElement).value)} />
          <Feld label="Tankvolumen (Liter)" inputMode="decimal" value={volumen}
            hinweis="Für die Plausibilitätsprüfung; leer lassen, wenn unbekannt."
            onInput={(e: Event) => setVolumen((e.currentTarget as HTMLInputElement).value)} />
          <Knopf type="submit" disabled={!fahrzeug}>Fahrzeug speichern</Knopf>
        </form>
      </section>

      <section class="block" aria-labelledby="h-foto">
        <h2 id="h-foto" class="abschnitt">Fotos und Daten</h2>
        <Hinweis stufe="info">
          Belege und Tacho-Fotos liegen privat in deinem eigenen Supabase-Projekt (Frankfurt). Zum Auslesen werden sie
          kurz an Anthropic übertragen. Beim Löschen eines Eintrags bleiben die Fotos erhalten, ausser du bestätigst
          ausdrücklich, dass sie mitgelöscht werden.
        </Hinweis>
      </section>

      <section class="block">
        <Knopf variante="gefahr" onClick={() => void abmelden()}>Abmelden</Knopf>
      </section>
    </Seite>
  );
}
