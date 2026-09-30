-- Repair legacy approved requests that never received a matching completion,
-- then ensure every completion has exactly one currency-ledger award.

insert into public.task_completions (
  id, workspace_id, task_id, profile_id, completed_at, period_key, source, approved_by
)
select
  'repair-' || r.id,
  r.workspace_id,
  r.task_id,
  r.profile_id,
  r.requested_at,
  r.period_key,
  'request',
  r.reviewed_by
from public.task_completion_requests r
join public.task_templates t on t.id = r.task_id
where r.status = 'approved'
  and not exists (
    select 1
    from public.task_completions c
    where c.task_id = r.task_id
      and c.profile_id = r.profile_id
      and (
        c.period_key = r.period_key
        or (t.frequency in ('daily','custom') and c.completed_at::date = r.requested_at::date)
        or (t.frequency = 'weekly' and date_trunc('week', c.completed_at) = date_trunc('week', r.requested_at))
        or (t.frequency = 'monthly' and date_trunc('month', c.completed_at) = date_trunc('month', r.requested_at))
      )
  )
on conflict (task_id, profile_id, period_key) do nothing;

insert into public.currency_ledger (
  id, workspace_id, profile_id, amount, transaction_type, source_id,
  description, created_by, created_at
)
select
  'ledger-' || c.id,
  c.workspace_id,
  c.profile_id,
  t.amount,
  'task_completion',
  c.id,
  t.title,
  c.approved_by,
  c.completed_at
from public.task_completions c
join public.task_templates t on t.id = c.task_id
where not exists (
  select 1 from public.currency_ledger l
  where l.transaction_type = 'task_completion' and l.source_id = c.id
)
on conflict do nothing;
