-- Explizite Zugriffsrechte für die Data API.
-- Nötig, wenn beim Anlegen des Projekts «Automatically expose new tables» ausgeschaltet ist
-- (von Supabase empfohlen). Schadet nicht, wenn die Option eingeschaltet war.
-- Nur angemeldete Nutzer (Rolle «authenticated»); RLS beschränkt zusätzlich auf eigene Zeilen.
-- Die Rolle «anon» erhält bewusst keine Rechte.

grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.fahrzeug         to authenticated;
grant select, insert, update, delete on table public.tankvorgang      to authenticated;
grant select, insert, update, delete on table public.einstellung      to authenticated;
grant select, insert, update, delete on table public.tankstelle_alias to authenticated;

revoke all on table public.fahrzeug         from anon;
revoke all on table public.tankvorgang      from anon;
revoke all on table public.einstellung      from anon;
revoke all on table public.tankstelle_alias from anon;
