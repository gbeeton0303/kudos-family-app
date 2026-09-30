-- Kudos Family 1.0.0: removing a task must never erase earned currency or
-- completion history. Tasks are archived instead of hard-deleted; assignments
-- are removed so the task immediately disappears from active profile screens.

alter table public.task_templates
  add column if not exists archived_at timestamptz;

create index if not exists task_templates_active_workspace_idx
  on public.task_templates(workspace_id, created_at)
  where archived_at is null;

create or replace function public.finalize_task_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    delete from public.task_assignments
    where task_id = new.id;

    update public.task_completion_requests
    set status = 'denied',
        reviewed_by = coalesce((select auth.uid()), reviewed_by),
        reviewed_at = coalesce(reviewed_at, now())
    where task_id = new.id
      and status = 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists task_templates_finalize_archive on public.task_templates;
create trigger task_templates_finalize_archive
after update of archived_at on public.task_templates
for each row execute function public.finalize_task_archive();

-- Completion rows are historical financial records. Prevent any future hard
-- delete of a task with completions from cascading through those records.
alter table public.task_completions
  drop constraint if exists task_completions_task_id_fkey;

alter table public.task_completions
  add constraint task_completions_task_id_fkey
  foreign key (task_id) references public.task_templates(id) on delete restrict;

