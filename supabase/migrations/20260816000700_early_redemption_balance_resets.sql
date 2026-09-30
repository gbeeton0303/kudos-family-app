-- Kudos 3.8.4: explicit reset-to-zero history for early reward redemption.

create table if not exists public.profile_balance_resets (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id text not null references public.child_profiles(id) on delete cascade,
  source_id text,
  reset_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists profile_balance_resets_profile_idx on public.profile_balance_resets(profile_id, reset_at);
alter table public.profile_balance_resets enable row level security;
drop policy if exists profile_balance_resets_select on public.profile_balance_resets;
create policy profile_balance_resets_select on public.profile_balance_resets for select to authenticated using (public.is_workspace_manager(workspace_id) or public.is_linked_profile(profile_id));

insert into public.profile_balance_resets(id,workspace_id,profile_id,source_id,reset_at,created_by)
select 'reset-'||d.id,d.workspace_id,d.profile_id,d.id,d.sent_at,null
from public.reward_deliveries d
where d.cost > d.balance_before
on conflict do nothing;

drop function if exists public.redeem_reward(text,text,text,text,boolean,timestamptz,boolean);
create or replace function public.redeem_reward(
  p_redemption_id text,p_delivery_id text,p_reward_id text,p_profile_id text,
  p_deliver_to_child boolean default true,p_redeemed_at timestamptz default now(),
  p_allow_early boolean default false
) returns jsonb language plpgsql security definer set search_path=public as $$
declare
  v_reward public.reward_templates%rowtype; v_balance_before integer; v_balance_after integer;
  v_charge integer; v_is_early boolean; v_existing public.reward_redemptions%rowtype;
begin
  select * into v_reward from public.reward_templates where id=p_reward_id;
  if v_reward.id is null then raise exception 'Reward not found'; end if;
  if not public.is_workspace_manager(v_reward.workspace_id) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.reward_assignments where reward_id=p_reward_id and profile_id=p_profile_id) then raise exception 'Reward not assigned'; end if;
  select * into v_existing from public.reward_redemptions where id=p_redemption_id;
  if v_existing.id is not null then
    v_balance_after:=greatest(0,public.profile_balance(p_profile_id));
    return jsonb_build_object('redemption_id',p_redemption_id,'delivery_id',case when p_deliver_to_child then p_delivery_id else null end,'profile_id',p_profile_id,'balance_after',v_balance_after,'already_redeemed',true);
  end if;
  v_balance_before:=greatest(0,public.profile_balance(p_profile_id));
  v_is_early:=p_allow_early or v_balance_before < v_reward.cost;
  v_charge:=case when v_is_early then v_balance_before else least(v_balance_before,v_reward.cost) end;
  insert into public.reward_redemptions(id,workspace_id,reward_id,profile_id,cost,redeemed_by,redeemed_at) values(p_redemption_id,v_reward.workspace_id,p_reward_id,p_profile_id,v_charge,(select auth.uid()),p_redeemed_at);
  if v_charge>0 then
    insert into public.currency_ledger(id,workspace_id,profile_id,amount,transaction_type,source_id,description,created_by,created_at) values('ledger-'||p_redemption_id,v_reward.workspace_id,p_profile_id,-v_charge,'reward_redemption',p_redemption_id,v_reward.title,(select auth.uid()),p_redeemed_at) on conflict do nothing;
  end if;
  if v_is_early then
    insert into public.profile_balance_resets(id,workspace_id,profile_id,source_id,reset_at,created_by) values('reset-'||p_redemption_id,v_reward.workspace_id,p_profile_id,p_redemption_id,p_redeemed_at,(select auth.uid())) on conflict do nothing;
  end if;
  v_balance_after:=greatest(0,public.profile_balance(p_profile_id));
  if p_deliver_to_child then
    insert into public.reward_deliveries(id,workspace_id,reward_id,profile_id,reward_title,reward_icon_type,reward_icon_value,cost,balance_before,balance_after,sent_at) values(p_delivery_id,v_reward.workspace_id,p_reward_id,p_profile_id,v_reward.title,v_reward.icon_type,v_reward.icon_value,v_reward.cost,v_balance_before,v_balance_after,p_redeemed_at) on conflict do nothing;
  end if;
  return jsonb_build_object('redemption_id',p_redemption_id,'delivery_id',case when p_deliver_to_child then p_delivery_id else null end,'profile_id',p_profile_id,'balance_before',v_balance_before,'balance_after',v_balance_after,'charged',v_charge,'early',v_is_early);
end; $$;
grant execute on function public.redeem_reward(text,text,text,text,boolean,timestamptz,boolean) to authenticated;

create or replace function public.redeem_reward(p_redemption_id text,p_delivery_id text,p_reward_id text,p_profile_id text,p_deliver_to_child boolean,p_redeemed_at timestamptz) returns jsonb language sql security definer set search_path=public as $$ select public.redeem_reward(p_redemption_id,p_delivery_id,p_reward_id,p_profile_id,p_deliver_to_child,p_redeemed_at,false); $$;
grant execute on function public.redeem_reward(text,text,text,text,boolean,timestamptz) to authenticated;
