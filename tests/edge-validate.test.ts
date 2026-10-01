import { describe, it, expect } from 'vitest';
import { validiereErkennung, parseModellJson, validiereZuordnung, festeZuordnung } from '../supabase/functions/extract/validate';
import { baueNutzerTextBilder, SYSTEM_PROMPT } from '../supabase/functions/extract/prompt';

const voll = {
  datum: { wert: '2026-09-24', konfidenz: 'sicher' },
  uhrzeit: { wert: '17:42', konfidenz: 'unsicher' },
  liter: { wert: 40.62, konfidenz: 'sicher' },
  preis_pro_liter: { wert: 1.799, konfidenz: 'sicher' },
  betrag: { wert: 73.08, konfidenz: 'sicher' },
  waehrung: { wert: 'CHF', konfidenz: 'sicher' },
  tankstelle: { wert: 'Coop Pronto Birmensdorf', konfidenz: 'unsicher' },
  kraftstoff: { wert: 'Bleifrei 95', konfidenz: 'sicher' },
  km_stand: { wert: 92470, konfidenz: 'sicher' },
  hinweise: ['Beleg unten abgeschnitten'],
};

describe('validiereErkennung', () => {
  it('uebernimmt gueltige Antwort unveraendert', () => {
    const e = validiereErkennung(voll, { letzter_km_stand: 91845 });
    expect(e.liter).toEqual({ wert: 40.62, konfidenz: 'sicher' });
    expect(e.km_stand).toEqual({ wert: 92470, konfidenz: 'sicher' });
    expect(e.datum.wert).toBe('2026-09-24');
    expect(e.hinweise).toEqual(['Beleg unten abgeschnitten']);
  });

  it('fehlende Felder -> fehlt, Muell -> lauter fehlt', () => {
    for (const raw of [{}, null, 'x', 42, []]) {
      const e = validiereErkennung(raw);
      expect(e.liter).toEqual({ wert: null, konfidenz: 'fehlt' });
      expect(e.km_stand).toEqual({ wert: null, konfidenz: 'fehlt' });
      expect(e.hinweise).toEqual([]);
    }
  });

  it('normalisiert Zahlen aus Strings', () => {
    const e = validiereErkennung({ ...voll, liter: { wert: '40,62 l', konfidenz: 'sicher' }, betrag: { wert: "1'073.08", konfidenz: 'sicher' } });
    expect(e.liter.wert).toBe(40.62);
    expect(e.betrag.wert).toBe(1073.08);
    expect(validiereErkennung({ ...voll, betrag: { wert: '1.234,50', konfidenz: 'sicher' } }).betrag.wert).toBe(1234.5);
  });

  it('rundet Liter 2, Preis 3 Dezimalen', () => {
    const e = validiereErkennung({ ...voll, liter: { wert: 40.6249, konfidenz: 'sicher' }, preis_pro_liter: { wert: 1.79949, konfidenz: 'sicher' } });
    expect(e.liter.wert).toBe(40.62);
    expect(e.preis_pro_liter.wert).toBe(1.799);
  });

  it('km ganzzahlig (Zehntel ignorieren)', () => {
    expect(validiereErkennung({ ...voll, km_stand: { wert: 92470.9, konfidenz: 'sicher' } }).km_stand.wert).toBe(92470);
    expect(validiereErkennung({ ...voll, km_stand: { wert: '92 470,7', konfidenz: 'sicher' } }).km_stand.wert).toBe(92470);
  });

  it('normalisiert Datum und Uhrzeit, verwirft ungueltige', () => {
    expect(validiereErkennung({ ...voll, datum: { wert: '24.09.2026', konfidenz: 'sicher' } }).datum.wert).toBe('2026-09-24');
    expect(validiereErkennung({ ...voll, datum: { wert: '24.09.26', konfidenz: 'sicher' } }).datum.wert).toBe('2026-09-24');
    expect(validiereErkennung({ ...voll, datum: { wert: '2026-02-30', konfidenz: 'sicher' } }).datum).toEqual({ wert: null, konfidenz: 'fehlt' });
    expect(validiereErkennung({ ...voll, uhrzeit: { wert: '17.42', konfidenz: 'sicher' } }).uhrzeit.wert).toBe('17:42');
    expect(validiereErkennung({ ...voll, uhrzeit: { wert: '25:99', konfidenz: 'sicher' } }).uhrzeit.konfidenz).toBe('fehlt');
  });

  it('unbekannte Konfidenz -> unsicher; Wert null -> fehlt; Wert mit fehlt -> unsicher', () => {
    expect(validiereErkennung({ ...voll, liter: { wert: 40.62, konfidenz: 'hoch' } }).liter.konfidenz).toBe('unsicher');
    expect(validiereErkennung({ ...voll, liter: { wert: 40.62 } }).liter.konfidenz).toBe('unsicher');
    expect(validiereErkennung({ ...voll, liter: { wert: null, konfidenz: 'sicher' }, betrag: null }).liter).toEqual({ wert: null, konfidenz: 'fehlt' });
    expect(validiereErkennung({ ...voll, tankstelle: { wert: 'Migrol', konfidenz: 'fehlt' } }).tankstelle.konfidenz).toBe('unsicher');
    expect(validiereErkennung({ ...voll, tankstelle: { wert: 'Migrol', konfidenz: 'manuell' } }).tankstelle.konfidenz).toBe('unsicher');
  });

  it('nimmt blosse Werte als unsicher an', () => {
    const e = validiereErkennung({ ...voll, liter: 40.62 });
    expect(e.liter).toEqual({ wert: 40.62, konfidenz: 'unsicher' });
  });

  it('Waehrung normalisiert', () => {
    expect(validiereErkennung({ ...voll, waehrung: { wert: 'eur', konfidenz: 'sicher' } }).waehrung.wert).toBe('EUR');
    expect(validiereErkennung({ ...voll, waehrung: { wert: 'Franken', konfidenz: 'sicher' } }).waehrung.konfidenz).toBe('fehlt');
  });

  it('liter <= 0 wird verworfen', () => {
    expect(validiereErkennung({ ...voll, liter: { wert: 0, konfidenz: 'sicher' }, preis_pro_liter: { wert: null, konfidenz: 'fehlt' } }).liter.konfidenz).toBe('fehlt');
  });

  it('km kleiner als letzter Stand -> unsicher + Hinweis', () => {
    const e = validiereErkennung(voll, { letzter_km_stand: 93000 });
    expect(e.km_stand).toEqual({ wert: 92470, konfidenz: 'unsicher' });
    expect(e.hinweise.some((h) => h.includes('kleiner'))).toBe(true);
  });

  it('km mehr als 3000 ueber letztem Stand -> unsicher; genau 3000 ok', () => {
    const e = validiereErkennung(voll, { letzter_km_stand: 89000 });
    expect(e.km_stand.konfidenz).toBe('unsicher');
    expect(e.hinweise.some((h) => h.includes('3000'))).toBe(true);
    expect(validiereErkennung(voll, { letzter_km_stand: 89470 }).km_stand.konfidenz).toBe('sicher');
  });

  it('berechnet genau einen fehlenden Wert', () => {
    const b = validiereErkennung({ ...voll, betrag: { wert: null, konfidenz: 'fehlt' } });
    expect(b.betrag.konfidenz).toBe('berechnet');
    expect(b.betrag.wert).toBeCloseTo(73.07, 1);
    const p = validiereErkennung({ ...voll, preis_pro_liter: null });
    expect(p.preis_pro_liter).toEqual({ wert: 1.799, konfidenz: 'berechnet' });
    const l = validiereErkennung({ ...voll, liter: null });
    expect(l.liter).toEqual({ wert: 40.62, konfidenz: 'berechnet' });
    expect(l.hinweise.length).toBe(2);
  });

  it('berechnet nichts, wenn zwei oder drei fehlen', () => {
    const e = validiereErkennung({ ...voll, betrag: null, liter: null });
    expect(e.betrag.konfidenz).toBe('fehlt');
    expect(e.liter.konfidenz).toBe('fehlt');
    const e3 = validiereErkennung({ ...voll, betrag: null, liter: null, preis_pro_liter: null });
    expect(e3.preis_pro_liter.konfidenz).toBe('fehlt');
  });

  it('begrenzt und filtert Hinweise', () => {
    const e = validiereErkennung({ ...voll, hinweise: ['a', 5, '', '  b  ', ...Array(20).fill('x')] });
    expect(e.hinweise.length).toBe(10);
    expect(e.hinweise.slice(0, 2)).toEqual(['a', 'b']);
    expect(validiereErkennung({ ...voll, hinweise: 'nur ein Text' }).hinweise).toEqual(['nur ein Text']);
  });
});

describe('Zuordnung der Bilder (bilder)', () => {
  const U = '11111111-2222-3333-4444-555555555555';
  const P = [`${U}/a.jpg`, `${U}/b.jpg`];

  it('ohne bilder: keine zuordnung im Ergebnis (alte Aufrufform)', () => {
    expect(validiereErkennung(voll).zuordnung).toBeUndefined();
  });

  it('per Bildnummer, Reihenfolge = Eingabereihenfolge', () => {
    const e = validiereErkennung(
      { ...voll, zuordnung: [{ bild: 2, art: 'beleg', konfidenz: 'sicher' }, { bild: 1, art: 'tacho', konfidenz: 'sicher' }] },
      undefined,
      P,
    );
    expect(e.zuordnung).toEqual([
      { pfad: P[0], art: 'tacho', konfidenz: 'sicher' },
      { pfad: P[1], art: 'beleg', konfidenz: 'sicher' },
    ]);
    expect(e.hinweise).toEqual(['Beleg unten abgeschnitten']);
  });

  it('per Pfad nur, wenn er einem Eingabepfad entspricht', () => {
    const e = validiereErkennung(
      { ...voll, zuordnung: [{ pfad: `${U}/fremd.jpg`, art: 'beleg', konfidenz: 'sicher' }, { pfad: P[1], art: 'tacho', konfidenz: 'sicher' }] },
      undefined,
      P,
    );
    expect(e.zuordnung).toEqual([
      { pfad: P[0], art: 'unbekannt', konfidenz: 'fehlt' },
      { pfad: P[1], art: 'tacho', konfidenz: 'sicher' },
    ]);
    expect(e.zuordnung!.every((z) => P.includes(z.pfad))).toBe(true);
    expect(e.hinweise.some((h) => h.includes('Zuordnung'))).toBe(true);
  });

  it('unbekannte Art -> unbekannt/unsicher; Synonyme werden erkannt; Nummer ausserhalb verworfen', () => {
    const e = validiereErkennung(
      { ...voll, zuordnung: [{ bild: 1, art: 'Quittung', konfidenz: 'sicher' }, { bild: 2, art: 'foto', konfidenz: 'sicher' }, { bild: 3, art: 'tacho' }] },
      undefined,
      P,
    );
    expect(e.zuordnung).toEqual([
      { pfad: P[0], art: 'beleg', konfidenz: 'sicher' },
      { pfad: P[1], art: 'unbekannt', konfidenz: 'unsicher' },
    ]);
    const t = validiereErkennung({ ...voll, zuordnung: [{ bild: '1', art: 'Kilometerzähler', konfidenz: 'hoch' }] }, undefined, [P[0]]);
    expect(t.zuordnung).toEqual([{ pfad: P[0], art: 'tacho', konfidenz: 'unsicher' }]);
  });

  it('fehlende oder unbrauchbare zuordnung -> je Bild unbekannt', () => {
    for (const z of [undefined, null, 'beleg', {}, [null, 5, 'x']]) {
      const e = validiereErkennung({ ...voll, zuordnung: z }, undefined, P);
      expect(e.zuordnung!.map((x) => x.art)).toEqual(['unbekannt', 'unbekannt']);
    }
    expect(validiereErkennung(null, undefined, P).zuordnung!.length).toBe(2);
  });

  it('doppelte Einträge: der erste zählt', () => {
    const e = validiereErkennung(
      { ...voll, zuordnung: [{ bild: 1, art: 'beleg', konfidenz: 'sicher' }, { bild: 1, art: 'tacho', konfidenz: 'sicher' }, { bild: 2, art: 'tacho', konfidenz: 'sicher' }] },
      undefined,
      P,
    );
    expect(e.zuordnung!.map((x) => x.art)).toEqual(['beleg', 'tacho']);
  });

  it('zwei Belege bzw. zwei Tachos -> beide unsicher + Hinweis', () => {
    const b = validiereErkennung({ ...voll, zuordnung: [{ bild: 1, art: 'beleg', konfidenz: 'sicher' }, { bild: 2, art: 'beleg', konfidenz: 'sicher' }] }, undefined, P);
    expect(b.zuordnung!.map((x) => x.konfidenz)).toEqual(['unsicher', 'unsicher']);
    expect(b.hinweise.some((h) => h.includes('Tankbeleg'))).toBe(true);
    const t = validiereZuordnung([{ bild: 1, art: 'tacho', konfidenz: 'sicher' }, { bild: 2, art: 'tacho', konfidenz: 'sicher' }], P);
    expect(t.zuordnung.map((x) => x.konfidenz)).toEqual(['unsicher', 'unsicher']);
    expect(t.hinweise.some((h) => h.includes('Kilometerzähler'))).toBe(true);
  });

  it('Konfidenz fehlt bei bekannter Art -> unsicher; berechnet -> unsicher', () => {
    const r = validiereZuordnung([{ bild: 1, art: 'beleg', konfidenz: 'fehlt' }, { bild: 2, art: 'tacho', konfidenz: 'berechnet' }], P);
    expect(r.zuordnung.map((x) => x.konfidenz)).toEqual(['unsicher', 'unsicher']);
  });

  it('festeZuordnung für alte Anfragen', () => {
    expect(festeZuordnung(P[0], null)).toEqual([{ pfad: P[0], art: 'beleg', konfidenz: 'sicher' }]);
    expect(festeZuordnung(P[0], P[1]).map((z) => z.art)).toEqual(['beleg', 'tacho']);
    expect(festeZuordnung(null, null)).toEqual([]);
  });

  it('Prompt nummeriert die Bilder', () => {
    expect(baueNutzerTextBilder(2, { letzter_km_stand: 91845 })).toContain('Bild 1 bis Bild 2');
    expect(baueNutzerTextBilder(1)).toContain('Bild 1');
    expect(SYSTEM_PROMPT).toContain('"zuordnung"');
  });
});

describe('parseModellJson', () => {
  it('parst reines JSON, Code-Zaun und Umtext', () => {
    expect(parseModellJson('{"a":1}')).toEqual({ a: 1 });
    expect(parseModellJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModellJson('Hier: {"a":1} Ende')).toEqual({ a: 1 });
  });
  it('null bei ungueltigem JSON / Nicht-Objekt', () => {
    expect(parseModellJson('nix')).toBeNull();
    expect(parseModellJson('{"a":')).toBeNull();
    expect(parseModellJson('[1,2]')).toBeNull();
    expect(parseModellJson('')).toBeNull();
  });
});
