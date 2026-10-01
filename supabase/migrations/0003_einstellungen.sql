-- Einstellungen (ein JSON-Dokument pro Nutzer) und Tankstellen-Aliase

create table public.einstellung (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  daten      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.tankstelle_alias (
  user_id uuid not null references auth.users(id) on delete cascade,
  von     text not null,
  nach    text not null,
  primary key (user_id, von)
);

alter table public.einstellung      enable row level security;
alter table public.tankstelle_alias enable row level security;

create policy "eigene einstellung" on public.einstellung
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "eigene aliase" on public.tankstelle_alias
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger einstellung_set_updated_at
  before update on public.einstellung
  for each row execute function public.set_updated_at();
