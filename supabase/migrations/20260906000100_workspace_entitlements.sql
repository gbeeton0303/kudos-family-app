-- Workspace-wide App Store access for Kudos Family.
-- StoreKit transactions are verified by the entitlement-action Edge Function
-- and recorded here with the service role. Client accounts receive read-only
-- access to the resulting workspace entitlement.

create table if not exists public.workspace_entitlements (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  status text not null default 'not_started' check (status in ('not_started', 'trial', 'lifetime')),
  billing_owner_id uuid references auth.users(id) on delete set null,
  trial_started_at timestamptz,
  trial_expires_at timestamptz,
  lifetime_unlocked_at timestamptz,
  source_product_id text,
  source_transaction_id text,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (status = 'not_started')
    or (status = 'trial' and trial_started_at is not null and trial_expires_at is not null)
    or (status = 'lifetime' and lifetime_unlocked_at is not null)
  )
);

create table if not exists public.app_store_transactions (
  transaction_id text primary key,
  original_transaction_id text,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  purchaser_user_id uuid references auth.users(id) on delete set null,
  product_id text not null check (product_id in (
    'com.beeton.kudosfamily.trial.7day',
    'com.beeton.kudosfamily.lifetime'
  )),
  environment text not null check (environment in ('Production', 'Sandbox', 'Xcode', 'Unknown')),
  purchase_date timestamptz not null,
  verified_at timestamptz not null default now()
);

create index if not exists app_store_transactions_workspace_idx
  on public.app_store_transactions(workspace_id, verified_at desc);

insert into public.workspace_entitlements(workspace_id, billing_owner_id)
select id, created_by from public.workspaces
on conflict (workspace_id) do nothing;

create or replace function public.create_workspace_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_entitlements(workspace_id, billing_owner_id)
  values (new.id, new.created_by)
  on conflict (workspace_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_workspace_entitlement() from public;

drop trigger if exists after_workspace_create_entitlement on public.workspaces;
create trigger after_workspace_create_entitlement
after insert on public.workspaces
for each row execute function public.create_workspace_entitlement();

alter table public.workspace_entitlements enable row level security;
alter table public.app_store_transactions enable row level security;

drop policy if exists "Workspace members read entitlement" on public.workspace_entitlements;
create policy "Workspace members read entitlement"
on public.workspace_entitlements for select
to authenticated
using (public.is_workspace_member(workspace_id));

-- Transaction identifiers remain server-only. Workspace members need only the
-- normalized entitlement row and never receive the Apple verification payload.
revoke all on public.app_store_transactions from anon, authenticated;
grant select on public.workspace_entitlements to authenticated;

create or replace function public.apply_verified_app_store_transaction(
  p_workspace_id uuid,
  p_purchaser_user_id uuid,
  p_product_id text,
  p_transaction_id text,
  p_original_transaction_id text,
  p_environment text,
  p_purchase_date timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement public.workspace_entitlements%rowtype;
  v_existing_workspace uuid;
  v_role text;
begin
  if p_product_id not in (
    'com.beeton.kudosfamily.trial.7day',
    'com.beeton.kudosfamily.lifetime'
  ) then
    raise exception 'This App Store product is not recognized.';
  end if;

  if coalesce(trim(p_transaction_id), '') = '' then
    raise exception 'The verified App Store transaction is missing its identifier.';
  end if;

  select role into v_role
  from public.workspace_members
  where workspace_id = p_workspace_id and user_id = p_purchaser_user_id;

  if v_role is null or v_role not in ('parent', 'teacher') then
    raise exception 'Only an adult workspace manager can purchase access.';
  end if;

  insert into public.workspace_entitlements(workspace_id, billing_owner_id)
  select p_workspace_id, w.created_by from public.workspaces w where w.id = p_workspace_id
  on conflict (workspace_id) do nothing;

  select * into v_entitlement
  from public.workspace_entitlements
  where workspace_id = p_workspace_id
  for update;

  if v_entitlement.workspace_id is null then
    raise exception 'The family or classroom could not be found.';
  end if;

  if v_entitlement.billing_owner_id is not null
     and v_entitlement.billing_owner_id <> p_purchaser_user_id then
    raise exception 'Only the family or classroom creator can manage this purchase.';
  end if;

  select workspace_id into v_existing_workspace
  from public.app_store_transactions
  where transaction_id = p_transaction_id;

  if v_existing_workspace is not null and v_existing_workspace <> p_workspace_id then
    raise exception 'This App Store purchase is already attached to another workspace.';
  end if;

  if v_existing_workspace = p_workspace_id then
    return jsonb_build_object('workspace_id', p_workspace_id, 'status', v_entitlement.status, 'idempotent', true);
  end if;

  if p_product_id = 'com.beeton.kudosfamily.trial.7day'
     and v_entitlement.status <> 'not_started' then
    raise exception 'The free trial has already been started for this workspace.';
  end if;

  insert into public.app_store_transactions(
    transaction_id, original_transaction_id, workspace_id, purchaser_user_id,
    product_id, environment, purchase_date
  ) values (
    p_transaction_id, nullif(p_original_transaction_id, ''), p_workspace_id,
    p_purchaser_user_id, p_product_id,
    case when p_environment in ('Production', 'Sandbox', 'Xcode') then p_environment else 'Unknown' end,
    p_purchase_date
  );

  if p_product_id = 'com.beeton.kudosfamily.lifetime' then
    update public.workspace_entitlements
    set status = 'lifetime',
        billing_owner_id = coalesce(billing_owner_id, p_purchaser_user_id),
        lifetime_unlocked_at = p_purchase_date,
        source_product_id = p_product_id,
        source_transaction_id = p_transaction_id,
        last_verified_at = now(),
        updated_at = now()
    where workspace_id = p_workspace_id;
  else
    update public.workspace_entitlements
    set status = 'trial',
        billing_owner_id = coalesce(billing_owner_id, p_purchaser_user_id),
        trial_started_at = p_purchase_date,
        trial_expires_at = p_purchase_date + interval '7 days',
        source_product_id = p_product_id,
        source_transaction_id = p_transaction_id,
        last_verified_at = now(),
        updated_at = now()
    where workspace_id = p_workspace_id;
  end if;

  select * into v_entitlement
  from public.workspace_entitlements
  where workspace_id = p_workspace_id;

  return jsonb_build_object('workspace_id', p_workspace_id, 'status', v_entitlement.status, 'idempotent', false);
end;
$$;

revoke all on function public.apply_verified_app_store_transaction(uuid, uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_verified_app_store_transaction(uuid, uuid, text, text, text, text, timestamptz) to service_role;

-- New adult registrations accept the purchase-aware September documents.
-- Keep the prior version valid for users completing an older confirmation link.
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
  if (
      (v_terms = '2026-08-27' and v_privacy = '2026-08-27')
      or (v_terms = '2026-09-06' and v_privacy = '2026-09-06')
    )
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

revoke all on function public.record_new_user_legal_acceptance() from public, anon, authenticated;
