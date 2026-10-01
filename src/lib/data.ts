import type { Einstellungen, Erkennung, ExtractRequest, Fahrzeug, Tankvorgang } from '../core';
import { DEMO, SUPABASE_ANON_KEY, SUPABASE_URL, konfiguriert, supabase } from './supabase';

// Demo-Weiche: VITE_DEMO ist zur Buildzeit fest -> ohne VITE_DEMO=1 entfällt der Demo-Code im Bundle.
const demo = () => import('./demo');

const BUCKET = 'belege';
const STANDARD_EINST: Einstellungen = { geschaetzteMitrechnen: false, unvollstaendigeSegmente: [] };

function fehler(aktion: string, e: unknown): Error {
  if (e instanceof Error && e.name === 'AbortError') return new Error(`${aktion}: Zeitüberschreitung.`);
  const msg = (e as { message?: string } | null)?.message ?? '';
  if (/failed to fetch|networkerror|network request|load failed/i.test(msg)) {
    return new Error(`${aktion}: Keine Verbindung zum Server. Bitte Netz prüfen und erneut versuchen.`);
  }
  if (/jwt|not authenticated|invalid token|expired/i.test(msg)) {
    return new Error(`${aktion}: Die Anmeldung ist abgelaufen. Bitte neu anmelden.`);
  }
  if (/row-level security|permission denied/i.test(msg)) return new Error(`${aktion}: Keine Berechtigung.`);
  if (/relation .* does not exist|schema cache|could not find the table/i.test(msg)) {
    return new Error(`${aktion}: Datenbank nicht eingerichtet (Migration fehlt).`);
  }
  return new Error(`${aktion}: ${msg || 'Unbekannter Fehler.'}`);
}

function pruefeKonfig(aktion: string): void {
  if (!konfiguriert) throw new Error(`${aktion}: Supabase ist nicht konfiguriert.`);
}

async function userId(aktion: string): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw fehler(aktion, error);
  const id = data.session?.user.id;
  if (!id) throw new Error(`${aktion}: Nicht angemeldet. Bitte anmelden.`);
  return id;
}

const num = (v: unknown): number => (v === null || v === undefined ? 0 : Number(v));

function zuVorgang(r: Record<string, unknown>): Tankvorgang {
  const uhr = r.uhrzeit as string | null;
  return {
    id: String(r.id),
    fahrzeug_id: String(r.fahrzeug_id),
    datum: String(r.datum).slice(0, 10),
    uhrzeit: uhr ? uhr.slice(0, 5) : null,
    km_stand: num(r.km_stand),
    liter: num(r.liter),
    betrag: num(r.betrag),
    waehrung: (r.waehrung as string) ?? 'CHF',
    wechselkurs: r.wechselkurs === null || r.wechselkurs === undefined ? 1 : Number(r.wechselkurs),
    betrag_chf: num(r.betrag_chf),
    preis_pro_liter: num(r.preis_pro_liter),
    tankstelle: (r.tankstelle as string | null) ?? null,
    kraftstoff: (r.kraftstoff as string | null) ?? null,
    volltankung: r.volltankung !== false,
    geschaetzt: r.geschaetzt === true,
    notiz: (r.notiz as string | null) ?? null,
    konfidenz: (r.konfidenz as Tankvorgang['konfidenz']) ?? null,
    roh_erkennung: r.roh_erkennung ?? null,
    beleg_foto_pfad: (r.beleg_foto_pfad as string | null) ?? null,
    tacho_foto_pfad: (r.tacho_foto_pfad as string | null) ?? null,
  };
}

function zuFahrzeug(r: Record<string, unknown>): Fahrzeug {
  return {
    id: String(r.id),
    name: String(r.name),
    tankvolumen_l: r.tankvolumen_l === null || r.tankvolumen_l === undefined ? null : Number(r.tankvolumen_l),
  };
}

// ---------- Fahrzeug ----------
export async function holeFahrzeug(): Promise<Fahrzeug> {
  if (DEMO) return (await demo()).holeFahrzeug();
  const a = 'Fahrzeug laden';
  pruefeKonfig(a);
  const uid = await userId(a);
  const { data, error } = await supabase.from('fahrzeug').select('*').order('created_at', { ascending: true }).limit(1);
  if (error) throw fehler(a, error);
  if (data && data.length > 0) return zuFahrzeug(data[0] as Record<string, unknown>);
  const neu = await supabase.from('fahrzeug').insert({ user_id: uid, name: 'Mein Auto' }).select('*').single();
  if (neu.error) throw fehler('Fahrzeug anlegen', neu.error);
  return zuFahrzeug(neu.data as Record<string, unknown>);
}

export async function speichereFahrzeug(f: Partial<Fahrzeug>): Promise<Fahrzeug> {
  if (DEMO) return (await demo()).speichereFahrzeug(f);
  const a = 'Fahrzeug speichern';
  pruefeKonfig(a);
  const id = f.id ?? (await holeFahrzeug()).id;
  const upd: Record<string, unknown> = {};
  if (f.name !== undefined) upd.name = f.name;
  if (f.tankvolumen_l !== undefined) upd.tankvolumen_l = f.tankvolumen_l;
  const { data, error } = await supabase.from('fahrzeug').update(upd).eq('id', id).select('*').single();
  if (error) throw fehler(a, error);
  return zuFahrzeug(data as Record<string, unknown>);
}

// ---------- Tankvorgänge ----------
export async function holeTankvorgaenge(fahrzeugId: string): Promise<Tankvorgang[]> {
  if (DEMO) return (await demo()).holeTankvorgaenge(fahrzeugId);
  const a = 'Einträge laden';
  pruefeKonfig(a);
  // PostgREST liefert standardmässig höchstens 1000 Zeilen pro Anfrage (max-rows): seitenweise laden, bis eine Seite
  // nicht mehr voll ist. Stabile Sortierung (km_stand, datum, id), damit keine Zeile doppelt/ausgelassen wird.
  const SEITE = 1000;
  const alle: Record<string, unknown>[] = [];
  for (let von = 0; ; von += SEITE) {
    const { data, error } = await supabase
      .from('tankvorgang').select('*').eq('fahrzeug_id', fahrzeugId)
      .order('km_stand', { ascending: true }).order('datum', { ascending: true }).order('id', { ascending: true })
      .range(von, von + SEITE - 1);
    if (error) throw fehler(a, error);
    const seite = (data ?? []) as Record<string, unknown>[];
    alle.push(...seite);
    if (seite.length < SEITE) break;
  }
  return alle.map((r) => zuVorgang(r));
}

/**
 * Speichert einen Eintrag. `id` = bestehender Eintrag (Update). `clientId` = vom Client erzeugte UUID für einen NEUEN
 * Eintrag: der Insert ist dann ein Upsert auf diese ID, ein Wiederholen nach abgebrochener Antwort (Timeout) legt keine
 * Doppel an.
 */
export async function speichereTankvorgang(
  e: Omit<Tankvorgang, 'id' | 'betrag_chf'> & { id?: string; clientId?: string },
): Promise<Tankvorgang> {
  if (DEMO) {
    const { clientId, ...rest } = e;
    return (await demo()).speichereTankvorgang({ ...rest, id: rest.id ?? clientId });
  }
  const a = 'Eintrag speichern';
  pruefeKonfig(a);
  const uid = await userId(a);
  const { id, clientId, ...rest } = e;
  const zeile: Record<string, unknown> = { ...rest, user_id: uid };
  delete zeile.betrag_chf;
  if (!id && clientId) {
    zeile.id = clientId;
    const { data, error } = await supabase.from('tankvorgang').upsert(zeile, { onConflict: 'id' }).select('*').single();
    if (error) throw fehler(a, error);
    return zuVorgang(data as Record<string, unknown>);
  }
  if (id) {
    zeile.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from('tankvorgang').update(zeile).eq('id', id).select('*').single();
    if (error) throw fehler(a, error);
    return zuVorgang(data as Record<string, unknown>);
  }
  const { data, error } = await supabase.from('tankvorgang').insert(zeile).select('*').single();
  if (error) throw fehler(a, error);
  return zuVorgang(data as Record<string, unknown>);
}

/**
 * Löscht den Eintrag (und optional die Fotos). Rückgabe: Warntext, falls der Eintrag gelöscht wurde, die Fotos aber nicht
 * entfernt werden konnten (dann ist der Eintrag weg; kein «Löschen fehlgeschlagen»), sonst null.
 */
export async function loescheTankvorgang(id: string, fotosLoeschen: boolean): Promise<string | null> {
  if (DEMO) { await (await demo()).loescheTankvorgang(id, fotosLoeschen); return null; }
  const a = 'Eintrag löschen';
  pruefeKonfig(a);
  const { data: alt, error: e1 } = await supabase
    .from('tankvorgang').select('beleg_foto_pfad,tacho_foto_pfad').eq('id', id).maybeSingle();
  if (e1) throw fehler(a, e1);
  const { error } = await supabase.from('tankvorgang').delete().eq('id', id);
  if (error) throw fehler(a, error);
  if (fotosLoeschen && alt) {
    const pfade = [alt.beleg_foto_pfad, alt.tacho_foto_pfad].filter((p): p is string => !!p);
    if (pfade.length) {
      const r = await supabase.storage.from(BUCKET).remove(pfade);
      if (r.error) return 'Der Eintrag wurde gelöscht, aber die Fotos konnten nicht entfernt werden. Sie bleiben im Speicher erhalten.';
    }
  }
  return null;
}

// ---------- Fotos ----------
export async function ladeFotoUrl(pfad: string): Promise<string> {
  if (DEMO) return (await demo()).ladeFotoUrl(pfad);
  const a = 'Foto laden';
  pruefeKonfig(a);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(pfad, 3600);
  if (error || !data) throw fehler(a, error ?? new Error('Keine URL erhalten.'));
  return data.signedUrl;
}

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  const h = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20)}`;
}

export async function ladeFotoHoch(blob: Blob): Promise<string> {
  if (DEMO) return (await demo()).ladeFotoHoch(blob);
  const a = 'Foto hochladen';
  pruefeKonfig(a);
  const uid = await userId(a);
  const pfad = `${uid}/${uuid()}.jpg`;
  const { error } = await supabase.storage.from(BUCKET).upload(pfad, blob, { contentType: 'image/jpeg', upsert: false });
  if (error) throw fehler(a, error);
  return pfad;
}

/** Entfernt hochgeladene, nicht gespeicherte Fotos (verwaiste Dateien). Best effort: Fehler werden ignoriert. */
export async function loescheFotos(pfade: string[]): Promise<void> {
  if (pfade.length === 0) return;
  if (DEMO) return;
  try {
    if (!konfiguriert) return;
    await supabase.storage.from(BUCKET).remove(pfade);
  } catch { /* best effort */ }
}

/** Client-seitig erzeugte UUID (für idempotentes Speichern neuer Einträge). */
export const neueId = uuid;

// ---------- Erkennung ----------
export async function ruftErkennung(req: ExtractRequest, signal?: AbortSignal): Promise<Erkennung> {
  if (DEMO) return (await demo()).ruftErkennung(req, signal);
  const a = 'Erkennung';
  pruefeKonfig(a);
  const { data, error } = await supabase.auth.getSession();
  if (error) throw fehler(a, error);
  const token = data.session?.access_token;
  if (!token) throw new Error(`${a}: Nicht angemeldet. Bitte anmelden.`);

  const ctrl = new AbortController();
  let zeitUeberschritten = false;
  const timer = setTimeout(() => { zeitUeberschritten = true; ctrl.abort(); }, 20000);
  const extern = () => ctrl.abort();
  if (signal) {
    if (signal.aborted) ctrl.abort();
    else signal.addEventListener('abort', extern, { once: true });
  }
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
      body: JSON.stringify(req),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      let detail = '';
      try { detail = ((await res.json()) as { error?: string }).error ?? ''; } catch { /* kein JSON */ }
      throw new Error(`${a} fehlgeschlagen (${res.status})${detail ? `: ${detail}` : '.'}`);
    }
    return (await res.json()) as Erkennung;
  } catch (e) {
    if (zeitUeberschritten) throw new Error(`${a}: Zeitüberschreitung nach 20 Sekunden.`);
    if (signal?.aborted) throw new Error(`${a} abgebrochen.`);
    if (e instanceof Error && e.message.startsWith(a)) throw e;
    throw fehler(a, e);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', extern);
  }
}

// ---------- Einstellungen ----------
const LS_EINST = 'tankbuch.einstellungen';

function lokal(): Einstellungen {
  try {
    const t = localStorage.getItem(LS_EINST);
    if (t) return { ...STANDARD_EINST, ...(JSON.parse(t) as Partial<Einstellungen>) };
  } catch { /* Speicher gesperrt */ }
  return { ...STANDARD_EINST };
}

/** localStorage für das UI-Flag, Tabelle `einstellung` (user_id, daten jsonb) als Quelle der Wahrheit. */
export async function holeEinstellungen(): Promise<Einstellungen> {
  const l = lokal();
  if (DEMO || !konfiguriert) return l;
  try {
    const uid = await userId('Einstellungen laden');
    const { data, error } = await supabase.from('einstellung').select('daten').eq('user_id', uid).maybeSingle();
    if (error || !data) return l;
    const d = (data.daten ?? {}) as Partial<Einstellungen>;
    return {
      geschaetzteMitrechnen: d.geschaetzteMitrechnen ?? l.geschaetzteMitrechnen,
      unvollstaendigeSegmente: Array.isArray(d.unvollstaendigeSegmente) ? d.unvollstaendigeSegmente : [],
    };
  } catch {
    return l;
  }
}

export async function speichereEinstellungen(e: Einstellungen): Promise<void> {
  const a = 'Einstellungen speichern';
  try { localStorage.setItem(LS_EINST, JSON.stringify(e)); } catch { /* Speicher gesperrt */ }
  if (DEMO) return;
  pruefeKonfig(a);
  const uid = await userId(a);
  const { error } = await supabase.from('einstellung').upsert({ user_id: uid, daten: e }, { onConflict: 'user_id' });
  if (error) throw fehler(a, error);
}

// ---------- Tankstellen-Aliase ----------
/** Liefert { von: nach }. */
export async function holeAliase(): Promise<Record<string, string>> {
  if (DEMO) return (await demo()).holeAliase();
  const a = 'Tankstellen laden';
  pruefeKonfig(a);
  const { data, error } = await supabase.from('tankstelle_alias').select('von,nach');
  if (error) throw fehler(a, error);
  const m: Record<string, string> = {};
  for (const r of data ?? []) m[String(r.von)] = String(r.nach);
  return m;
}

export async function speichereAlias(von: string, nach: string): Promise<void> {
  if (DEMO) return (await demo()).speichereAlias(von, nach);
  const a = 'Tankstelle speichern';
  pruefeKonfig(a);
  const uid = await userId(a);
  const { error } = await supabase.from('tankstelle_alias').upsert({ user_id: uid, von, nach }, { onConflict: 'user_id,von' });
  if (error) throw fehler(a, error);
}

/** Benennt eine Tankstelle in allen Einträgen um (oder führt sie mit einer anderen zusammen) und merkt den Alias. */
export async function benenneTankstelleUm(von: string, nach: string): Promise<void> {
  if (DEMO) return (await demo()).benenneTankstelleUm(von, nach);
  const a = 'Tankstelle umbenennen';
  pruefeKonfig(a);
  const { error } = await supabase.from('tankvorgang').update({ tankstelle: nach }).eq('tankstelle', von);
  if (error) throw fehler(a, error);
  await speichereAlias(von, nach);
}

// ---------- Sitzung ----------
export async function meldeAb(): Promise<void> {
  if (DEMO) return (await demo()).meldeAb();
  const { error } = await supabase.auth.signOut();
  if (error) throw fehler('Abmelden', error);
}

/**
 * Anmeldung mit dem Code aus der E-Mail (statt Link). Nötig für die App auf dem iPhone-Homescreen:
 * sie hat einen eigenen Speicher, der Link öffnet sich aber in Safari.
 */
export async function pruefeAnmeldecode(email: string, code: string): Promise<void> {
  pruefeKonfig('Anmeldung');
  const { error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
  if (error) {
    if (/expired|invalid/i.test(error.message)) {
      throw new Error('Der Code ist falsch oder abgelaufen. Bitte prüfen oder einen neuen Code anfordern.');
    }
    if (/rate limit|too many/i.test(error.message)) {
      throw new Error('Zu viele Versuche. Bitte kurz warten und erneut versuchen.');
    }
    throw fehler('Anmeldung', error);
  }
}

export async function sendeMagicLink(email: string): Promise<void> {
  pruefeKonfig('Anmeldung');
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: location.origin + location.pathname, shouldCreateUser: true },
  });
  if (error) {
    if (/rate limit|too many|seconds/i.test(error.message)) {
      throw new Error('Anmeldung: Zu viele Anfragen. Bitte eine Minute warten und erneut versuchen.');
    }
    if (/invalid.*email|valid email/i.test(error.message)) throw new Error('Anmeldung: Die E-Mail-Adresse ist ungültig.');
    if (/signups? not allowed|not allowed for otp/i.test(error.message)) {
      throw new Error('Anmeldung: Diese E-Mail-Adresse ist nicht zugelassen (Registrierung ist geschlossen).');
    }
    throw fehler('Anmeldung', error);
  }
}
