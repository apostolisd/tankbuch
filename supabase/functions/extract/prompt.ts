// Prompt gemäss SPEC Abschnitt 7, erweitert um die automatische Zuordnung der Bilder (ein Fotofeld für 1–2 Bilder).
export const SYSTEM_PROMPT = `Du liest Schweizer Tankbelege und Fotos von Kilometerzählern aus. Antworte ausschliesslich mit einem JSON-Objekt nach dem vorgegebenen Schema.
Regeln: Gib nur Werte an, die im Bild stehen; rate nicht. Markiere ein Feld als «unsicher», wenn Ziffern schlecht lesbar sind oder mehrere Kandidaten in Frage kommen (z.B. Total inkl. Shop-Artikel vs. Kraftstoff-Betrag: nimm den Kraftstoff-Betrag und schreibe einen Hinweis). Betrag = bezahlter Kraftstoff-Betrag, nicht MwSt., nicht Zwischensumme. Liter mit zwei Dezimalen, Preis pro Liter mit drei Dezimalen, falls angegeben. Erkenne die Währung am Beleg (CHF, EUR). Beim Kilometerzähler: nimm den Gesamtkilometerstand (Odometer), nicht den Tageskilometerzähler (Trip) und nicht die Reichweite; ignoriere Nachkommastellen. Wenn ein Hinweis zum letzten bekannten km-Stand mitgegeben wird und der gelesene Wert kleiner ist oder mehr als 3000 km grösser, markiere «unsicher» und schreibe einen Hinweis. Tankstellenname: bevorzugt einer aus der Liste der bekannten Tankstellen, wenn er offensichtlich derselbe ist.

Zuordnung der Bilder: Die Bilder sind nummeriert (Bild 1, Bild 2) und kommen in beliebiger Reihenfolge. Bestimme für jedes Bild, ob es ein Tankbeleg ("beleg"), ein Kilometerzähler/Tacho-Display ("tacho") oder nicht bestimmbar ("unbekannt") ist, und gib das in "zuordnung" an (ein Eintrag pro Bild, "bild" = Nummer). Nimm die Belegfelder nur aus dem Bild, das du als Beleg bestimmt hast, und km_stand nur aus dem Bild, das du als Kilometerzähler bestimmt hast. Zeigen beide Bilder dasselbe (z.B. zwei Belege), wähle die Werte aus dem besser lesbaren, markiere die Zuordnung als «unsicher» und schreibe einen Hinweis.

Schema (jedes Feld kann {"wert": null, "konfidenz": "fehlt"} sein; konfidenz ist "sicher", "unsicher" oder "fehlt"; Zahlen als JSON-Zahlen, nicht als Strings; Datum ISO yyyy-mm-dd; Uhrzeit HH:MM; km_stand ganzzahlig):
{
  "zuordnung": [{"bild": 1, "art": "beleg", "konfidenz": "sicher"}, {"bild": 2, "art": "tacho", "konfidenz": "sicher"}],
  "datum": {"wert": "2026-09-24", "konfidenz": "sicher"},
  "uhrzeit": {"wert": "17:42", "konfidenz": "unsicher"},
  "liter": {"wert": 40.62, "konfidenz": "sicher"},
  "preis_pro_liter": {"wert": 1.799, "konfidenz": "sicher"},
  "betrag": {"wert": 73.08, "konfidenz": "sicher"},
  "waehrung": {"wert": "CHF", "konfidenz": "sicher"},
  "tankstelle": {"wert": "Coop Pronto Birmensdorf", "konfidenz": "unsicher"},
  "kraftstoff": {"wert": "Bleifrei 95", "konfidenz": "sicher"},
  "km_stand": {"wert": 92470, "konfidenz": "sicher"},
  "hinweise": ["kurze Hinweise auf Probleme, z.B. Beleg abgeschnitten"]
}
Mehrere Belege: Zeigt ein Bild mehrere Kraftstoffbelege derselben Tankstelle vom selben Tag (z.B. Nachtanken an derselben Säule), gehören sie zu einer Betankung: addiere Liter und Betrag, übernimm den gemeinsamen Preis pro Liter und die Uhrzeit des letzten Belegs, markiere liter und betrag als «unsicher» und schreibe einen Hinweis mit den Einzelwerten. Unterscheiden sich Tankstelle, Datum oder Preis, nimm nur den besser lesbaren Beleg und schreibe einen Hinweis.
Felder, die nur auf dem Tankbeleg stehen (datum, uhrzeit, liter, preis, betrag, waehrung, tankstelle, kraftstoff), nimm vom Beleg; km_stand nimmst du vom Kilometerzähler-Foto. Fehlt ein Beleg bzw. ein Kilometerzähler unter den Bildern, setze die zugehörigen Felder auf fehlt. Gib keinen Text ausserhalb des JSON-Objekts aus.`;

type Hinweise = { letzter_km_stand?: number; letzte_tankstellen?: string[] };

function hinweisTeile(hinweise?: Hinweise): string[] {
  const teile: string[] = [];
  if (typeof hinweise?.letzter_km_stand === 'number') {
    teile.push(`Letzter bekannter km-Stand: ${hinweise.letzter_km_stand}.`);
  }
  const st = (hinweise?.letzte_tankstellen ?? []).filter((s) => typeof s === 'string').slice(0, 20);
  if (st.length) teile.push(`Bekannte Tankstellen: ${st.join('; ')}.`);
  return teile;
}

/** Alte Anfrageform: feste Zuordnung (erstes Bild Beleg, dann Kilometerzähler). */
export function baueNutzerText(hatBeleg: boolean, hatTacho: boolean, hinweise?: Hinweise): string {
  const teile: string[] = [];
  if (hatBeleg) teile.push('Das erste Bild ist der Tankbeleg.');
  if (hatTacho) teile.push(hatBeleg ? 'Das zweite Bild ist der Kilometerzähler.' : 'Das Bild ist der Kilometerzähler.');
  teile.push(...hinweisTeile(hinweise));
  teile.push('Gib das JSON-Objekt aus.');
  return teile.join(' ');
}

/** Neue Anfrageform: 1–2 Bilder unbekannter Art; das Modell ordnet zu. */
export function baueNutzerTextBilder(anzahl: number, hinweise?: Hinweise): string {
  const teile: string[] = [
    anzahl === 1
      ? 'Es gibt ein Bild (Bild 1). Bestimme, ob es der Tankbeleg oder der Kilometerzähler ist.'
      : `Es gibt ${anzahl} Bilder (Bild 1 bis Bild ${anzahl}), in beliebiger Reihenfolge. Bestimme für jedes Bild, ob es der Tankbeleg oder der Kilometerzähler ist.`,
    'Gib "zuordnung" mit einem Eintrag pro Bild an.',
  ];
  teile.push(...hinweisTeile(hinweise));
  teile.push('Gib das JSON-Objekt aus.');
  return teile.join(' ');
}

// JSON-Schema für Structured Outputs (output_config.format): die API garantiert gültiges JSON in dieser Form.
const KONFIDENZ = { type: 'string', enum: ['sicher', 'unsicher', 'fehlt'] };
const feld = (typ: 'string' | 'number' | 'integer') => ({
  type: 'object',
  properties: { wert: { anyOf: [{ type: typ }, { type: 'null' }] }, konfidenz: KONFIDENZ },
  required: ['wert', 'konfidenz'],
  additionalProperties: false,
});
export const ANTWORT_SCHEMA = {
  type: 'object',
  properties: {
    zuordnung: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          bild: { type: 'integer' },
          art: { type: 'string', enum: ['beleg', 'tacho', 'unbekannt'] },
          konfidenz: KONFIDENZ,
        },
        required: ['bild', 'art', 'konfidenz'],
        additionalProperties: false,
      },
    },
    datum: feld('string'),
    uhrzeit: feld('string'),
    liter: feld('number'),
    preis_pro_liter: feld('number'),
    betrag: feld('number'),
    waehrung: feld('string'),
    tankstelle: feld('string'),
    kraftstoff: feld('string'),
    km_stand: feld('integer'),
    hinweise: { type: 'array', items: { type: 'string' } },
  },
  required: [
    'zuordnung', 'datum', 'uhrzeit', 'liter', 'preis_pro_liter', 'betrag',
    'waehrung', 'tankstelle', 'kraftstoff', 'km_stand', 'hinweise',
  ],
  additionalProperties: false,
};
