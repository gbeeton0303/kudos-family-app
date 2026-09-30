-- Kudos 3.8.3
-- Parent/teacher reward redemption must never fail because the device balance
-- and the authoritative cloud ledger temporarily disagree.
--
-- Managers are intentionally allowed to redeem rewards early. Therefore the
-- server always charges at most the profile's currently available balance,
-- never creates debt, and never raises "Insufficient balance".

drop function if exists public.redeem_reward(text,text,text,text,boolean,timestamptz,boolean);

create or replace function public.redeem_reward(
  p_redemption_id text,
  p_delivery_id text,
  p_reward_id text,
  p_profile_id text,
  p_deliver_to_child boolean default true,
  p_redeemed_at timestamptz default now(),
  p_allow_early boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward public.reward_templates%rowtype;
  v_balance_before integer;
  v_balance_after integer;
  v_charge integer;
  v_existing public.reward_redemptions%rowtype;
begin
  select * into v_reward
  from public.reward_templates
  where id = p_reward_id;

  if v_reward.id is null then
    raise exception 'Reward not found';
  end if;

  if not public.is_workspace_manager(v_reward.workspace_id) then
    raise exception 'Not authorized';
  end if;

  if not exists(
    select 1
    from public.reward_assignments
    where reward_id = p_reward_id
      and profile_id = p_profile_id
  ) then
    raise exception 'Reward not assigned';
  end if;

  -- Idempotency: if this redemption ID already committed, return its current
  -- authoritative result instead of charging twice.
  select * into v_existing
  from public.reward_redemptions
  where id = p_redemption_id;

  if v_existing.id is not null then
    v_balance_after := public.profile_balance(p_profile_id);
    return jsonb_build_object(
      'redemption_id', p_redemption_id,
      'delivery_id', case when p_deliver_to_child then p_delivery_id else null end,
      'workspace_id', v_reward.workspace_id,
      'profile_id', p_profile_id,
      'balance_before', v_balance_after + greatest(0, v_existing.cost),
      'balance_after', v_balance_after,
      'charged', greatest(0, v_existing.cost),
      'early', greatest(0, v_existing.cost) < v_reward.cost,
      'already_redeemed', true
    );
  end if;

  v_balance_before := greatest(0, public.profile_balance(p_profile_id));

  -- Critical rule: a manager redemption consumes only currency that exists.
  -- If the reward costs more than the cloud balance, this is simply treated as
  -- an early redemption and the child's balance becomes zero.
  v_charge := least(v_balance_before, v_reward.cost);

  insert into public.reward_redemptions(
    id, workspace_id, reward_id, profile_id, cost, redeemed_by, redeemed_at
  )
  values (
    p_redemption_id,
    v_reward.workspace_id,
    p_reward_id,
    p_profile_id,
    v_charge,
    (select auth.uid()),
    p_redeemed_at
  );

  -- A zero-charge early redemption needs no ledger row because there is
  -- nothing to subtract. This also avoids meaningless zero transactions.
  if v_charge > 0 then
    insert into public.currency_ledger(
      id, workspace_id, profile_id, amount, transaction_type, source_id,
      description, created_by, created_at
    )
    values (
      'ledger-' || p_redemption_id,
      v_reward.workspace_id,
      p_profile_id,
      -v_charge,
      'reward_redemption',
      p_redemption_id,
      v_reward.title,
      (select auth.uid()),
      p_redeemed_at
    )
    on conflict do nothing;
  end if;

  v_balance_after := greatest(0, public.profile_balance(p_profile_id));

  if p_deliver_to_child then
    insert into public.reward_deliveries(
      id, workspace_id, reward_id, profile_id, reward_title,
      reward_icon_type, reward_icon_value, cost,
      balance_before, balance_after, sent_at
    )
    values (
      p_delivery_id,
      v_reward.workspace_id,
      p_reward_id,
      p_profile_id,
      v_reward.title,
      v_reward.icon_type,
      v_reward.icon_value,
      v_reward.cost,
      v_balance_before,
      v_balance_after,
      p_redeemed_at
    )
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'redemption_id', p_redemption_id,
    'delivery_id', case when p_deliver_to_child then p_delivery_id else null end,
    'workspace_id', v_reward.workspace_id,
    'profile_id', p_profile_id,
    'balance_before', v_balance_before,
    'balance_after', v_balance_after,
    'charged', v_charge,
    'early', v_charge < v_reward.cost,
    'requested_early', p_allow_early
  );
end;
$$;

grant execute on function public.redeem_reward(
  text,text,text,text,boolean,timestamptz,boolean
) to authenticated;

-- Keep the six-argument compatibility wrapper pointing to the new clamped
-- implementation for older deployed clients/functions.
create or replace function public.redeem_reward(
  p_redemption_id text,
  p_delivery_id text,
  p_reward_id text,
  p_profile_id text,
  p_deliver_to_child boolean,
  p_redeemed_at timestamptz
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.redeem_reward(
    p_redemption_id,
    p_delivery_id,
    p_reward_id,
    p_profile_id,
    p_deliver_to_child,
    p_redeemed_at,
    false
  );
$$;

grant execute on function public.redeem_reward(
  text,text,text,text,boolean,timestamptz
) to authenticated;
