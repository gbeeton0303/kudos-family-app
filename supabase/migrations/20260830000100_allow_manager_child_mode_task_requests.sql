-- Child Mode can be entered either from a dedicated linked child login or by
-- an authorized parent/teacher on the family device. The previous RPC allowed
-- only the dedicated child login, so a manager switching the app to Child Mode
-- received "Not authorized for profile" even though they manage the profile.

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
  v_profile public.child_profiles%rowtype;
  v_period text;
  v_local_date date;
  v_existing_request_id text;
  v_is_linked_child boolean;
  v_is_manager boolean;
begin
  select * into v_task from public.task_templates where id=p_task_id;
  if v_task.id is null then raise exception 'Task not found'; end if;

  select * into v_profile from public.child_profiles where id=p_profile_id;
  if v_profile.id is null then raise exception 'Profile not found'; end if;
  if v_profile.workspace_id <> v_task.workspace_id then
    raise exception 'Task and profile do not belong to the same workspace';
  end if;

  v_is_linked_child := public.is_linked_profile(p_profile_id);
  v_is_manager := public.is_workspace_manager(v_task.workspace_id);
  if not v_is_linked_child and not v_is_manager then
    raise exception 'Not authorized for profile';
  end if;

  if not exists(select 1 from public.task_assignments where task_id=p_task_id and profile_id=p_profile_id) then
    -- A manager is allowed to repair a locally cached assignment because they
    -- already have authority to assign tasks. A child may repair only a task
    -- with established completion/request history, never an unrelated task.
    if v_is_manager
       or exists(select 1 from public.task_completions where task_id=p_task_id and profile_id=p_profile_id)
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
