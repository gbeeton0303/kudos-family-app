-- Backend-only fixes; keep released iOS RPC signatures and response fields.
-- No historical amounts or purchase records are rewritten.

-- An already-delivered reward is a snapshot, not a live library entry.
-- Keep redemption deletion behavior for old clients' orphan-ledger recovery.
alter table public.reward_deliveries alter column reward_id drop not null;
alter table public.reward_deliveries drop constraint if exists reward_deliveries_reward_id_fkey;
alter table public.reward_deliveries add constraint reward_deliveries_reward_id_fkey
  foreign key (reward_id) references public.reward_templates(id) on delete set null;

-- Use one per-profile lock for redemptions and ledger/reset changes. NO KEY
-- UPDATE permits foreign-key checks while serializing balance writers.
create or replace function public.lock_profile_balance_write()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_old text; v_new text;
begin
  if tg_op <> 'INSERT' then v_old := old.profile_id; end if;
  if tg_op <> 'DELETE' then v_new := new.profile_id; end if;
  perform id from public.child_profiles where id in (v_old, v_new)
    order by id for no key update;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.lock_profile_balance_write() from public, anon, authenticated;
drop trigger if exists currency_ledger_balance_lock on public.currency_ledger;
create trigger currency_ledger_balance_lock before insert or update or delete
  on public.currency_ledger for each row execute function public.lock_profile_balance_write();
drop trigger if exists profile_balance_resets_balance_lock on public.profile_balance_resets;
create trigger profile_balance_resets_balance_lock before insert or update or delete
  on public.profile_balance_resets for each row execute function public.lock_profile_balance_write();

-- Match the released app's chronological, non-negative balance and reset rules.
-- Undoing old earnings must not create debt against unrelated future earnings.
create or replace function public.profile_balance(p_profile_id text)
returns integer language plpgsql stable security definer set search_path = public as $$
declare v_profile public.child_profiles%rowtype; v_balance bigint; v_event record;
begin
  select * into v_profile from public.child_profiles where id = p_profile_id;
  if v_profile.id is null or (not public.is_workspace_manager(v_profile.workspace_id)
      and not public.is_linked_profile(p_profile_id)) then raise exception 'Not authorized'; end if;
  v_balance := greatest(0, v_profile.starting_balance);
  for v_event in
    select amount, event_rank from (
      select id, created_at as occurred_at, amount,
        case when amount >= 0 then 0 else 2 end as event_rank
      from public.currency_ledger where profile_id = p_profile_id
        and workspace_id = v_profile.workspace_id
      union all
      select id, reset_at, 0, 1 from public.profile_balance_resets
      where profile_id = p_profile_id and workspace_id = v_profile.workspace_id
    ) events order by occurred_at, event_rank, id
  loop
    if v_event.event_rank = 1 then v_balance := 0;
    else v_balance := greatest(0, v_balance + v_event.amount); end if;
  end loop;
  return v_balance::integer;
end;
$$;
revoke all on function public.profile_balance(text) from public, anon;
grant execute on function public.profile_balance(text) to authenticated;

-- Do not overlap default arguments with the legacy six-argument overload.
drop function public.redeem_reward(text,text,text,text,boolean,timestamptz,boolean);
create function public.redeem_reward(
  p_redemption_id text, p_delivery_id text, p_reward_id text, p_profile_id text,
  p_deliver_to_child boolean, p_redeemed_at timestamptz,
  p_allow_early boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_reward public.reward_templates%rowtype; v_profile public.child_profiles%rowtype;
  v_existing public.reward_redemptions%rowtype; v_balance_before integer;
  v_balance_after integer; v_charge integer;
begin
  if coalesce(trim(p_redemption_id), '') = '' or p_redeemed_at is null
    or (p_deliver_to_child and coalesce(trim(p_delivery_id), '') = '') then
    raise exception 'The reward request is incomplete';
  end if;
  select * into v_reward from public.reward_templates where id = p_reward_id for share;
  if v_reward.id is null then raise exception 'Reward not found'; end if;
  if not public.is_workspace_manager(v_reward.workspace_id) then raise exception 'Not authorized'; end if;
  -- Acquire before reading the balance or deciding whether this is a retry.
  select * into v_profile from public.child_profiles where id = p_profile_id for no key update;
  if v_profile.id is null or v_profile.workspace_id <> v_reward.workspace_id then
    raise exception 'Reward and profile do not belong to the same workspace';
  end if;
  select * into v_existing from public.reward_redemptions where id = p_redemption_id;
  if v_existing.id is not null then
    if v_existing.workspace_id <> v_reward.workspace_id or v_existing.profile_id <> p_profile_id
      or v_existing.reward_id <> p_reward_id then raise exception 'Redemption identifier already used'; end if;
    return jsonb_build_object('redemption_id', p_redemption_id,
      'delivery_id', case when p_deliver_to_child then p_delivery_id else null end,
      'profile_id', p_profile_id, 'balance_after', public.profile_balance(p_profile_id), 'already_redeemed', true);
  end if;
  perform 1 from public.reward_assignments where reward_id = p_reward_id
    and profile_id = p_profile_id and workspace_id = v_reward.workspace_id for share;
  if not found then raise exception 'Reward not assigned'; end if;
  if exists(select 1 from public.currency_ledger where id = 'ledger-' || p_redemption_id)
    or exists(select 1 from public.profile_balance_resets where id = 'reset-' || p_redemption_id)
    or (p_deliver_to_child and exists(select 1 from public.reward_deliveries where id = p_delivery_id)) then
    raise exception 'Reward request identifier already used';
  end if;
  v_balance_before := public.profile_balance(p_profile_id);
  if p_allow_early then v_charge := v_balance_before;
  else
    if v_balance_before < v_reward.cost then raise exception 'Insufficient balance'; end if;
    v_charge := v_reward.cost;
  end if;
  insert into public.reward_redemptions(id,workspace_id,reward_id,profile_id,cost,redeemed_by,redeemed_at)
    values(p_redemption_id,v_reward.workspace_id,p_reward_id,p_profile_id,v_charge,(select auth.uid()),p_redeemed_at);
  if v_charge > 0 then
    insert into public.currency_ledger(id,workspace_id,profile_id,amount,transaction_type,source_id,description,created_by,created_at)
      values('ledger-'||p_redemption_id,v_reward.workspace_id,p_profile_id,-v_charge,
        'reward_redemption',p_redemption_id,v_reward.title,(select auth.uid()),p_redeemed_at);
  end if;
  if p_allow_early then
    insert into public.profile_balance_resets(id,workspace_id,profile_id,source_id,reset_at,created_by)
      values('reset-'||p_redemption_id,v_reward.workspace_id,p_profile_id,p_redemption_id,p_redeemed_at,(select auth.uid()));
  end if;
  v_balance_after := public.profile_balance(p_profile_id);
  if p_deliver_to_child then
    insert into public.reward_deliveries(id,workspace_id,reward_id,profile_id,reward_title,reward_icon_type,
      reward_icon_value,cost,balance_before,balance_after,sent_at)
      values(p_delivery_id,v_reward.workspace_id,p_reward_id,p_profile_id,v_reward.title,v_reward.icon_type,
        v_reward.icon_value,v_reward.cost,v_balance_before,v_balance_after,p_redeemed_at);
  end if;
  return jsonb_build_object('redemption_id',p_redemption_id,
    'delivery_id',case when p_deliver_to_child then p_delivery_id else null end,
    'profile_id',p_profile_id,'balance_before',v_balance_before,'balance_after',v_balance_after,
    'charged',v_charge,'early',p_allow_early);
end;
$$;
revoke all on function public.redeem_reward(text,text,text,text,boolean,timestamptz,boolean) from public, anon;
grant execute on function public.redeem_reward(text,text,text,text,boolean,timestamptz,boolean) to authenticated;
-- The existing six-argument wrapper still delegates to this implementation.
revoke all on function public.redeem_reward(text,text,text,text,boolean,timestamptz) from public, anon;

-- Released clients send all six fields; legacy clients use the four-field wrapper.
drop function public.submit_task_request(text,text,text,timestamptz,text,date);
create function public.submit_task_request(
  p_request_id text, p_task_id text, p_profile_id text,
  p_requested_at timestamptz, p_period_key text, p_local_date date
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_task public.task_templates%rowtype; v_profile public.child_profiles%rowtype;
  v_period text; v_local_date date; v_existing_request_id text; v_is_manager boolean;
begin
  select * into v_task from public.task_templates where id = p_task_id for share;
  if v_task.id is null then raise exception 'Task not found'; end if;
  if v_task.archived_at is not null then raise exception 'Task is no longer assigned'; end if;
  select * into v_profile from public.child_profiles where id = p_profile_id;
  if v_profile.id is null then raise exception 'Profile not found'; end if;
  if v_profile.workspace_id <> v_task.workspace_id then
    raise exception 'Task and profile do not belong to the same workspace';
  end if;
  v_is_manager := public.is_workspace_manager(v_task.workspace_id);
  if not public.is_linked_profile(p_profile_id) and not v_is_manager then raise exception 'Not authorized for profile'; end if;
  perform 1 from public.task_assignments where task_id = p_task_id and profile_id = p_profile_id
    and workspace_id = v_task.workspace_id for share;
  if not found then
    -- History does not authorize a child to recreate a revoked assignment.
    if not v_is_manager then raise exception 'Task not assigned'; end if;
    insert into public.task_assignments(workspace_id,task_id,profile_id)
      values(v_task.workspace_id,p_task_id,p_profile_id) on conflict do nothing;
  end if;
  v_local_date := coalesce(p_local_date,(p_requested_at at time zone 'UTC')::date);
  if not public.task_is_scheduled_local(v_task,v_local_date) then raise exception 'Task is not scheduled for this date'; end if;
  v_period := coalesce(nullif(p_period_key,''),public.task_period_key(v_task.frequency,p_requested_at));
  if v_task.frequency <> 'unlimited' and exists(select 1 from public.task_completions
    where task_id = p_task_id and profile_id = p_profile_id and period_key = v_period) then
    return jsonb_build_object('request_id',p_request_id,'status','approved','workspace_id',v_task.workspace_id,
      'already_completed',true,'period_key',v_period);
  end if;
  select id into v_existing_request_id from public.task_completion_requests
    where task_id = p_task_id and profile_id = p_profile_id and status = 'pending' and period_key = v_period;
  if v_existing_request_id is not null then
    return jsonb_build_object('request_id',v_existing_request_id,'status','pending','workspace_id',v_task.workspace_id,
      'already_pending',true,'period_key',v_period);
  end if;
  insert into public.task_completion_requests(id,workspace_id,task_id,profile_id,requested_by,requested_at,period_key)
    values(p_request_id,v_task.workspace_id,p_task_id,p_profile_id,(select auth.uid()),p_requested_at,v_period)
    on conflict (task_id,profile_id,period_key) where status = 'pending' do nothing;
  select id into v_existing_request_id from public.task_completion_requests
    where task_id = p_task_id and profile_id = p_profile_id and status = 'pending' and period_key = v_period;
  return jsonb_build_object('request_id',v_existing_request_id,'status','pending','workspace_id',v_task.workspace_id,'period_key',v_period);
end;
$$;
revoke all on function public.submit_task_request(text,text,text,timestamptz,text,date) from public, anon;
grant execute on function public.submit_task_request(text,text,text,timestamptz,text,date) to authenticated;

-- Older installs can call the original four-argument API directly.
create or replace function public.submit_task_request(
  p_request_id text,p_task_id text,p_profile_id text,p_requested_at timestamptz default now()
) returns jsonb language sql security definer set search_path = public as $$
  select public.submit_task_request(p_request_id,p_task_id,p_profile_id,p_requested_at,null::text,null::date);
$$;
revoke all on function public.submit_task_request(text,text,text,timestamptz) from public, anon;
grant execute on function public.submit_task_request(text,text,text,timestamptz) to authenticated;

-- Protect the purchasing authority even against direct Data API deletes.
-- Genuine Auth-user/workspace deletion cascades remain allowed.
create or replace function public.protect_workspace_purchasing_member()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.workspace_id = old.workspace_id and new.user_id = old.user_id
    and new.role in ('parent','teacher') then return new; end if;
  if exists(select 1 from auth.users where id = old.user_id)
    and exists(select 1 from public.workspaces where id = old.workspace_id) and (
    exists(select 1 from public.workspaces where id = old.workspace_id and created_by = old.user_id)
    or exists(select 1 from public.workspace_entitlements where workspace_id = old.workspace_id and billing_owner_id = old.user_id)
  ) then raise exception 'The workspace creator and purchasing owner cannot be removed'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.protect_workspace_purchasing_member() from public, anon, authenticated;
drop trigger if exists workspace_members_protect_purchaser on public.workspace_members;
create trigger workspace_members_protect_purchaser before delete or update
  on public.workspace_members for each row execute function public.protect_workspace_purchasing_member();

-- Otherwise a manager could rewrite creator attribution before removing them.
create or replace function public.protect_workspace_creator_attribution()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.created_by is distinct from old.created_by
    and exists(select 1 from auth.users where id = old.created_by) then
    raise exception 'Workspace creator ownership cannot be changed through account settings';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_workspace_creator_attribution() from public, anon, authenticated;
drop trigger if exists workspaces_protect_creator on public.workspaces;
create trigger workspaces_protect_creator before update of created_by on public.workspaces
  for each row execute function public.protect_workspace_creator_attribution();

-- Empty StoreKit results can end shared access, but never a direct purchase.
create or replace function public.revoke_missing_apple_entitlement(p_workspace_id uuid,p_requester_user_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_updated integer;
begin
  if not exists(select 1 from public.workspaces w join public.workspace_members m on m.workspace_id = w.id
    where w.id = p_workspace_id and w.created_by = p_requester_user_id and m.user_id = p_requester_user_id
      and m.role in ('parent','teacher')) then raise exception 'Only the workspace creator can reconcile Apple purchase access'; end if;
  update public.workspace_entitlements e set status = 'trial',
    trial_started_at = coalesce(e.trial_started_at,now()-interval '7 days'),
    trial_expires_at = least(coalesce(e.trial_expires_at,now()),now()),
    lifetime_unlocked_at = null, source_product_id = null, source_transaction_id = null,
    source_ownership_type = null, last_verified_at = now(), updated_at = now()
  from public.workspaces w where e.workspace_id = w.id and w.created_by = p_requester_user_id
    and e.status = 'lifetime' and e.source_ownership_type = 'FAMILY_SHARED';
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;
revoke all on function public.revoke_missing_apple_entitlement(uuid,uuid) from public, anon, authenticated;
grant execute on function public.revoke_missing_apple_entitlement(uuid,uuid) to service_role;

-- Invoke ONLY after Apple verifies a revocation for this exact transaction.
create or replace function public.revoke_verified_app_store_entitlement(
  p_workspace_id uuid,p_requester_user_id uuid,p_transaction_id text
) returns integer language plpgsql security definer set search_path = public as $$
declare v_updated integer;
begin
  if not exists(select 1 from public.workspaces w join public.workspace_members m on m.workspace_id = w.id
    where w.id = p_workspace_id and w.created_by = p_requester_user_id and m.user_id = p_requester_user_id
      and m.role in ('parent','teacher')) then raise exception 'Only the workspace creator can reconcile Apple purchase access'; end if;
  if coalesce(trim(p_transaction_id),'') = '' then raise exception 'A verified transaction is required'; end if;
  update public.workspace_entitlements e set status = 'trial',
    trial_started_at = coalesce(e.trial_started_at,now()-interval '7 days'),
    trial_expires_at = least(coalesce(e.trial_expires_at,now()),now()),
    lifetime_unlocked_at = null, source_product_id = null, source_transaction_id = null,
    source_ownership_type = null, last_verified_at = now(), updated_at = now()
  from public.workspaces w where e.workspace_id = w.id and w.created_by = p_requester_user_id
    and e.status = 'lifetime' and e.source_transaction_id = p_transaction_id;
  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;
revoke all on function public.revoke_verified_app_store_entitlement(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.revoke_verified_app_store_entitlement(uuid,uuid,text) to service_role;
