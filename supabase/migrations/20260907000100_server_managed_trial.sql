-- Start the seven-day evaluation period from a trusted server timestamp.
-- The trial is a workspace entitlement, not an App Store product. StoreKit is
-- reserved for the non-consumable lifetime unlock.

create or replace function public.start_workspace_trial(
  p_workspace_id uuid,
  p_requester_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entitlement public.workspace_entitlements%rowtype;
  v_role text;
  v_started_at timestamptz := now();
begin
  select role into v_role
  from public.workspace_members
  where workspace_id = p_workspace_id and user_id = p_requester_user_id;

  if v_role is null or v_role not in ('parent', 'teacher') then
    raise exception 'Only an adult workspace manager can start the free trial.';
  end if;

  insert into public.workspace_entitlements(workspace_id, billing_owner_id)
  select p_workspace_id, w.created_by
  from public.workspaces w
  where w.id = p_workspace_id
  on conflict (workspace_id) do nothing;

  select * into v_entitlement
  from public.workspace_entitlements
  where workspace_id = p_workspace_id
  for update;

  if v_entitlement.workspace_id is null then
    raise exception 'The family or classroom could not be found.';
  end if;

  if v_entitlement.billing_owner_id is not null
     and v_entitlement.billing_owner_id <> p_requester_user_id then
    raise exception 'Only the family or classroom creator can start the free trial.';
  end if;

  if v_entitlement.status = 'lifetime' then
    return jsonb_build_object(
      'workspace_id', p_workspace_id,
      'status', 'lifetime',
      'idempotent', true
    );
  end if;

  if v_entitlement.status = 'trial' then
    return jsonb_build_object(
      'workspace_id', p_workspace_id,
      'status', 'trial',
      'idempotent', true
    );
  end if;

  update public.workspace_entitlements
  set status = 'trial',
      billing_owner_id = coalesce(billing_owner_id, p_requester_user_id),
      trial_started_at = v_started_at,
      trial_expires_at = v_started_at + interval '7 days',
      updated_at = v_started_at
  where workspace_id = p_workspace_id;

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'status', 'trial',
    'trial_started_at', v_started_at,
    'trial_expires_at', v_started_at + interval '7 days',
    'idempotent', false
  );
end;
$$;

revoke all on function public.start_workspace_trial(uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_workspace_trial(uuid, uuid) to service_role;

-- StoreKit verification now accepts only the lifetime non-consumable. This
-- replaces the earlier implementation without rewriting an applied migration.
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
  if p_product_id <> 'com.beeton.kudosfamily.lifetime' then
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
    return jsonb_build_object(
      'workspace_id', p_workspace_id,
      'status', v_entitlement.status,
      'idempotent', true
    );
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

  update public.workspace_entitlements
  set status = 'lifetime',
      billing_owner_id = coalesce(billing_owner_id, p_purchaser_user_id),
      lifetime_unlocked_at = p_purchase_date,
      source_product_id = p_product_id,
      source_transaction_id = p_transaction_id,
      last_verified_at = now(),
      updated_at = now()
  where workspace_id = p_workspace_id;

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'status', 'lifetime',
    'idempotent', false
  );
end;
$$;

revoke all on function public.apply_verified_app_store_transaction(uuid, uuid, text, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.apply_verified_app_store_transaction(uuid, uuid, text, text, text, text, timestamptz) to service_role;
