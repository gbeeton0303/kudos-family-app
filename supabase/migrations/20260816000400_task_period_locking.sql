-- BrightSteps 3.7.7
-- Make task completion periods consistent between the device and cloud:
-- daily once/day, weekly once/week, monthly once/month, custom once/selected date.

alter table public.task_templates
  drop constraint if exists task_templates_frequency_check;

alter table public.task_templates
  add constraint task_templates_frequency_check
  check (frequency in ('unlimited','daily','weekly','monthly','custom'));

create or replace function public.task_period_key(p_frequency text, p_occurred_at timestamptz)
returns text language sql immutable as $$
  select case
    when p_frequency = 'unlimited' then 'event-' || extract(epoch from p_occurred_at)::text
    when p_frequency in ('daily','custom') then 'day-' || to_char(p_occurred_at at time zone 'UTC', 'YYYY-MM-DD')
    when p_frequency = 'monthly' then 'month-' || to_char(p_occurred_at at time zone 'UTC', 'YYYY-MM')
    else 'week-' || to_char(date_trunc('week', p_occurred_at at time zone 'UTC'), 'YYYY-MM-DD')
  end;
$$;

create or replace function public.task_is_scheduled_local(
  p_task public.task_templates,
  p_local_date date
)
returns boolean language sql stable as $$
  select case
    when p_task.frequency in ('unlimited','daily','monthly') then true
    when p_task.frequency = 'weekly' then coalesce(extract(dow from p_local_date)::smallint = any(p_task.schedule_days), false)
    else coalesce(p_local_date = any(p_task.schedule_dates), false)
  end;
$$;

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
  v_inserted boolean := false;
  v_rows integer := 0;
  v_balance integer;
begin
  select * into v_task from public.task_templates where id = p_task_id;
  if v_task.id is null or not public.is_workspace_manager(v_task.workspace_id) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.task_assignments where task_id=p_task_id and profile_id=p_profile_id) then raise exception 'Task not assigned'; end if;

  v_local_date := coalesce(p_local_date, (p_occurred_at at time zone 'UTC')::date);
  if not public.task_is_scheduled_local(v_task, v_local_date) then raise exception 'Task is not scheduled for this date'; end if;
  v_period := coalesce(nullif(p_period_key,''), public.task_period_key(v_task.frequency, p_occurred_at));

  -- Authoritative duplicate check before insert. This lets the server safely
  -- reject repeated taps even if the client was temporarily stale.
  if v_task.frequency <> 'unlimited' and exists(
    select 1 from public.task_completions
    where task_id=p_task_id and profile_id=p_profile_id
      and (
        period_key=v_period
        or (
          v_task.frequency='weekly'
          and completed_at::date between (v_local_date - ((extract(isodow from v_local_date)::int)-1))
                                    and (v_local_date + (7-extract(isodow from v_local_date)::int))
        )
        or (
          v_task.frequency='monthly'
          and date_trunc('month', completed_at)::date = date_trunc('month', v_local_date)::date
        )
        or (
          v_task.frequency in ('daily','custom')
          and completed_at::date = v_local_date
        )
      )
  ) then
    v_balance := public.profile_balance(p_profile_id);
    return jsonb_build_object('applied', false, 'already_completed', true, 'period_key', v_period, 'amount', v_task.amount, 'balance', v_balance);
  end if;

  insert into public.task_completions(id, workspace_id, task_id, profile_id, completed_at, period_key, source, approved_by)
  values (p_event_id, v_task.workspace_id, p_task_id, p_profile_id, p_occurred_at, v_period, 'direct', (select auth.uid()))
  on conflict (task_id, profile_id, period_key) do nothing;
  get diagnostics v_rows = row_count;
  v_inserted := v_rows > 0;

  if v_inserted then
    insert into public.currency_ledger(id, workspace_id, profile_id, amount, transaction_type, source_id, description, created_by, created_at)
    values ('ledger-'||p_event_id, v_task.workspace_id, p_profile_id, v_task.amount, 'task_completion', p_event_id, v_task.title, (select auth.uid()), p_occurred_at)
    on conflict do nothing;

    update public.task_completion_requests
      set status='approved', reviewed_by=(select auth.uid()), reviewed_at=now()
      where task_id=p_task_id and profile_id=p_profile_id and status='pending';
  end if;

  v_balance := public.profile_balance(p_profile_id);
  return jsonb_build_object('applied', v_inserted, 'period_key', v_period, 'amount', v_task.amount, 'balance', v_balance);
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
begin
  select * into v_task from public.task_templates where id=p_task_id;
  if v_task.id is null then raise exception 'Task not found'; end if;
  if not public.is_linked_profile(p_profile_id) then raise exception 'Not authorized for profile'; end if;
  if not exists(select 1 from public.task_assignments where task_id=p_task_id and profile_id=p_profile_id) then raise exception 'Task not assigned'; end if;

  v_local_date := coalesce(p_local_date, (p_requested_at at time zone 'UTC')::date);
  if not public.task_is_scheduled_local(v_task, v_local_date) then raise exception 'Task is not scheduled for this date'; end if;
  v_period := coalesce(nullif(p_period_key,''), public.task_period_key(v_task.frequency, p_requested_at));

  if v_task.frequency <> 'unlimited' and exists(
    select 1 from public.task_completions
    where task_id=p_task_id and profile_id=p_profile_id
      and (
        period_key=v_period
        or (v_task.frequency='weekly' and completed_at::date between (v_local_date - ((extract(isodow from v_local_date)::int)-1)) and (v_local_date + (7-extract(isodow from v_local_date)::int)))
        or (v_task.frequency='monthly' and date_trunc('month', completed_at)::date = date_trunc('month', v_local_date)::date)
        or (v_task.frequency in ('daily','custom') and completed_at::date = v_local_date)
      )
  ) then
    return jsonb_build_object(
      'request_id', p_request_id,
      'status', 'approved',
      'workspace_id', v_task.workspace_id,
      'already_completed', true,
      'period_key', v_period
    );
  end if;

  if exists(
    select 1 from public.task_completion_requests
    where task_id=p_task_id and profile_id=p_profile_id and status='pending' and period_key=v_period
  ) then
    return jsonb_build_object('request_id', p_request_id, 'status', 'pending', 'workspace_id', v_task.workspace_id, 'already_pending', true);
  end if;

  insert into public.task_completion_requests(id, workspace_id, task_id, profile_id, requested_by, requested_at, period_key)
  values (p_request_id, v_task.workspace_id, p_task_id, p_profile_id, (select auth.uid()), p_requested_at, v_period)
  on conflict do nothing;

  return jsonb_build_object('request_id', p_request_id, 'status', 'pending', 'workspace_id', v_task.workspace_id, 'period_key', v_period);
end;
$$;

grant execute on function public.submit_task_request(text,text,text,timestamptz,text,date) to authenticated;
