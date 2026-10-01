-- Tankbuch: Schema gemäss SPEC Abschnitt 4

create table public.fahrzeug (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null,
  tankvolumen_l numeric(5,1) check (tankvolumen_l is null or tankvolumen_l > 0),
  created_at    timestamptz not null default now()
);

create table public.tankvorgang (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  fahrzeug_id       uuid not null references public.fahrzeug(id) on delete cascade,
  datum             date not null,
  uhrzeit           time,
  km_stand          integer not null check (km_stand > 0),
  liter             numeric(6,2) not null check (liter > 0),
  betrag            numeric(8,2) not null check (betrag >= 0),
  waehrung          text not null default 'CHF',
  wechselkurs       numeric(8,4) not null default 1 check (wechselkurs > 0),
  betrag_chf        numeric(8,2) generated always as (round(betrag * wechselkurs, 2)) stored,
  preis_pro_liter   numeric(6,3) not null,
  tankstelle        text,
  kraftstoff        text,
  volltankung       boolean not null default true,
  geschaetzt        boolean not null default false,
  notiz             text,
  konfidenz         jsonb,
  roh_erkennung     jsonb,
  beleg_foto_pfad   text,
  tacho_foto_pfad   text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index tankvorgang_fahrzeug_datum_km_idx
  on public.tankvorgang (fahrzeug_id, datum, km_stand);
create index tankvorgang_user_idx on public.tankvorgang (user_id);
create index fahrzeug_user_idx on public.fahrzeug (user_id);

alter table public.fahrzeug    enable row level security;
alter table public.tankvorgang enable row level security;

create policy "eigene fahrzeuge" on public.fahrzeug
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "eigene vorgaenge" on public.tankvorgang
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- updated_at automatisch nachführen
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tankvorgang_set_updated_at
  before update on public.tankvorgang
  for each row execute function public.set_updated_at();
