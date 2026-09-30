-- Let a workspace manager deliberately award a completed daily task again.
-- Ordinary task completion keeps its one-row-per-period lock. Repeat awards
-- use a dedicated RPC, a unique event-based period key, and the normal ledger
-- repair helper so retries are idempotent and child accounts cannot bypass the
-- once-daily rule.

create or replace function public.complete_daily_task_again(
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
  v_repeat_period text;
  v_local_date date;
  v_completion_id text;
  v_inserted boolean := false;
  v_credited boolean := false;
  v_balance integer;
begin
  select * into v_task from public.task_templates where id = p_task_id;
  if v_task.id is null then raise exception 'Task not found'; end if;
  if not public.is_workspace_manager(v_task.workspace_id) then raise exception 'Not authorized'; end if;
  if v_task.frequency <> 'daily' then raise exception 'Only completed daily tasks can be awarded again'; end if;

  if not exists (
    select 1 from public.child_profiles
    where id = p_profile_id and workspace_id = v_task.workspace_id
  ) then
    raise exception 'Profile does not belong to this workspace';
  end if;

  insert into public.task_assignments(workspace_id, task_id, profile_id)
  values(v_task.workspace_id, p_task_id, p_profile_id)
  on conflict do nothing;

  v_local_date := coalesce(p_local_date, (p_occurred_at at time zone 'UTC')::date);
  if not public.task_is_scheduled_local(v_task, v_local_date) then
    raise exception 'Task is not scheduled for this date';
  end if;
  v_period := coalesce(nullif(p_period_key, ''), public.task_period_key(v_task.frequency, p_occurred_at));

  if not exists (
    select 1 from public.task_completions
    where task_id = p_task_id and profile_id = p_profile_id
      and (period_key = v_period or period_key like v_period || ':repeat:%')
  ) then
    raise exception 'Task has not been completed for this period';
  end if;

  v_repeat_period := v_period || ':repeat:' || p_event_id;
  insert into public.task_completions(
    id, workspace_id, task_id, profile_id, completed_at, period_key, source, approved_by
  )
  values(
    p_event_id, v_task.workspace_id, p_task_id, p_profile_id, p_occurred_at,
    v_repeat_period, 'direct', (select auth.uid())
  )
  on conflict (task_id, profile_id, period_key) do nothing
  returning id into v_completion_id;
  v_inserted := v_completion_id is not null;

  if v_completion_id is null then
    select id into v_completion_id
    from public.task_completions
    where task_id = p_task_id and profile_id = p_profile_id and period_key = v_repeat_period
    limit 1;
  end if;
  if v_completion_id is null then raise exception 'Repeat completion could not be recorded'; end if;

  v_credited := public.ensure_task_completion_credit(v_completion_id);
  v_balance := public.profile_balance(p_profile_id);
  return jsonb_build_object(
    'applied', v_inserted or v_credited,
    'already_completed', not v_inserted and not v_credited,
    'period_key', v_period,
    'repeat_period_key', v_repeat_period,
    'amount', v_task.amount,
    'balance', v_balance
  );
end;
$$;

revoke all on function public.complete_daily_task_again(text,text,text,timestamptz,text,date) from public, anon;
grant execute on function public.complete_daily_task_again(text,text,text,timestamptz,text,date) to authenticated;
