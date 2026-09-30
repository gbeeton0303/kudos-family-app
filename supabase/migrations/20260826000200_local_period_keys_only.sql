-- The client sends an explicit period key based on the family's local date.
-- Do not also compare timestamptz::date (UTC), which incorrectly treats a
-- late-evening completion as belonging to the following local day.

create or replace function public.complete_task_direct(
  p_event_id text,
  p_task_id text,
  p_profile_id text,
  p_occurred_at timestamptz default now(),
  p_period_key text default null,
  p_local_date date default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_task public.task_templates%rowtype;
  v_period text;
  v_local_date date;
  v_completion_id text;
  v_inserted boolean := false;
  v_credited boolean := false;
  v_balance integer;
begin
  select * into v_task from public.task_templates where id=p_task_id;
  if v_task.id is null or not public.is_workspace_manager(v_task.workspace_id) then raise exception 'Not authorized'; end if;

  if not exists(select 1 from public.task_assignments where task_id=p_task_id and profile_id=p_profile_id) then
    if not exists(select 1 from public.child_profiles where id=p_profile_id and workspace_id=v_task.workspace_id) then
      raise exception 'Profile does not belong to this workspace';
    end if;
    insert into public.task_assignments(workspace_id,task_id,profile_id)
    values(v_task.workspace_id,p_task_id,p_profile_id) on conflict do nothing;
  end if;

  v_local_date := coalesce(p_local_date,(p_occurred_at at time zone 'UTC')::date);
  if not public.task_is_scheduled_local(v_task,v_local_date) then raise exception 'Task is not scheduled for this date'; end if;
  v_period := coalesce(nullif(p_period_key,''),public.task_period_key(v_task.frequency,p_occurred_at));

  if v_task.frequency <> 'unlimited' then
    select id into v_completion_id
    from public.task_completions
    where task_id=p_task_id and profile_id=p_profile_id and period_key=v_period
    limit 1;
  end if;

  if v_completion_id is null then
    insert into public.task_completions(id,workspace_id,task_id,profile_id,completed_at,period_key,source,approved_by)
    values(p_event_id,v_task.workspace_id,p_task_id,p_profile_id,p_occurred_at,v_period,'direct',(select auth.uid()))
    on conflict (task_id,profile_id,period_key) do nothing
    returning id into v_completion_id;
    v_inserted := v_completion_id is not null;
    if v_completion_id is null then
      select id into v_completion_id from public.task_completions
      where task_id=p_task_id and profile_id=p_profile_id and period_key=v_period limit 1;
    end if;
  end if;

  if v_completion_id is not null then
    v_credited := public.ensure_task_completion_credit(v_completion_id);
    update public.task_completion_requests
      set status='approved',reviewed_by=(select auth.uid()),reviewed_at=now()
      where task_id=p_task_id and profile_id=p_profile_id and status='pending' and period_key=v_period;
  end if;

  v_balance := public.profile_balance(p_profile_id);
  return jsonb_build_object(
    'applied',v_inserted or v_credited,
    'already_completed',not v_inserted and not v_credited,
    'period_key',v_period,'amount',v_task.amount,'balance',v_balance
  );
end;
$$;

grant execute on function public.complete_task_direct(text,text,text,timestamptz,text,date) to authenticated;

create or replace function public.submit_task_request(
  p_request_id text,
  p_task_id text,
  p_profile_id text,
  p_requested_at timestamptz default now(),
  p_period_key text default null,
  p_local_date date default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_task public.task_templates%rowtype;
  v_period text;
  v_local_date date;
  v_existing_request_id text;
begin
  select * into v_task from public.task_templates where id=p_task_id;
  if v_task.id is null then raise exception 'Task not found'; end if;
  if not public.is_linked_profile(p_profile_id) then raise exception 'Not authorized for profile'; end if;

  if not exists(select 1 from public.task_assignments where task_id=p_task_id and profile_id=p_profile_id) then
    -- Repair only a historically established recurring assignment. A linked
    -- child cannot use this to assign an unrelated task to themselves.
    if exists(select 1 from public.task_completions where task_id=p_task_id and profile_id=p_profile_id)
       or exists(select 1 from public.task_completion_requests where task_id=p_task_id and profile_id=p_profile_id) then
      insert into public.task_assignments(workspace_id,task_id,profile_id)
      values(v_task.workspace_id,p_task_id,p_profile_id) on conflict do nothing;
    else
      raise exception 'Task not assigned';
    end if;
  end if;

  v_local_date := coalesce(p_local_date,(p_requested_at at time zone 'UTC')::date);
  if not public.task_is_scheduled_local(v_task,v_local_date) then raise exception 'Task is not scheduled for this date'; end if;
  v_period := coalesce(nullif(p_period_key,''),public.task_period_key(v_task.frequency,p_requested_at));

  if v_task.frequency <> 'unlimited' and exists(
    select 1 from public.task_completions
    where task_id=p_task_id and profile_id=p_profile_id and period_key=v_period
  ) then
    return jsonb_build_object('request_id',p_request_id,'status','approved','workspace_id',v_task.workspace_id,'already_completed',true,'period_key',v_period);
  end if;

  select id into v_existing_request_id
  from public.task_completion_requests
  where task_id=p_task_id and profile_id=p_profile_id and status='pending' and period_key=v_period
  order by requested_at desc limit 1;
  if v_existing_request_id is not null then
    return jsonb_build_object('request_id',v_existing_request_id,'status','pending','workspace_id',v_task.workspace_id,'already_pending',true,'period_key',v_period);
  end if;

  insert into public.task_completion_requests(id,workspace_id,task_id,profile_id,requested_by,requested_at,period_key)
  values(p_request_id,v_task.workspace_id,p_task_id,p_profile_id,(select auth.uid()),p_requested_at,v_period);
  return jsonb_build_object('request_id',p_request_id,'status','pending','workspace_id',v_task.workspace_id,'period_key',v_period);
end;
$$;

grant execute on function public.submit_task_request(text,text,text,timestamptz,text,date) to authenticated;
