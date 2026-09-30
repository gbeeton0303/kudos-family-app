-- Kudos 3.9.16
-- Fix weekly tasks created from suggested templates without schedule_days.
-- Client logic historically treated an empty weekly schedule as the weekday
-- on which the task was created. Supabase previously rejected those tasks as
-- "Task is not scheduled for this date."

-- Repair legacy weekly task rows so their fallback weekday becomes explicit.
update public.task_templates
set schedule_days = array[extract(dow from created_at)::smallint]
where frequency = 'weekly'
  and (schedule_days is null or cardinality(schedule_days) = 0);

-- Keep server-side scheduling behavior compatible with older/offline rows that
-- may still reach the database with an empty weekly schedule.
create or replace function public.task_is_scheduled_local(
  p_task public.task_templates,
  p_local_date date
)
returns boolean
language sql
stable
as $$
  select case
    when p_task.frequency in ('unlimited','daily','monthly') then true
    when p_task.frequency = 'weekly' then
      extract(dow from p_local_date)::smallint = any(
        case
          when p_task.schedule_days is null or cardinality(p_task.schedule_days) = 0
            then array[extract(dow from p_task.created_at)::smallint]
          else p_task.schedule_days
        end
      )
    else coalesce(p_local_date = any(p_task.schedule_dates), false)
  end;
$$;
