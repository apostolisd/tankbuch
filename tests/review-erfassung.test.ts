// Tests zu W9 (Missbrauchsschutz) und W10 (Preis nicht Pflicht) sowie kleinen Befunden der Erfassung.
import { describe, expect, it } from 'vitest';
import {
  aendereFeld, aliasMapKlein, berechneBeimTippen, betragInChf, feldStatus, leererEntwurf, leitePreisAb, rundeKurs,
  wendeAliasAn, zusatzPruefungen,
} from '../src/ui/capture/logik';
import { kannSpeichern, pruefeEntwurf } from '../src/core/pruefungen';
import { EINST, FAHRZEUG } from './fixture';
import { RateLimiter, bildTyp, istErlaubt, parseAllowlist } from '../supabase/functions/extract/zugriff';
import type { EintragEntwurf } from '../src/core/types';

/** Simuliert das Tippen: Feld ändern (Konfidenz «manuell») und danach die Live-Berechnung. */
function tippe(e: EintragEntwurf, feld: 'liter' | 'preis_pro_liter' | 'betrag', wert: number | null): EintragEntwurf {
  return berechneBeimTippen(aendereFeld(e, feld, wert), feld);
}

describe('W10: Preis pro Liter ist keine Pflicht und wird berechnet', () => {
  const basis = (): EintragEntwurf => ({ ...leererEntwurf('f1', true).entwurf, datum: '2026-09-30', km_stand: 93000 });
  const kontext = { fahrzeug: FAHRZEUG, bestehende: [], heute: '2026-09-30', einst: EINST };

  it('«ca. 40 l, ca. 75 CHF» ohne Foto: Preis wird berechnet (Konfidenz «berechnet»), Speichern möglich', () => {
    let e = tippe(basis(), 'liter', 40);
    expect(e.preis_pro_liter).toBeUndefined();
    e = tippe(e, 'betrag', 75);
    expect(e.preis_pro_liter).toBe(1.875);
    expect(e.konfidenz?.preis_pro_liter).toBe('berechnet');
    expect(e.konfidenz?.liter).toBe('manuell');
    expect(e.konfidenz?.betrag).toBe('manuell');
    expect(zusatzPruefungen(e)).toEqual([]);
    expect(kannSpeichern(pruefeEntwurf(e, kontext))).toBe(true);
  });

  it('Reihenfolge Betrag, dann Liter: gleiches Ergebnis', () => {
    const e = tippe(tippe(basis(), 'betrag', 75), 'liter', 40);
    expect(e.preis_pro_liter).toBe(1.875);
  });

  it('berechneter Preis folgt Änderungen, ein vom Nutzer getippter Preis wird nie überschrieben', () => {
    let e = tippe(tippe(basis(), 'liter', 40), 'betrag', 75);
    e = tippe(e, 'liter', 41.6);
    expect(e.preis_pro_liter).toBe(1.803);
    e = tippe(e, 'preis_pro_liter', 1.8);
    expect(e.konfidenz?.preis_pro_liter).toBe('manuell');
    const danach = tippe(e, 'liter', 42);
    expect(danach.preis_pro_liter).toBe(1.8);
    expect(danach.betrag).toBe(75);
  });

  it('Liter + Preis getippt: Betrag wird berechnet; Betrag + Preis: Liter wird berechnet', () => {
    const a = tippe(tippe(basis(), 'liter', 40), 'preis_pro_liter', 1.8);
    expect(a.betrag).toBe(72);
    expect(a.konfidenz?.betrag).toBe('berechnet');
    const b = tippe(tippe(basis(), 'betrag', 72), 'preis_pro_liter', 1.8);
    expect(b.liter).toBe(40);
    expect(b.konfidenz?.liter).toBe('berechnet');
  });

  it('nichts berechnen, wenn mehr als ein Wert fehlt oder Wert 0', () => {
    const e = tippe(basis(), 'liter', 40);
    expect(e.preis_pro_liter).toBeUndefined();
    expect(e.betrag).toBeUndefined();
    const n = tippe(tippe(basis(), 'liter', 0), 'betrag', 75);
    expect(n.preis_pro_liter).toBeUndefined();
  });

  it('Speichern ohne Preis: leitePreisAb setzt Betrag ÷ Liter, «berechnet»; vorhandener Preis bleibt', () => {
    const e: EintragEntwurf = { ...basis(), liter: 40, betrag: 75, konfidenz: { liter: 'manuell' } };
    const r = leitePreisAb(e);
    expect(r.preis_pro_liter).toBe(1.875);
    expect(r.konfidenz).toMatchObject({ liter: 'manuell', preis_pro_liter: 'berechnet' });
    expect(leitePreisAb({ ...e, preis_pro_liter: 1.9 }).preis_pro_liter).toBe(1.9);
    expect(leitePreisAb({ ...basis(), liter: 40 }).preis_pro_liter).toBeUndefined();
  });

  it('Fremdwährung: Preis in Belegwährung (Betrag ÷ Liter)', () => {
    const e = leitePreisAb({ ...basis(), liter: 40, betrag: 70, waehrung: 'EUR', wechselkurs: 0.95 });
    expect(e.preis_pro_liter).toBe(1.75);
  });

  it('Feldstatus: leerer Preis ist kein Pflichtfehler mehr, leeres Liter schon', () => {
    const e = basis();
    expect(feldStatus(e, 'preis_pro_liter').typ).toBe('neutral');
    expect(feldStatus(e, 'liter').typ).toBe('fehlt');
  });

  it('zusatzPruefungen verlangt keinen Preis mehr', () => {
    expect(zusatzPruefungen({ ...basis(), liter: 40, betrag: 75 }).map((p) => p.feld)).not.toContain('preis_pro_liter');
  });
});

describe('Währungsfeld und Wechselkurs', () => {
  it('zweistelliger Währungscode ist ein blockierender Fehler, dreistellig ok', () => {
    expect(zusatzPruefungen({ waehrung: 'EU', wechselkurs: 0.95 }).map((p) => p.feld)).toContain('waehrung');
    expect(zusatzPruefungen({ waehrung: 'EUR', wechselkurs: 0.95 }).map((p) => p.feld)).not.toContain('waehrung');
    expect(zusatzPruefungen({ waehrung: 'CHF' }).map((p) => p.feld)).not.toContain('waehrung');
    expect(zusatzPruefungen({ waehrung: 'E1R', wechselkurs: 1 }).map((p) => p.feld)).toContain('waehrung');
  });
  it('Kurs wird wie in der DB (4 Stellen) gerundet: Anzeige «Betrag in CHF» = gespeicherter Betrag', () => {
    expect(rundeKurs(0.93424999)).toBe(0.9342);
    expect(rundeKurs(0.93425)).toBe(0.9343);
    const e: EintragEntwurf = { betrag: 10000, waehrung: 'EUR', wechselkurs: 0.93424999 };
    expect(betragInChf(e)).toBe(9342);
  });
});

describe('Alias-Normalisierung beim Bestätigen', () => {
  const aliase = { 'migrol dietikon zh': 'Migrol Dietikon', 'Migrol Dietikon': 'Migrol' };
  it('wendet Alias an (Gross-/Kleinschreibung, Leerraum) und löst Ketten auf', () => {
    expect(wendeAliasAn('  MIGROL  Dietikon ZH ', aliase)).toBe('Migrol');
    expect(wendeAliasAn('Coop Pronto', aliase)).toBe('Coop Pronto');
    expect(wendeAliasAn('   ', aliase)).toBeNull();
    expect(wendeAliasAn(null, aliase)).toBeNull();
  });
  it('Zyklen laufen nicht endlos', () => {
    expect(typeof wendeAliasAn('a', { a: 'b', b: 'a' })).toBe('string');
  });
  it('Array-Form {von, nach}', () => {
    expect(aliasMapKlein([{ von: 'X', nach: 'Y' }])).toEqual({ x: 'Y' });
  });
});

describe('W9: Zugriffsschutz der Edge Function', () => {
  it('Allowlist: leer = alle erlaubt; sonst nur gelistete (ohne Beachtung der Schreibweise)', () => {
    expect(parseAllowlist(undefined)).toEqual([]);
    expect(parseAllowlist('')).toEqual([]);
    expect(istErlaubt('x@y.ch', [])).toBe(true);
    const liste = parseAllowlist(' Du@Example.ch , andere@example.ch;dritte@example.ch ');
    expect(liste).toEqual(['du@example.ch', 'andere@example.ch', 'dritte@example.ch']);
    expect(istErlaubt('DU@example.CH', liste)).toBe(true);
    expect(istErlaubt('fremd@example.ch', liste)).toBe(false);
    expect(istErlaubt(undefined, liste)).toBe(false);
    expect(istErlaubt(null, liste)).toBe(false);
  });

  it('Mengenbegrenzung je Nutzer im gleitenden Fenster', () => {
    const l = new RateLimiter(3, 60_000);
    const t0 = 1_000_000;
    expect([0, 1, 2].map((i) => l.pruefe('u1', t0 + i * 1000))).toEqual([true, true, true]);
    expect(l.pruefe('u1', t0 + 5000)).toBe(false);
    expect(l.warteSekunden('u1', t0 + 5000)).toBe(55);
    expect(l.pruefe('u2', t0 + 5000)).toBe(true); // anderer Nutzer unberührt
    expect(l.pruefe('u1', t0 + 60_001)).toBe(true); // erster Aufruf ist aus dem Fenster
    expect(l.pruefe('u1', t0 + 60_002)).toBe(false); // Fenster enthält wieder 3 Aufrufe
    expect(l.pruefe('u1', t0 + 61_001)).toBe(true); // Aufruf bei t0+1000 ist aus dem Fenster
  });

  it('abgewiesene Aufrufe werden nicht mitgezählt', () => {
    const l = new RateLimiter(1, 1000);
    expect(l.pruefe('u', 0)).toBe(true);
    for (let i = 1; i < 50; i++) expect(l.pruefe('u', i)).toBe(false);
    expect(l.pruefe('u', 1001)).toBe(true);
  });

  it('Bildtyp am Dateikopf: JPEG/PNG ja, alles andere nein', () => {
    expect(bildTyp(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0]))).toBe('image/jpeg');
    expect(bildTyp(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe('image/png');
    expect(bildTyp(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull(); // GIF
    expect(bildTyp(new Uint8Array([]))).toBeNull();
    expect(bildTyp(new TextEncoder().encode('<html>'))).toBeNull();
  });
});

describe('Magic-Link-Fehler in der Rückleitung', () => {
  it('erkennt abgelaufenen Link, ignoriert normale Routen', async () => {
    const { linkFehlerAusHash } = await import('../src/ui/views/Login');
    expect(linkFehlerAusHash('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid')).toContain('abgelaufen');
    expect(linkFehlerAusHash('#error=server_error')).toContain('nicht geklappt');
    expect(linkFehlerAusHash('#/tankbuch')).toBeNull();
    expect(linkFehlerAusHash('')).toBeNull();
    expect(linkFehlerAusHash('#access_token=abc&type=magiclink')).toBeNull();
  });
});
