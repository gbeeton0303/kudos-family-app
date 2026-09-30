-- Track whether Apple says a lifetime transaction was purchased directly or
-- inherited through Apple Family Sharing. Direct purchases remain permanent;
-- Apple-owned access is reconciled against StoreKit whenever the app opens.

alter table public.workspace_entitlements
  add column if not exists source_ownership_type text
  check (source_ownership_type is null or source_ownership_type in ('PURCHASED', 'FAMILY_SHARED'));

alter table public.app_store_transactions
  add column if not exists ownership_type text not null default 'PURCHASED'
  check (ownership_type in ('PURCHASED', 'FAMILY_SHARED'));

update public.workspace_entitlements
set source_ownership_type = 'PURCHASED'
where status = 'lifetime' and source_ownership_type is null;

create or replace function public.create_workspace_entitlement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lifetime public.workspace_entitlements%rowtype;
begin
  select we.* into v_lifetime
  from public.workspace_entitlements we
  join public.workspaces w on w.id = we.workspace_id
  where w.created_by = new.created_by
    and we.status = 'lifetime'
  order by we.lifetime_unlocked_at asc nulls last
  limit 1;

  if v_lifetime.workspace_id is not null then
    insert into public.workspace_entitlements(
      workspace_id, status, billing_owner_id, lifetime_unlocked_at,
      source_product_id, source_transaction_id, source_ownership_type,
      last_verified_at
    ) values (
      new.id, 'lifetime', new.created_by, v_lifetime.lifetime_unlocked_at,
      v_lifetime.source_product_id, v_lifetime.source_transaction_id,
      v_lifetime.source_ownership_type, v_lifetime.last_verified_at
    ) on conflict (workspace_id) do nothing;
  else
    insert into public.workspace_entitlements(workspace_id, billing_owner_id)
    values (new.id, new.created_by)
    on conflict (workspace_id) do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.create_workspace_entitlement() from public, anon, authenticated;

drop function if exists public.apply_verified_app_store_transaction(uuid, uuid, text, text, text, text, timestamptz);

create or replace function public.apply_verified_app_store_transaction(
  p_workspace_id uuid,
  p_purchaser_user_id uuid,
  p_product_id text,
  p_transaction_id text,
  p_original_transaction_id text,
  p_environment text,
  p_purchase_date timestamptz,
  p_ownership_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement public.workspace_entitlements%rowtype;
  v_existing_workspace uuid;
  v_existing_purchaser uuid;
  v_role text;
  v_workspace_owner uuid;
  v_idempotent boolean := false;
begin
  if p_product_id <> 'com.beeton.kudosfamily.lifetime' then
    raise exception 'This App Store product is not recognized.';
  end if;
  if p_ownership_type not in ('PURCHASED', 'FAMILY_SHARED') then
    raise exception 'Apple returned an unsupported purchase ownership type.';
  end if;
  if coalesce(trim(p_transaction_id), '') = '' then
    raise exception 'The verified App Store transaction is missing its identifier.';
  end if;

  select wm.role, w.created_by into v_role, v_workspace_owner
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.workspace_id = p_workspace_id and wm.user_id = p_purchaser_user_id;

  if v_role is null or v_role not in ('parent', 'teacher') then
    raise exception 'Only an adult workspace manager can purchase access.';
  end if;
  if v_workspace_owner is distinct from p_purchaser_user_id then
    raise exception 'Only the family or classroom creator can manage this purchase.';
  end if;

  insert into public.workspace_entitlements(workspace_id, billing_owner_id)
  values (p_workspace_id, v_workspace_owner)
  on conflict (workspace_id) do nothing;

  select workspace_id, purchaser_user_id
  into v_existing_workspace, v_existing_purchaser
  from public.app_store_transactions
  where transaction_id = p_transaction_id;

  if v_existing_workspace is not null
     and v_existing_purchaser is distinct from p_purchaser_user_id then
    raise exception 'This App Store purchase belongs to a different Kudos adult account.';
  end if;

  if v_existing_workspace is null then
    insert into public.app_store_transactions(
      transaction_id, original_transaction_id, workspace_id, purchaser_user_id,
      product_id, environment, purchase_date, ownership_type
    ) values (
      p_transaction_id, nullif(p_original_transaction_id, ''), p_workspace_id,
      p_purchaser_user_id, p_product_id,
      case when p_environment in ('Production', 'Sandbox', 'Xcode') then p_environment else 'Unknown' end,
      p_purchase_date, p_ownership_type
    );
  else
    v_idempotent := true;
    update public.app_store_transactions
    set ownership_type = p_ownership_type,
        verified_at = now()
    where transaction_id = p_transaction_id;
  end if;

  insert into public.workspace_entitlements(workspace_id, billing_owner_id)
  select w.id, p_purchaser_user_id
  from public.workspaces w
  where w.created_by = p_purchaser_user_id
  on conflict (workspace_id) do nothing;

  update public.workspace_entitlements we
  set status = 'lifetime',
      billing_owner_id = p_purchaser_user_id,
      lifetime_unlocked_at = coalesce(we.lifetime_unlocked_at, p_purchase_date),
      source_product_id = p_product_id,
      source_transaction_id = p_transaction_id,
      source_ownership_type = p_ownership_type,
      last_verified_at = now(),
      updated_at = now()
  from public.workspaces w
  where we.workspace_id = w.id
    and w.created_by = p_purchaser_user_id;

  select * into v_entitlement
  from public.workspace_entitlements
  where workspace_id = p_workspace_id;

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'status', v_entitlement.status,
    'ownership_type', v_entitlement.source_ownership_type,
    'idempotent', v_idempotent
  );
end;
$$;

revoke all on function public.apply_verified_app_store_transaction(uuid, uuid, text, text, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.apply_verified_app_store_transaction(uuid, uuid, text, text, text, text, timestamptz, text) to service_role;

-- Called only after StoreKit successfully returns the current active purchase
-- list and the lifetime product is absent. Keeping this service-
-- role-only prevents clients from altering entitlements directly.
create or replace function public.revoke_missing_apple_entitlement(
  p_workspace_id uuid,
  p_requester_user_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_role text;
  v_updated integer := 0;
begin
  select w.created_by, wm.role into v_owner, v_role
  from public.workspaces w
  join public.workspace_members wm
    on wm.workspace_id = w.id and wm.user_id = p_requester_user_id
  where w.id = p_workspace_id;

  if v_owner is distinct from p_requester_user_id
     or v_role is null
     or v_role not in ('parent', 'teacher') then
    raise exception 'Only the workspace creator can reconcile Apple purchase access.';
  end if;

  update public.workspace_entitlements we
  set status = 'trial',
      trial_started_at = coalesce(we.trial_started_at, now() - interval '7 days'),
      trial_expires_at = least(coalesce(we.trial_expires_at, now()), now()),
      lifetime_unlocked_at = null,
      source_product_id = null,
      source_transaction_id = null,
      source_ownership_type = null,
      last_verified_at = now(),
      updated_at = now()
  from public.workspaces w
  where we.workspace_id = w.id
    and w.created_by = p_requester_user_id
    and we.status = 'lifetime'
    and we.source_ownership_type in ('PURCHASED', 'FAMILY_SHARED');

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.revoke_missing_apple_entitlement(uuid, uuid) from public, anon, authenticated;
grant execute on function public.revoke_missing_apple_entitlement(uuid, uuid) to service_role;
