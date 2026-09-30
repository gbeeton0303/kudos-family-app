-- BrightSteps 3.6.9: reversible task completions and parent-authorized early reward redemption.

create or replace function public.undo_task_completion(
  p_task_id text,
  p_profile_id text,
  p_completed_at timestamptz default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_task public.task_templates%rowtype;
  v_completion public.task_completions%rowtype;
  v_balance integer;
begin
  select * into v_task from public.task_templates where id = p_task_id;
  if v_task.id is null or not public.is_workspace_manager(v_task.workspace_id) then
    raise exception 'Not authorized';
  end if;

  if p_completed_at is null then
    select * into v_completion
    from public.task_completions
    where task_id = p_task_id and profile_id = p_profile_id
    order by completed_at desc
    limit 1
    for update;
  else
    select * into v_completion
    from public.task_completions
    where task_id = p_task_id and profile_id = p_profile_id and completed_at = p_completed_at
    order by completed_at desc
    limit 1
    for update;
  end if;

  if v_completion.id is null then
    return jsonb_build_object('undone', false, 'profile_id', p_profile_id, 'balance', public.profile_balance(p_profile_id));
  end if;

  delete from public.currency_ledger
  where transaction_type = 'task_completion' and source_id = v_completion.id;

  delete from public.task_completions where id = v_completion.id;

  update public.task_completion_requests
  set status = 'pending', reviewed_by = null, reviewed_at = null
  where task_id = p_task_id
    and profile_id = p_profile_id
    and status = 'approved'
    and requested_at = v_completion.completed_at;

  v_balance := public.profile_balance(p_profile_id);
  return jsonb_build_object(
    'undone', true,
    'task_id', p_task_id,
    'profile_id', p_profile_id,
    'completed_at', v_completion.completed_at,
    'balance', v_balance
  );
end;
$$;

grant execute on function public.undo_task_completion(text,text,timestamptz) to authenticated;

-- Replace the prior 6-argument RPC with a parent/teacher-authorized early-redemption flag.
drop function if exists public.redeem_reward(text,text,text,text,boolean,timestamptz);

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
begin
  select * into v_reward from public.reward_templates where id=p_reward_id;
  if v_reward.id is null or not public.is_workspace_manager(v_reward.workspace_id) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.reward_assignments where reward_id=p_reward_id and profile_id=p_profile_id) then raise exception 'Reward not assigned'; end if;

  v_balance_before := public.profile_balance(p_profile_id);
  if v_balance_before < v_reward.cost and not p_allow_early then raise exception 'Insufficient balance'; end if;

  insert into public.reward_redemptions(id,workspace_id,reward_id,profile_id,cost,redeemed_by,redeemed_at)
  values (p_redemption_id,v_reward.workspace_id,p_reward_id,p_profile_id,v_reward.cost,(select auth.uid()),p_redeemed_at)
  on conflict do nothing;

  insert into public.currency_ledger(id,workspace_id,profile_id,amount,transaction_type,source_id,description,created_by,created_at)
  values ('ledger-'||p_redemption_id,v_reward.workspace_id,p_profile_id,-v_reward.cost,'reward_redemption',p_redemption_id,v_reward.title,(select auth.uid()),p_redeemed_at)
  on conflict do nothing;

  v_balance_after := public.profile_balance(p_profile_id);

  if p_deliver_to_child then
    insert into public.reward_deliveries(id,workspace_id,reward_id,profile_id,reward_title,reward_icon_type,reward_icon_value,cost,balance_before,balance_after,sent_at)
    values (p_delivery_id,v_reward.workspace_id,p_reward_id,p_profile_id,v_reward.title,v_reward.icon_type,v_reward.icon_value,v_reward.cost,v_balance_before,greatest(0,v_balance_after),p_redeemed_at)
    on conflict do nothing;
  end if;

  return jsonb_build_object(
    'redemption_id',p_redemption_id,
    'delivery_id',case when p_deliver_to_child then p_delivery_id else null end,
    'workspace_id',v_reward.workspace_id,
    'profile_id',p_profile_id,
    'balance_before',v_balance_before,
    'balance_after',v_balance_after,
    'early',p_allow_early and v_balance_before < v_reward.cost
  );
end;
$$;

grant execute on function public.redeem_reward(text,text,text,text,boolean,timestamptz,boolean) to authenticated;
