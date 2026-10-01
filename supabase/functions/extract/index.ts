// Supabase Edge Function «extract» (Deno). Speichert nichts, gibt nur die Erkennung zurück.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { ANTHROPIC_URL, ANTHROPIC_VERSION, BUCKET, EFFORT, MAX_BILD_BYTES, MAX_TOKENS, MODELL_ID, RATE_FENSTER_MS, RATE_MAX_ANFRAGEN, TIMEOUT_MS } from './config.ts';
import { ANTWORT_SCHEMA, baueNutzerText, baueNutzerTextBilder, SYSTEM_PROMPT } from './prompt.ts';
import { festeZuordnung, parseModellJson, validiereErkennung } from './validate.ts';
import { RateLimiter, bildTyp, istErlaubt, parseAllowlist } from './zugriff.ts';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function antwort(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
const fehler = (status: number, msg: string) => antwort(status, { error: msg });

const PFAD_RE = /^[0-9a-f-]{36}\/[A-Za-z0-9._-]+\.(jpe?g|png)$/i;
const MAX_BILDER = 2;

const limiter = new RateLimiter(RATE_MAX_ANFRAGEN, RATE_FENSTER_MS);

function pfadOk(pfad: unknown, userId: string): pfad is string {
  return (
    typeof pfad === 'string' &&
    pfad.startsWith(`${userId}/`) &&
    !pfad.includes('..') &&
    PFAD_RE.test(pfad)
  );
}

function nachBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

interface Bild { media_type: string; data: string }

async function rufeAnthropic(
  key: string,
  bilder: Bild[],
  nutzerText: string,
  extraAnweisung: string | null,
  signal: AbortSignal,
  nummeriert: boolean,
): Promise<string> {
  const content: unknown[] = [];
  bilder.forEach((b, i) => {
    // Neue Anfrageform: jedes Bild bekommt eine Nummer, auf die sich «zuordnung» bezieht.
    if (nummeriert) content.push({ type: 'text', text: `Bild ${i + 1}:` });
    content.push({ type: 'image', source: { type: 'base64', media_type: b.media_type, data: b.data } });
  });
  content.push({ type: 'text', text: extraAnweisung ? `${nutzerText} ${extraAnweisung}` : nutzerText });
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: MODELL_ID,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      // Structured Outputs: die API garantiert JSON nach ANTWORT_SCHEMA; validate.ts prüft zusätzlich die Werte.
      output_config: { effort: EFFORT, format: { type: 'json_schema', schema: ANTWORT_SCHEMA } },
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) {
    // Fehlertyp der API loggen (enthält keine Bilder/Keys), damit Fehler im Supabase-Log nachvollziehbar sind.
    const fehlerTyp = await res.json().then((b) => b?.error?.type ?? '?').catch(() => '?');
    console.error('Anthropic HTTP', res.status, fehlerTyp);
    throw new Error(`anthropic_${res.status}`);
  }
  const j = await res.json();
  if (j?.stop_reason !== 'end_turn') console.error('Anthropic stop_reason', j?.stop_reason);
  const teile = Array.isArray(j?.content) ? j.content : [];
  const text = teile
    .filter((c: { type?: string }) => c?.type === 'text')
    .map((c: { text?: string }) => c.text ?? '')
    .join('');
  return text;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return fehler(405, 'Nur POST erlaubt.');

  try {
    // 1. JWT prüfen
    const auth = req.headers.get('Authorization') ?? '';
    if (!auth.toLowerCase().startsWith('bearer ')) return fehler(401, 'Nicht angemeldet.');
    const url = Deno.env.get('SUPABASE_URL');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!url || !anon) return fehler(500, 'Server nicht konfiguriert.');
    if (!apiKey) return fehler(500, 'ANTHROPIC_API_KEY ist nicht gesetzt.');

    const sb = createClient(url, anon, { global: { headers: { Authorization: auth } } });
    const { data: u, error: uErr } = await sb.auth.getUser(auth.slice(7).trim());
    if (uErr || !u?.user) return fehler(401, 'Anmeldung ungültig oder abgelaufen.');
    const userId = u.user.id;

    // 1b. Nur erlaubte Nutzer (Secret ALLOWED_EMAILS, kommagetrennt; leer = alle angemeldeten Nutzer)
    if (!istErlaubt(u.user.email, parseAllowlist(Deno.env.get('ALLOWED_EMAILS')))) {
      console.error('extract: Nutzer nicht in ALLOWED_EMAILS'); // keine Adresse loggen
      return fehler(403, 'Dieses Konto ist für die Erkennung nicht freigeschaltet.');
    }
    // 1c. Mengenbegrenzung je Nutzer
    if (!limiter.pruefe(userId)) {
      return new Response(JSON.stringify({ error: 'Zu viele Anfragen. Bitte kurz warten.' }), {
        status: 429,
        headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8', 'Retry-After': String(limiter.warteSekunden(userId)) },
      });
    }

    // 2. Eingabe validieren
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return fehler(400, 'Ungültiger Request-Body.');
    }
    // Neue Form: bilder = 1..2 Pfade, Zuordnung durch das Modell. Alte Form: beleg_pfad / tacho_pfad (feste Zuordnung).
    const neueForm = body.bilder !== undefined && body.bilder !== null;
    let pfade: string[];
    let belegPfad: string | null = null;
    let tachoPfad: string | null = null;
    if (neueForm) {
      if (!Array.isArray(body.bilder) || body.bilder.length < 1 || body.bilder.length > MAX_BILDER) {
        return fehler(400, `«bilder» muss 1 bis ${MAX_BILDER} Fotopfade enthalten.`);
      }
      if (body.bilder.some((p) => typeof p !== 'string')) return fehler(400, '«bilder» enthält ungültige Pfade.');
      pfade = body.bilder as string[];
      if (new Set(pfade).size !== pfade.length) return fehler(400, '«bilder» enthält denselben Pfad mehrfach.');
    } else {
      belegPfad = (body.beleg_pfad ?? null) as string | null;
      tachoPfad = (body.tacho_pfad ?? null) as string | null;
      if (belegPfad === null && tachoPfad === null) {
        return fehler(400, 'Mindestens ein Foto (bilder, beleg_pfad oder tacho_pfad) ist nötig.');
      }
      pfade = [belegPfad, tachoPfad].filter((p): p is string => p !== null);
    }
    // Pfad- und Grössenprüfungen gelten für alle Bilder
    for (const p of pfade) {
      if (!pfadOk(p, userId)) return fehler(403, 'Zugriff auf dieses Foto nicht erlaubt.');
    }
    const h = (typeof body.hinweise === 'object' && body.hinweise !== null ? body.hinweise : {}) as Record<string, unknown>;
    const hinweise = {
      letzter_km_stand:
        typeof h.letzter_km_stand === 'number' && Number.isFinite(h.letzter_km_stand) ? h.letzter_km_stand : undefined,
      letzte_tankstellen: Array.isArray(h.letzte_tankstellen)
        ? h.letzte_tankstellen.filter((s): s is string => typeof s === 'string').slice(0, 20)
        : undefined,
    };

    // 3. Bilder mit dem JWT des Nutzers laden (Storage-RLS greift zusätzlich)
    const bilder: Bild[] = [];
    for (const p of pfade) {
      const { data, error } = await sb.storage.from(BUCKET).download(p);
      if (error || !data) return fehler(404, 'Foto nicht gefunden.');
      if (data.size > MAX_BILD_BYTES) return fehler(413, 'Foto ist zu gross (höchstens 5 MB je Bild).');
      const bytes = new Uint8Array(await data.arrayBuffer());
      const typ = bildTyp(bytes); // Dateikopf muss JPEG oder PNG sein (nicht nur die Endung)
      if (typ === null) return fehler(415, 'Nur JPEG- oder PNG-Fotos werden unterstützt.');
      bilder.push({ media_type: typ, data: nachBase64(bytes) });
    }

    // 4. Anthropic aufrufen (Gesamttimeout, ein Wiederholungsversuch bei ungültigem JSON)
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      // Alle Bilder in EINEM Aufruf
      const text = neueForm
        ? baueNutzerTextBilder(bilder.length, hinweise)
        : baueNutzerText(belegPfad !== null, tachoPfad !== null, hinweise);
      let roh = parseModellJson(await rufeAnthropic(apiKey, bilder, text, null, ctrl.signal, neueForm));
      if (roh === null) {
        roh = parseModellJson(
          await rufeAnthropic(
            apiKey,
            bilder,
            text,
            'Deine letzte Antwort war kein gültiges JSON. Antworte NUR mit dem JSON-Objekt.',
            ctrl.signal,
            neueForm,
          ),
        );
      }
      if (roh === null) return fehler(502, 'Die Erkennung lieferte keine gültige Antwort.');
      if (neueForm) return antwort(200, validiereErkennung(roh, hinweise, pfade));
      const erk = validiereErkennung(roh, hinweise);
      erk.zuordnung = festeZuordnung(belegPfad, tachoPfad);
      return antwort(200, erk);
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') {
        return fehler(504, 'Die Erkennung hat zu lange gedauert.');
      }
      console.error('extract Fehler:', e instanceof Error ? e.message : 'unbekannt');
      return fehler(502, 'Die Erkennung ist fehlgeschlagen.');
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    console.error('extract unerwarteter Fehler:', e instanceof Error ? e.message : 'unbekannt');
    return fehler(500, 'Interner Fehler.');
  }
});
