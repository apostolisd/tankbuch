import { createClient } from '@supabase/supabase-js';

export const SUPABASE_URL: string = ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').trim();
export const SUPABASE_ANON_KEY: string = ((import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '').trim();

/** Demo-Modus (nur mit VITE_DEMO=1 zur Build-/Dev-Zeit): In-Memory-Daten statt Supabase. */
export const DEMO: boolean = import.meta.env.VITE_DEMO === '1';

/** false, wenn VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY fehlen: die App startet dann mit Hinweis. */
export const konfiguriert: boolean = DEMO || (SUPABASE_URL !== '' && SUPABASE_ANON_KEY !== '');

// Platzhalter verhindert einen Absturz beim Import ohne Konfiguration.
export const supabase = createClient(
  SUPABASE_URL !== '' ? SUPABASE_URL : 'https://nicht-konfiguriert.invalid',
  SUPABASE_ANON_KEY !== '' ? SUPABASE_ANON_KEY : 'nicht-konfiguriert',
  { auth: { persistSession: true, autoRefreshToken: konfiguriert && !DEMO, detectSessionInUrl: konfiguriert && !DEMO } },
);
