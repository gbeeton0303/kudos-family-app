-- Allow one adult account to own both a family and a classroom while keeping
-- each workspace's profiles, tasks, rewards, and history isolated.

create or replace function public.create_workspace(p_name text, p_type text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_role text;
  v_user_id uuid := (select auth.uid());
  v_normalized_name text := trim(coalesce(p_name, ''));
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from auth.users where id=v_user_id and is_anonymous is true)
     or coalesce((select auth.jwt()->'user_metadata'->>'account_type'),'')='child' then
    raise exception 'Child accounts cannot create a family or classroom';
  end if;
  if p_type not in ('family', 'classroom') then raise exception 'Invalid workspace type'; end if;
  if length(v_normalized_name) < 2 or length(v_normalized_name) > 80 then
    raise exception 'Enter a name between 2 and 80 characters.';
  end if;

  -- Serialize creation per adult/type so rapid duplicate taps cannot create
  -- two family or two classroom workspaces for the same owner.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_type, 0));

  select id into v_id
  from public.workspaces
  where created_by = v_user_id and type = p_type
  order by created_at asc
  limit 1;

  if v_id is not null then
    v_role := case when p_type = 'classroom' then 'teacher' else 'parent' end;
    insert into public.workspace_members(workspace_id, user_id, role)
    values (v_id, v_user_id, v_role)
    on conflict (workspace_id, user_id) do update set role = excluded.role;
    return v_id;
  end if;

  v_role := case when p_type = 'classroom' then 'teacher' else 'parent' end;
  insert into public.workspaces(name, type, created_by)
  values (v_normalized_name, p_type, v_user_id)
  returning id into v_id;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_id, v_user_id, v_role);
  return v_id;
end;
$$;

revoke all on function public.create_workspace(text, text) from public, anon;
grant execute on function public.create_workspace(text, text) to authenticated;

-- A newly created second workspace inherits a lifetime entitlement already
-- purchased by the same adult. Trials remain workspace-specific.
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
      source_product_id, source_transaction_id, last_verified_at
    ) values (
      new.id, 'lifetime', new.created_by, v_lifetime.lifetime_unlocked_at,
      v_lifetime.source_product_id, v_lifetime.source_transaction_id,
      v_lifetime.last_verified_at
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

-- Backfill a second workspace that may already exist before this migration.
with lifetime_owner as (
  select distinct on (w.created_by)
    w.created_by,
    we.lifetime_unlocked_at,
    we.source_product_id,
    we.source_transaction_id,
    we.last_verified_at
  from public.workspaces w
  join public.workspace_entitlements we on we.workspace_id = w.id
  where w.created_by is not null and we.status = 'lifetime'
  order by w.created_by, we.lifetime_unlocked_at asc nulls last
)
update public.workspace_entitlements target_entitlement
set status = 'lifetime',
    billing_owner_id = lifetime_owner.created_by,
    lifetime_unlocked_at = lifetime_owner.lifetime_unlocked_at,
    source_product_id = lifetime_owner.source_product_id,
    source_transaction_id = lifetime_owner.source_transaction_id,
    last_verified_at = lifetime_owner.last_verified_at,
    updated_at = now()
from public.workspaces target_workspace
join lifetime_owner on lifetime_owner.created_by = target_workspace.created_by
where target_entitlement.workspace_id = target_workspace.id
  and target_entitlement.status <> 'lifetime';

-- A verified lifetime purchase belongs to the purchasing adult's Kudos
-- account and unlocks every family/classroom that adult created. Invited
-- adults inherit access through their membership but do not become owners.
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
  v_existing_purchaser uuid;
  v_role text;
  v_workspace_owner uuid;
  v_idempotent boolean := false;
begin
  if p_product_id <> 'com.beeton.kudosfamily.lifetime' then
    raise exception 'This App Store product is not recognized.';
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
      product_id, environment, purchase_date
    ) values (
      p_transaction_id, nullif(p_original_transaction_id, ''), p_workspace_id,
      p_purchaser_user_id, p_product_id,
      case when p_environment in ('Production', 'Sandbox', 'Xcode') then p_environment else 'Unknown' end,
      p_purchase_date
    );
  else
    v_idempotent := true;
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
    'idempotent', v_idempotent
  );
end;
$$;

revoke all on function public.apply_verified_app_store_transaction(uuid, uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_verified_app_store_transaction(uuid, uuid, text, text, text, text, timestamptz) to service_role;
