-- Make task awards self-healing and atomic. This repairs the two partial-write
-- states seen in production: a visible task with a missing assignment, and a
-- completion row whose currency-ledger insert was previously missed.

create or replace function public.ensure_task_completion_credit(p_completion_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_rows integer := 0;
begin
  insert into public.currency_ledger(
    id, workspace_id, profile_id, amount, transaction_type, source_id,
    description, created_by, created_at
  )
  select
    'ledger-' || c.id, c.workspace_id, c.profile_id, t.amount,
    'task_completion', c.id, t.title, coalesce(c.approved_by, (select auth.uid())), c.completed_at
  from public.task_completions c
  join public.task_templates t on t.id = c.task_id
  where c.id = p_completion_id
    and not exists (
      select 1 from public.currency_ledger l
      where l.transaction_type = 'task_completion' and l.source_id = c.id
    )
  on conflict do nothing;
  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

revoke all on function public.ensure_task_completion_credit(text) from public, anon, authenticated;

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
  v_rows integer := 0;
  v_balance integer;
begin
  select * into v_task from public.task_templates where id = p_task_id;
  if v_task.id is null or not public.is_workspace_manager(v_task.workspace_id) then raise exception 'Not authorized'; end if;

  -- A manager completing a task for a profile is authoritative evidence that
  -- the cached assignment is intended. Repair a prior partial assignment write.
  if not exists(select 1 from public.task_assignments where task_id=p_task_id and profile_id=p_profile_id) then
    if not exists(select 1 from public.child_profiles where id=p_profile_id and workspace_id=v_task.workspace_id) then
      raise exception 'Profile does not belong to this workspace';
    end if;
    insert into public.task_assignments(workspace_id, task_id, profile_id)
    values(v_task.workspace_id, p_task_id, p_profile_id)
    on conflict do nothing;
  end if;

  v_local_date := coalesce(p_local_date, (p_occurred_at at time zone 'UTC')::date);
  if not public.task_is_scheduled_local(v_task, v_local_date) then raise exception 'Task is not scheduled for this date'; end if;
  v_period := coalesce(nullif(p_period_key,''), public.task_period_key(v_task.frequency, p_occurred_at));

  if v_task.frequency <> 'unlimited' then
    select c.id into v_completion_id
    from public.task_completions c
    where c.task_id=p_task_id and c.profile_id=p_profile_id
      and (
        c.period_key=v_period
        or (v_task.frequency='weekly' and c.completed_at::date between (v_local_date - ((extract(isodow from v_local_date)::int)-1)) and (v_local_date + (7-extract(isodow from v_local_date)::int)))
        or (v_task.frequency='monthly' and date_trunc('month', c.completed_at)::date = date_trunc('month', v_local_date)::date)
        or (v_task.frequency in ('daily','custom') and c.completed_at::date = v_local_date)
      )
    order by c.completed_at desc limit 1;
  end if;

  if v_completion_id is null then
    insert into public.task_completions(id, workspace_id, task_id, profile_id, completed_at, period_key, source, approved_by)
    values(p_event_id, v_task.workspace_id, p_task_id, p_profile_id, p_occurred_at, v_period, 'direct', (select auth.uid()))
    on conflict (task_id, profile_id, period_key) do nothing
    returning id into v_completion_id;
    get diagnostics v_rows = row_count;
    v_inserted := v_rows > 0;

    -- A concurrent request may have inserted the same period first.
    if v_completion_id is null then
      select id into v_completion_id from public.task_completions
      where task_id=p_task_id and profile_id=p_profile_id and period_key=v_period
      order by completed_at desc limit 1;
    end if;
  end if;

  if v_completion_id is not null then
    v_credited := public.ensure_task_completion_credit(v_completion_id);
    update public.task_completion_requests
      set status='approved', reviewed_by=(select auth.uid()), reviewed_at=now()
      where task_id=p_task_id and profile_id=p_profile_id and status='pending' and period_key=v_period;
  end if;

  v_balance := public.profile_balance(p_profile_id);
  return jsonb_build_object(
    'applied', v_inserted or v_credited,
    'already_completed', not v_inserted,
    'period_key', v_period,
    'amount', v_task.amount,
    'balance', v_balance
  );
end;
$$;

grant execute on function public.complete_task_direct(text,text,text,timestamptz,text,date) to authenticated;

create or replace function public.review_task_request(
  p_request_id text,
  p_status text,
  p_completion_id text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_request public.task_completion_requests%rowtype;
  v_task public.task_templates%rowtype;
  v_completion_id text;
  v_inserted boolean := false;
  v_credited boolean := false;
  v_balance integer;
begin
  select * into v_request from public.task_completion_requests where id=p_request_id for update;
  if v_request.id is null or v_request.status <> 'pending' then raise exception 'Pending request not found'; end if;
  if not public.is_workspace_manager(v_request.workspace_id) then raise exception 'Not authorized'; end if;
  if p_status not in ('approved','denied') then raise exception 'Invalid status'; end if;

  if p_status='approved' then
    select * into v_task from public.task_templates where id=v_request.task_id;
    if v_task.id is null then raise exception 'Task not found'; end if;

    insert into public.task_assignments(workspace_id, task_id, profile_id)
    values(v_request.workspace_id, v_request.task_id, v_request.profile_id)
    on conflict do nothing;

    insert into public.task_completions(id, workspace_id, task_id, profile_id, completed_at, period_key, source, approved_by)
    values(coalesce(p_completion_id,'completion-'||p_request_id), v_request.workspace_id, v_request.task_id, v_request.profile_id, v_request.requested_at, v_request.period_key, 'request', (select auth.uid()))
    on conflict (task_id, profile_id, period_key) do nothing
    returning id into v_completion_id;
    v_inserted := v_completion_id is not null;

    if v_completion_id is null then
      select id into v_completion_id from public.task_completions
      where task_id=v_request.task_id and profile_id=v_request.profile_id and period_key=v_request.period_key
      order by completed_at desc limit 1;
    end if;
    if v_completion_id is null then raise exception 'Completion could not be recorded'; end if;

    v_credited := public.ensure_task_completion_credit(v_completion_id);
  end if;

  update public.task_completion_requests
    set status=p_status, reviewed_by=(select auth.uid()), reviewed_at=now()
    where id=p_request_id;
  v_balance := public.profile_balance(v_request.profile_id);
  return jsonb_build_object(
    'request_id',p_request_id, 'status',p_status, 'profile_id',v_request.profile_id,
    'completion_id',v_completion_id, 'applied',v_inserted or v_credited,
    'balance',v_balance, 'workspace_id',v_request.workspace_id
  );
end;
$$;

grant execute on function public.review_task_request(text,text,text) to authenticated;

-- Backfill every historical completion that is still missing its credit.
insert into public.currency_ledger(
  id, workspace_id, profile_id, amount, transaction_type, source_id,
  description, created_by, created_at
)
select
  'ledger-' || c.id, c.workspace_id, c.profile_id, t.amount,
  'task_completion', c.id, t.title, c.approved_by, c.completed_at
from public.task_completions c
join public.task_templates t on t.id = c.task_id
where not exists (
  select 1 from public.currency_ledger l
  where l.transaction_type='task_completion' and l.source_id=c.id
)
on conflict do nothing;
