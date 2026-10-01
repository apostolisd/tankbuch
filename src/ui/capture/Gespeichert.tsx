import './capture.css';
import { km, lPro100 } from '../../lib/format';
import { Hinweis, Knopf, Seite } from '../components';
import { holeErfassung, useErfassung, zuruecksetzen } from './erfassung';
import { rueckmeldung } from './logik';

export default function Gespeichert() {
  const z = useErfassung();
  const g = z.gespeichert;

  if (!g) {
    return (
      <Seite titel="Gespeichert">
        <Hinweis stufe="info">Es wurde nichts gespeichert.</Hinweis>
        <div class="cap-aktionen">
          <Knopf href="#/erfassen">Tanken erfassen</Knopf>
          <Knopf href="#/tankbuch" variante="sekundaer">Zum Tankbuch</Knopf>
        </div>
      </Seite>
    );
  }

  const r = rueckmeldung(g.vorschau);
  const weiter = () => {
    if (holeErfassung().gespeichert) zuruecksetzen();
  };

  return (
    <Seite titel={g.geloescht ? 'Eintrag gelöscht' : g.bearbeitet ? 'Änderungen gespeichert' : 'Gespeichert'}>
      <div class="cap">
        {g.geloescht ? (
          <>
            <Hinweis stufe="ok">Der Eintrag wurde gelöscht.</Hinweis>
            {g.warnung ? <Hinweis stufe="warnung">{g.warnung}</Hinweis> : null}
          </>
        ) : (
          <div class="cap-rueckmeldung" role="status">
            <p class="cap-rueckmeldung__titel"><span aria-hidden="true">✓ </span>{g.bearbeitet ? 'Änderungen gespeichert.' : 'Eintrag gespeichert.'}</p>
            {r.art === 'segment' ? (
              <p class="cap-rueckmeldung__segment">
                {g.bearbeitet ? 'Segment des geänderten Eintrags' : 'Neues Segment'}: <strong>{km(r.km)} km, {lPro100(r.verbrauch)} l/100 km</strong>
              </p>
            ) : null}
            {r.art === 'segment-geschaetzt' ? (
              <Hinweis stufe="info">
                {g.bearbeitet ? 'Segment des geänderten Eintrags' : 'Neues Segment'}: {km(r.km)} km, {lPro100(r.verbrauch)} l/100 km. Es enthält einen geschätzten Eintrag und zählt nicht im Durchschnitt.
              </Hinweis>
            ) : null}
            {r.art === 'unplausibel' ? (
              <Hinweis stufe="warnung">
                Das {g.bearbeitet ? 'Segment des geänderten Eintrags' : 'entstandene Segment'} ({km(r.km)} km) ist unplausibel, deshalb wird kein Verbrauch angezeigt. Vermutlich fehlt ein Beleg oder die Volltankungs-Markierung stimmt nicht.
              </Hinweis>
            ) : null}
            {r.art === 'teil' ? <p>{g.bearbeitet ? 'Eintrag ist eine Teilbetankung – er gehört zum nächsten Segment.' : 'Teilbetankung – wird dem nächsten Segment zugeschlagen.'}</p> : null}
            {r.art === 'erste' ? <p class="cap-klein">Noch kein Segment: Die erste Volltankung eröffnet nur das erste Segment.</p> : null}
          </div>
        )}
        <div class="cap-aktionen">
          {g.geloescht ? null : (
            <Knopf gross href="#/erfassen" onClick={weiter}>Weiteren erfassen</Knopf>
          )}
          <Knopf href="#/tankbuch" variante={g.geloescht ? 'primaer' : 'sekundaer'} onClick={weiter}>Zum Tankbuch</Knopf>
        </div>
      </div>
    </Seite>
  );
}
