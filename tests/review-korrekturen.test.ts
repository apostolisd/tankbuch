// Tests zu den Korrekturen aus docs/REVIEW.md (Fachlogik: W1, W2, W3, W4, W5, W7, W8, kleine Befunde).
import { describe, expect, it } from 'vitest';
import {
  VERBRAUCH_MAX, VERBRAUCH_MIN, berechneSegmente, istMarkiert, segmentSchluessel, verbrauchsGrenzenText, verwaisteMarkierungen,
} from '../src/core/segments';
import { belegKennzahlen, segmentKennzahlen } from '../src/core/kennzahlen';
import { preisAnalyse } from '../src/core/preise';
import { AUSREISSER_FAKTOR, verbrauchsReihe } from '../src/core/verlauf';
import { monatsBericht } from '../src/core/bericht';
import { vorschauSegment } from '../src/core/pruefungen';
import { STATUS_ERKLAERUNG } from '../src/ui/views/segmentText';
import { EINST, FAHRZEUG, TESTDATEN, ZEITRAUM_2026, eintrag } from './fixture';

const seg = berechneSegmente(TESTDATEN, EINST);

describe('W1: Ausreisser zeigt das tatsächlich geprüfte Vergleichsmittel', () => {
  const reihe = verbrauchsReihe(seg, EINST, TESTDATEN);
  it('18.07.: Referenz = Mittel der Vorgänger, Anzeige-Prozent passt zur Schwelle', () => {
    const p = reihe.find((r) => r.segment.enddatum === '2026-07-18')!;
    expect(p.ausreisser).toBe(true);
    expect(p.referenz).not.toBeNull();
    expect(p.referenzAnzahl).toBeGreaterThan(0);
    expect(p.referenzAnzahl).toBeLessThanOrEqual(3);
    // was angezeigt wird (+x % über Referenz) liegt tatsächlich über der Schwelle
    const prozent = (p.wert! / p.referenz! - 1) * 100;
    expect(prozent).toBeGreaterThan((AUSREISSER_FAKTOR - 1) * 100);
    expect(prozent).toBeCloseTo(21.5, 1);
    // das einschliessende gleitende Mittel liegt dagegen unter der Schwelle (Ursache des Widerspruchs im Review)
    expect((p.wert! / p.gleitend! - 1) * 100).toBeLessThan((AUSREISSER_FAKTOR - 1) * 100);
  });
  it('Lücke: keine Referenz', () => {
    const luecke = reihe.find((r) => r.luecke)!;
    expect(luecke.referenz).toBeNull();
    expect(luecke.referenzAnzahl).toBe(0);
  });
});

describe('W2: Notizen im Verlauf', () => {
  it('Notiz erscheint am Segment, wenn die Einträge übergeben werden', () => {
    const mit = verbrauchsReihe(seg, EINST, TESTDATEN).find((r) => r.segment.enddatum === '2026-07-18')!;
    expect(mit.notiz).toBe('Ferienfahrt, Dachbox');
    expect(verbrauchsReihe(seg, EINST).find((r) => r.segment.enddatum === '2026-07-18')!.notiz).toBeNull();
  });
});

describe('W3: einheitliche Definition Ø Preis pro Liter', () => {
  const d = [
    eintrag({ id: 'a', datum: '2026-06-01', km_stand: 1000, liter: 40, betrag: 70 }),
    eintrag({ id: 'b', datum: '2026-06-10', km_stand: 1600, liter: 40, betrag: 70, waehrung: 'EUR', wechselkurs: 0.9342 }),
  ];
  const z = { von: '2026-06-01', bis: '2026-06-30' };
  it('belegKennzahlen: Σ betrag_chf / Σ liter über alle Belege, Herleitung geht auf', () => {
    const b = belegKennzahlen(d, z);
    expect(b.preisProLiter).toBeCloseTo(b.ausgaben / b.liter, 12);
    expect(b.fremdwaehrung).toHaveLength(1);
  });
  it('gleich wie Durchschnitt der Preisanalyse (ohne geschätzte)', () => {
    expect(preisAnalyse(d, z).durchschnitt).toBeCloseTo(belegKennzahlen(d, z).preisProLiter!, 12);
  });
  it('SPEC 10: 1.826', () => {
    expect(belegKennzahlen(TESTDATEN, ZEITRAUM_2026).preisProLiter!).toBeCloseTo(1.826, 3);
  });
});

describe('W4: geschätzte Belege in der Preisanalyse', () => {
  const d = [
    eintrag({ id: 'm1', datum: '2026-06-01', km_stand: 1000, liter: 40, betrag: 70, tankstelle: 'Migrol' }),
    eintrag({ id: 'c1', datum: '2026-06-10', km_stand: 1600, liter: 40, betrag: 74, tankstelle: 'Coop' }),
    eintrag({ id: 'c2', datum: '2026-06-20', km_stand: 2200, liter: 40, betrag: 60, tankstelle: 'Coop', geschaetzt: true }),
  ];
  const z = { von: '2026-06-01', bis: '2026-06-30' };
  it('geschätzter Beleg ist im Diagramm (markiert), aber nicht in Ø, Tabelle, günstigste und Ersparnis', () => {
    const a = preisAnalyse(d, z);
    expect(a.punkte).toHaveLength(3);
    expect(a.punkte.filter((p) => p.geschaetzt).map((p) => p.id)).toEqual(['c2']);
    expect(a.geschaetztAusgenommen).toBe(1);
    expect(a.durchschnitt!).toBeCloseTo(144 / 80, 10);
    expect(a.tabelle.find((t) => t.tankstelle === 'Coop')).toMatchObject({ anzahl: 1, liter: 40 });
    expect(a.guenstigste).toBe('Migrol');
    expect(a.ersparnis).toBe(4);
  });
  it('ein geschätzter Beleg macht eine Tankstelle nicht zur günstigsten', () => {
    const e = [...d];
    e[2] = { ...e[2], betrag: 40, betrag_chf: 40 }; // 1.00 CHF/l geschätzt
    expect(preisAnalyse(e, z).guenstigste).toBe('Migrol');
  });
  it('nur geschätzte Belege: Punkte ja, Ø/Tabelle leer', () => {
    const a = preisAnalyse([{ ...d[2] }], z);
    expect(a.punkte).toHaveLength(1);
    expect(a.durchschnitt).toBeNull();
    expect(a.tabelle).toEqual([]);
    expect(a.guenstigste).toBeNull();
  });
  it('Fremdwährung ist gekennzeichnet und eingerechnet', () => {
    const e = [
      ...d.slice(0, 2),
      eintrag({ id: 'x', datum: '2026-06-15', km_stand: 1900, liter: 30, betrag: 55, waehrung: 'EUR', wechselkurs: 0.95, tankstelle: 'Coop' }),
    ];
    const a = preisAnalyse(e, z);
    expect(a.punkte.find((p) => p.id === 'x')!.fremdwaehrung).toBe('EUR');
    expect(a.fremdBerechnet).toBe(1);
    expect(a.punkte.find((p) => p.id === 'x')!.preisChf).toBeCloseTo(52.25 / 30, 10);
  });
});

describe('W5: Monat ohne endendes Segment', () => {
  it('segmenteGesamt = 0, Belegsumme separat, keine Kennzahlen', () => {
    const leer = monatsBericht(TESTDATEN, seg, 2026, 12, EINST);
    expect(leer.segmenteGesamt).toBe(0);
    expect(leer.aktuell).toBeNull();
    expect(leer.belege).toEqual({ anzahl: 0, ausgaben: 0 });
    // Monat nur mit einer Teilbetankung: Beleg vorhanden, kein Segment
    const d = [
      ...TESTDATEN,
      eintrag({ id: 'teil', datum: '2026-10-05', km_stand: 93000, liter: 20, betrag: 37.6, betrag_chf: 37.6, volltankung: false }),
    ];
    const s2 = berechneSegmente(d, EINST);
    const okt = monatsBericht(d, s2, 2026, 10, EINST);
    expect(okt.segmenteGesamt).toBe(0);
    expect(okt.belege).toEqual({ anzahl: 1, ausgaben: 37.6 });
  });
  it('Herleitungsbasis des Monats und Treiber-Referenz', () => {
    const sep = monatsBericht(TESTDATEN, seg, 2026, 9, EINST);
    expect(sep.aktuell).not.toBeNull();
    expect(sep.aktuell!.km).toBe(1270);
    expect(sep.aktuell!.kmKosten).toBe(1270);
    expect(sep.treiberReferenz).toBe('Vormonat');
    const jan = monatsBericht(TESTDATEN, seg, 2026, 1, EINST);
    expect(jan.treiberReferenz).toBeNull();
  });
  it('Methodentext nennt die Einstellung «geschätzte mitrechnen»', () => {
    expect(monatsBericht(TESTDATEN, seg, 2026, 9, EINST).methode).not.toContain('eingerechneten');
    expect(monatsBericht(TESTDATEN, seg, 2026, 9, { ...EINST, geschaetzteMitrechnen: true }).methode).toContain('eingerechneten');
  });
});

describe('W7: Verbrauchsgrenzen kommen aus den Konstanten', () => {
  it('Texte enthalten die Konstanten, keine hartkodierte 3.0', () => {
    expect(verbrauchsGrenzenText()).toBe(`${VERBRAUCH_MIN.toFixed(1)} bis ${VERBRAUCH_MAX.toFixed(1)} l/100 km`);
    expect(STATUS_ERKLAERUNG.unplausibel).toContain(verbrauchsGrenzenText());
    expect(STATUS_ERKLAERUNG.unplausibel).not.toContain('3.0');
    expect(VERBRAUCH_MIN).toBe(3.5);
    expect(VERBRAUCH_MAX).toBe(15);
  });
  it('Grund-Text und Vorschau des Segments verwenden dieselben Grenzen', () => {
    const s = seg.find((x) => x.enddatum === '2026-05-29')!;
    expect(s.grund).toContain('3.5–15.0');
    const v = vorschauSegment(
      { datum: '2026-10-01', km_stand: 93270, liter: 20, betrag: 36, preis_pro_liter: 1.8 },
      { fahrzeug: FAHRZEUG, bestehende: TESTDATEN, heute: '2026-10-02', einst: EINST },
    );
    expect(v.segment!.status).toBe('unplausibel');
  });
});

describe('W8: Kosten pro 100 km nutzen die Regel zaehltFuerKosten', () => {
  it('SPEC 10: unplausibles Segment 29.05. fehlt bei den Kosten, ist aber in «Gefahrene km»', () => {
    const k = segmentKennzahlen(seg, ZEITRAUM_2026, EINST);
    expect(k.km).toBe(8260);
    const kosten = seg.filter((x) => x.status !== 'unplausibel').reduce((a, x) => a + x.kosten, 0);
    expect(k.kostenPro100km!).toBeCloseTo((kosten / (8260 - 1270)) * 100, 6);
  });
});

describe('Kleiner Befund: «unvollständig»-Markierung robust gegen endId', () => {
  const a = eintrag({ id: 'a', datum: '2026-01-01', km_stand: 1000, liter: 40, betrag: 70 });
  const b = eintrag({ id: 'b', datum: '2026-02-01', km_stand: 1600, liter: 40, betrag: 70 });
  it('Markierung gilt für genau das Segment (start>end)', () => {
    const einst = { ...EINST, unvollstaendigeSegmente: [segmentSchluessel('a', 'b')] };
    const s = berechneSegmente([a, b], einst);
    expect(s[0].status).toBe('unvollstaendig');
    expect(istMarkiert('a', 'b', einst)).toBe(true);
  });
  it('Eintrag dazwischen eingefügt: neue Segmente sind NICHT markiert, Markierung wird als verwaist gemeldet', () => {
    const einst = { ...EINST, unvollstaendigeSegmente: [segmentSchluessel('a', 'b')] };
    const n = eintrag({ id: 'n', datum: '2026-01-15', km_stand: 1300, liter: 20, betrag: 35, volltankung: true });
    const s = berechneSegmente([a, n, b], einst);
    expect(s.map((x) => x.status)).toEqual(['gueltig', 'gueltig']);
    expect(verwaisteMarkierungen(s, einst)).toEqual(['a>b']);
  });
  it('Löschen des Endeintrags: verwaist; alter Schlüssel (nur endId) bleibt kompatibel', () => {
    const alt = { ...EINST, unvollstaendigeSegmente: ['b'] };
    expect(berechneSegmente([a, b], alt)[0].status).toBe('unvollstaendig');
    expect(verwaisteMarkierungen(berechneSegmente([a, b], alt), alt)).toEqual([]);
    expect(verwaisteMarkierungen(berechneSegmente([a], alt), alt)).toEqual(['b']);
  });
});
