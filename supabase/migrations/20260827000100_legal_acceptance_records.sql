-- Persist a server-timestamped record of the Terms and Privacy Policy accepted
-- during adult account creation. The client also stores the same version and
-- client timestamp in Auth metadata so the record survives email confirmation.

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  terms_version text not null,
  privacy_version text not null,
  accepted_at timestamptz not null default now(),
  client_accepted_at text,
  source text not null default 'mobile_app' check (source in ('mobile_app')),
  created_at timestamptz not null default now(),
  unique (user_id, terms_version, privacy_version)
);

alter table public.legal_acceptances enable row level security;

drop policy if exists legal_acceptances_self_select on public.legal_acceptances;
create policy legal_acceptances_self_select
  on public.legal_acceptances for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.record_new_user_legal_acceptance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_terms text := new.raw_user_meta_data ->> 'legal_terms_version';
  v_privacy text := new.raw_user_meta_data ->> 'legal_privacy_version';
begin
  -- Whitelisting prevents arbitrary metadata from becoming an acceptance
  -- record. Add a new accepted version here when the public documents change.
  if v_terms = '2026-08-27'
     and v_privacy = '2026-08-27'
     and coalesce(new.raw_user_meta_data ->> 'account_type', '') = 'adult' then
    insert into public.legal_acceptances(
      user_id, terms_version, privacy_version, client_accepted_at, source
    ) values (
      new.id,
      v_terms,
      v_privacy,
      new.raw_user_meta_data ->> 'legal_accepted_at',
      'mobile_app'
    ) on conflict (user_id, terms_version, privacy_version) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_record_legal_acceptance on auth.users;
create trigger on_auth_user_created_record_legal_acceptance
  after insert on auth.users
  for each row execute function public.record_new_user_legal_acceptance();

revoke all on function public.record_new_user_legal_acceptance() from public, anon, authenticated;
grant select on public.legal_acceptances to authenticated;
