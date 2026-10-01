import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Session } from '@supabase/supabase-js';
import { DEMO, konfiguriert, supabase } from './lib/supabase';
import { leereStore } from './lib/store';
import { href, useRoute, type Route } from './ui/router';
import Start from './ui/views/Start';
import Login from './ui/views/Login';
import Einstellungen from './ui/views/Einstellungen';
import Tankbuch from './ui/views/Tankbuch';
import Verlauf from './ui/views/Verlauf';
import Preise from './ui/views/Preise';
import Bericht from './ui/views/Bericht';
import Erfassen from './ui/capture/Erfassen';
import Bestaetigen from './ui/capture/Bestaetigen';
import Gespeichert from './ui/capture/Gespeichert';
import { Hinweis, Seite } from './ui/components';

// Eigenes Icon-Set: 24 px Raster, Strichstärke 1.75, runde Enden. Preise = Preisschild (kein Dollarzeichen, die App rechnet in CHF).
const NAV: { pfad: string; label: string; namen: string[]; icon: string }[] = [
  { pfad: '/', label: 'Start', namen: ['start', 'erfassen', 'bestaetigen', 'gespeichert'], icon: 'M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5.5H9V20H5a1 1 0 0 1-1-1z' },
  { pfad: '/tankbuch', label: 'Tankbuch', namen: ['tankbuch', 'eintrag'], icon: 'M6 4h11a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM9 9h6M9 13h6M9 17h3' },
  { pfad: '/verlauf', label: 'Verlauf', namen: ['verlauf'], icon: 'M4 5v15h16M8 15l3-4 3 2 5-6' },
  { pfad: '/preise', label: 'Preise', namen: ['preise'], icon: 'M3 4.5A1.5 1.5 0 0 1 4.500 3h6.300a1.500 1.500 0 0 1 1.060.440l8.200 8.200a1.500 1.500 0 0 1 0 2.120l-6.300 6.300a1.500 1.500 0 0 1-2.120 0l-8.200-8.200A1.500 1.500 0 0 1 3 10.800zM7.500 7.500h.010' },
  { pfad: '/bericht', label: 'Bericht', namen: ['bericht'], icon: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4' },
  { pfad: '/einstellungen', label: 'Einstellungen', namen: ['einstellungen'], icon: 'M4 7h9M17 7h3M4 17h3M11 17h9M15 4.500v5M9 14.500v5' },
];

function Icon({ d }: { d: string }) {
  return (
    <span class="nav__pille">
      <svg class="nav__icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor"
        stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={d} /></svg>
    </span>
  );
}

function Inhalt({ route }: { route: Route }) {
  switch (route.name) {
    case 'start': return <Start />;
    case 'erfassen': return <Erfassen />;
    case 'bestaetigen': return <Bestaetigen />;
    case 'gespeichert': return <Gespeichert />;
    case 'tankbuch': return <Tankbuch />;
    case 'verlauf': return <Verlauf />;
    case 'preise': return <Preise />;
    case 'bericht': return <Bericht />;
    case 'einstellungen': return <Einstellungen />;
    case 'eintrag': return <Bestaetigen eintragId={route.params.id} />;
    default:
      return (
        <Seite titel="Seite nicht gefunden">
          <Hinweis stufe="warnung">Diese Adresse gibt es nicht. <a href={href('/')}>Zur Startseite</a></Hinweis>
        </Seite>
      );
  }
}

export function App() {
  const route = useRoute();
  const [session, setSession] = useState<Session | null>(null);
  // Demo-Banner per dynamischem Import: ohne VITE_DEMO=1 landet kein Demo-Code im Bundle.
  const [Banner, setBanner] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (DEMO) void import('./lib/demoBanner').then((m) => setBanner(() => m.DemoBanner));
  }, []);
  const [bereit, setBereit] = useState(!konfiguriert || DEMO);

  useEffect(() => {
    if (!konfiguriert || DEMO) return;
    let aktiv = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!aktiv) return;
      setSession(data.session);
      setBereit(true);
    }).catch(() => { if (aktiv) setBereit(true); });
    const { data } = supabase.auth.onAuthStateChange((ereignis, s) => {
      if (ereignis === 'SIGNED_OUT') leereStore();
      setSession(s);
      setBereit(true);
    });
    return () => { aktiv = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { window.scrollTo(0, 0); }, [route.pfad]);

  if (!bereit) {
    return <main class="haupt haupt--zentriert" aria-busy="true"><p class="lade">Wird geladen …</p></main>;
  }
  if (!DEMO && (!konfiguriert || !session)) {
    return <main class="haupt haupt--login"><Login /></main>;
  }

  return (
    <>
      {Banner ? <Banner /> : null}
      <div class="huelle">
      <a class="sprung" href="#inhalt">Zum Inhalt springen</a>
      <nav class="nav" aria-label="Hauptnavigation">
        <div class="nav__marke" aria-hidden="true">
          <span class="nav__logo">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.500c3.200 4 5.500 6.800 5.500 9.800a5.500 5.500 0 0 1-11 0c0-3 2.300-5.800 5.500-9.800z" /></svg>
          </span>
          Tankbuch
        </div>
        <ul class="nav__liste">
          {NAV.map((n) => {
            const aktiv = n.namen.includes(route.name);
            return (
              <li key={n.pfad}>
                <a class={`nav__link${aktiv ? ' nav__link--aktiv' : ''}`} href={href(n.pfad)} aria-current={aktiv ? 'page' : undefined}>
                  <Icon d={n.icon} /><span class="nav__text">{n.label}</span>
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <main class="haupt" id="inhalt" tabIndex={-1}>
        <Inhalt route={route} />
      </main>
      </div>
    </>
  );
}
