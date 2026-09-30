-- BrightSteps 3.7.5
-- Early reward redemption should zero the child's available balance, never create debt.

alter table public.reward_redemptions
  drop constraint if exists reward_redemptions_cost_check;

alter table public.reward_redemptions
  add constraint reward_redemptions_cost_check check (cost >= 0);

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
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_reward public.reward_templates%rowtype;
  v_balance_before integer;
  v_balance_after integer;
  v_charge integer;
begin
  select * into v_reward from public.reward_templates where id=p_reward_id;
  if v_reward.id is null or not public.is_workspace_manager(v_reward.workspace_id) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.reward_assignments where reward_id=p_reward_id and profile_id=p_profile_id) then raise exception 'Reward not assigned'; end if;

  v_balance_before := public.profile_balance(p_profile_id);
  if v_balance_before < v_reward.cost and not p_allow_early then raise exception 'Insufficient balance'; end if;

  -- Normal redemption charges the full cost. Early redemption can consume only
  -- what the child has already earned, so the balance stops at zero.
  v_charge := case when p_allow_early then least(v_balance_before, v_reward.cost) else v_reward.cost end;

  insert into public.reward_redemptions(id,workspace_id,reward_id,profile_id,cost,redeemed_by,redeemed_at)
  values (p_redemption_id,v_reward.workspace_id,p_reward_id,p_profile_id,v_charge,(select auth.uid()),p_redeemed_at)
  on conflict do nothing;

  insert into public.currency_ledger(id,workspace_id,profile_id,amount,transaction_type,source_id,description,created_by,created_at)
  values ('ledger-'||p_redemption_id,v_reward.workspace_id,p_profile_id,-v_charge,'reward_redemption',p_redemption_id,v_reward.title,(select auth.uid()),p_redeemed_at)
  on conflict do nothing;

  v_balance_after := public.profile_balance(p_profile_id);

  if p_deliver_to_child then
    insert into public.reward_deliveries(id,workspace_id,reward_id,profile_id,reward_title,reward_icon_type,reward_icon_value,cost,balance_before,balance_after,sent_at)
    values (p_delivery_id,v_reward.workspace_id,p_reward_id,p_profile_id,v_reward.title,v_reward.icon_type,v_reward.icon_value,v_reward.cost,v_balance_before,v_balance_after,p_redeemed_at)
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'redemption_id',p_redemption_id,
    'delivery_id',case when p_deliver_to_child then p_delivery_id else null end,
    'workspace_id',v_reward.workspace_id,
    'profile_id',p_profile_id,
    'balance_before',v_balance_before,
    'balance_after',v_balance_after,
    'charged',v_charge,
    'early',p_allow_early and v_balance_before < v_reward.cost
  );
end;
$$;

grant execute on function public.redeem_reward(text,text,text,text,boolean,timestamptz,boolean) to authenticated;
