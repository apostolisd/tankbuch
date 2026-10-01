import { useEffect, useState } from 'preact/hooks';

export type RouteName =
  | 'start' | 'erfassen' | 'bestaetigen' | 'gespeichert' | 'tankbuch' | 'verlauf' | 'preise'
  | 'bericht' | 'einstellungen' | 'eintrag' | 'unbekannt';

export interface Route {
  /** Normalisierter Pfad ohne Query, z.B. '/bericht/2026/9' */
  pfad: string;
  name: RouteName;
  /** :jahr, :monat, :id */
  params: Record<string, string>;
  /** Query-Teil des Hashes, z.B. '#/erfassen?x=1' -> { x: '1' } */
  query: Record<string, string>;
}

const FEST: Record<string, RouteName> = {
  '/': 'start',
  '/erfassen': 'erfassen',
  '/erfassen/bestaetigen': 'bestaetigen',
  '/erfassen/gespeichert': 'gespeichert',
  '/tankbuch': 'tankbuch',
  '/verlauf': 'verlauf',
  '/preise': 'preise',
  '/bericht': 'bericht',
  '/einstellungen': 'einstellungen',
};

export function parseHash(hash: string): Route {
  let t = hash.startsWith('#') ? hash.slice(1) : hash;
  // Supabase-Rückleitung (#access_token=...) und Ähnliches: Startseite
  if (!t.startsWith('/')) t = '/';
  const [rohPfad, rohQuery = ''] = t.split('?');
  let pfad = rohPfad.replace(/\/+$/, '');
  if (pfad === '') pfad = '/';
  const query: Record<string, string> = {};
  new URLSearchParams(rohQuery).forEach((v, k) => { query[k] = v; });

  const fest = FEST[pfad];
  if (fest) return { pfad, name: fest, params: {}, query };

  let m = /^\/bericht\/(\d{4})\/(\d{1,2})$/.exec(pfad);
  if (m) return { pfad, name: 'bericht', params: { jahr: m[1], monat: m[2] }, query };
  m = /^\/eintrag\/([^/]+)$/.exec(pfad);
  if (m) return { pfad, name: 'eintrag', params: { id: decodeURIComponent(m[1]) }, query };
  return { pfad, name: 'unbekannt', params: {}, query };
}

export function navigiere(pfad: string, ersetzen = false): void {
  const ziel = `#${pfad.startsWith('/') ? pfad : `/${pfad}`}`;
  if (ersetzen) location.replace(ziel);
  else location.hash = ziel;
}

export const href = (pfad: string): string => `#${pfad}`;

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  useEffect(() => {
    const h = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', h);
    h();
    return () => window.removeEventListener('hashchange', h);
  }, []);
  return route;
}
