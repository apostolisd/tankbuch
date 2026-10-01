// W6: Zeitraum-Preset wird bei jedem Zugriff gegen «heute» neu aufgelöst (PWA bleibt tagelang offen).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { aktuellerZeitraum, setzeZeitraum } from '../src/lib/store';

afterEach(() => vi.useRealTimers());

describe('aktuellerZeitraum', () => {
  it('Preset «Jahr»/«30 Tage»: bis = heute folgt dem Datum, auch ohne Neustart', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 12, 0, 0)); // 29.09.2026
    setzeZeitraum({ von: '', bis: '' }, 'jahr');
    expect(aktuellerZeitraum()).toEqual({ von: '2026-01-01', bis: '2026-09-29' });
    const a = aktuellerZeitraum();
    expect(aktuellerZeitraum()).toBe(a); // stabile Identität am selben Tag (keine unnötigen Neuberechnungen)

    vi.setSystemTime(new Date(2026, 8, 30, 8, 0, 0)); // am nächsten Morgen, App war offen
    expect(aktuellerZeitraum()).toEqual({ von: '2026-01-01', bis: '2026-09-30' });

    setzeZeitraum({ von: '', bis: '' }, '30tage');
    expect(aktuellerZeitraum()).toEqual({ von: '2026-09-01', bis: '2026-09-30' });
    vi.setSystemTime(new Date(2026, 9, 2, 8, 0, 0));
    expect(aktuellerZeitraum()).toEqual({ von: '2026-09-03', bis: '2026-10-02' });
  });

  it('«benutzerdefiniert» bleibt fest', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 29, 12, 0, 0));
    setzeZeitraum({ von: '2026-03-01', bis: '2026-03-31' });
    vi.setSystemTime(new Date(2026, 9, 5, 12, 0, 0));
    expect(aktuellerZeitraum()).toEqual({ von: '2026-03-01', bis: '2026-03-31' });
  });
});
