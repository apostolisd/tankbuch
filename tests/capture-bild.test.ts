import { describe, expect, it } from 'vitest';
import { BildFehler, MAX_DATEI_BYTES, pruefeDatei, zielGroesse } from '../src/ui/capture/bild';

describe('zielGroesse', () => {
  it('verkleinert Querformat auf längste Seite 1600', () => {
    expect(zielGroesse(4032, 3024)).toEqual({ breite: 1600, hoehe: 1200, skaliert: true });
  });
  it('verkleinert Hochformat', () => {
    expect(zielGroesse(3024, 4032)).toEqual({ breite: 1200, hoehe: 1600, skaliert: true });
  });
  it('vergrössert nie', () => {
    expect(zielGroesse(800, 600)).toEqual({ breite: 800, hoehe: 600, skaliert: false });
    expect(zielGroesse(1600, 1600)).toEqual({ breite: 1600, hoehe: 1600, skaliert: false });
  });
  it('behält mindestens 1 px', () => {
    const r = zielGroesse(100000, 10);
    expect(r.breite).toBe(1600);
    expect(r.hoehe).toBe(1);
  });
  it('ungültige Masse ergeben 0', () => {
    expect(zielGroesse(0, 100).breite).toBe(0);
    expect(zielGroesse(NaN, 100).breite).toBe(0);
  });
});

describe('pruefeDatei', () => {
  const code = (f: unknown) => {
    try {
      pruefeDatei(f as { type: string; size: number });
      return null;
    } catch (e) {
      return (e as BildFehler).code;
    }
  };
  it('kein Bild', () => {
    expect(code(null)).toBe('kein-bild');
    expect(code({ type: 'image/jpeg', size: 0 })).toBe('kein-bild');
    expect(code({ type: 'application/pdf', size: 10 })).toBe('kein-bild');
  });
  it('zu gross', () => {
    expect(code({ type: 'image/jpeg', size: MAX_DATEI_BYTES + 1 })).toBe('zu-gross');
  });
  it('ok, auch mit leerem Typ (HEIC)', () => {
    expect(code({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(code({ type: '', size: 1000 })).toBeNull();
  });
});
