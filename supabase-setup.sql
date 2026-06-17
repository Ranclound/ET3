-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query).

create table if not exists app_data (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Keep updated_at fresh on every write.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists app_data_set_updated_at on app_data;
create trigger app_data_set_updated_at
before update on app_data
for each row execute function set_updated_at();

-- Row Level Security: lock the table down completely. The Next.js API routes
-- talk to Supabase using the SERVICE ROLE key, which bypasses RLS entirely
-- and only runs on the server. No anon/public key is used in this app, so
-- with RLS enabled and no permissive policies, the table cannot be read or
-- written directly from a browser even if someone finds your Supabase URL.
alter table app_data enable row level security;

-- Intentionally no policies are created: default-deny for anon and authenticated roles.
