create extension if not exists pgcrypto with schema extensions;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  type text not null check (type in ('family', 'classroom')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('parent', 'teacher', 'child')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.child_profiles (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  linked_user_id uuid unique references auth.users(id) on delete set null,
  name text not null check (char_length(name) between 1 and 80),
  avatar_type text not null check (avatar_type in ('preset', 'photo')),
  avatar_value text not null,
  color_key text not null,
  pattern text not null check (pattern in ('solid', 'striped', 'polka')),
  currency_type text not null check (currency_type in ('stars', 'marbles', 'points', 'coins')),
  storage_type text not null check (storage_type in ('glassJar', 'piggyBank', 'largeStar')),
  starting_balance integer not null default 0 check (starting_balance >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table if not exists public.task_templates (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  amount integer not null check (amount > 0),
  frequency text not null check (frequency in ('unlimited', 'daily', 'weekly', 'custom')),
  description text,
  icon_type text not null check (icon_type in ('preset', 'photo')),
  icon_value text not null,
  schedule_days smallint[],
  schedule_dates date[],
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  check (schedule_days is null or schedule_days <@ array[0,1,2,3,4,5,6]::smallint[])
);

create table if not exists public.task_assignments (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id text not null references public.task_templates(id) on delete cascade,
  profile_id text not null references public.child_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, profile_id)
);

create table if not exists public.task_completions (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id text not null references public.task_templates(id) on delete cascade,
  profile_id text not null references public.child_profiles(id) on delete cascade,
  completed_at timestamptz not null default now(),
  period_key text not null,
  source text not null default 'direct' check (source in ('direct', 'request', 'migration')),
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (task_id, profile_id, period_key)
);

create table if not exists public.task_completion_requests (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  task_id text not null references public.task_templates(id) on delete cascade,
  profile_id text not null references public.child_profiles(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  requested_at timestamptz not null default now(),
  period_key text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists task_request_pending_unique
  on public.task_completion_requests(task_id, profile_id, period_key)
  where status = 'pending';

create table if not exists public.reward_templates (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  cost integer not null check (cost > 0),
  icon_type text not null check (icon_type in ('preset', 'photo')),
  icon_value text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)
);

create table if not exists public.reward_assignments (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reward_id text not null references public.reward_templates(id) on delete cascade,
  profile_id text not null references public.child_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reward_id, profile_id)
);

create table if not exists public.reward_redemptions (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reward_id text not null references public.reward_templates(id) on delete cascade,
  profile_id text not null references public.child_profiles(id) on delete cascade,
  cost integer not null check (cost > 0),
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.reward_deliveries (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  reward_id text not null references public.reward_templates(id) on delete cascade,
  profile_id text not null references public.child_profiles(id) on delete cascade,
  reward_title text not null,
  reward_icon_type text not null check (reward_icon_type in ('preset', 'photo')),
  reward_icon_value text not null,
  cost integer not null,
  balance_before integer not null,
  balance_after integer not null,
  sent_at timestamptz not null default now(),
  status text not null default 'waiting' check (status in ('waiting', 'opened')),
  opened_at timestamptz
);

create table if not exists public.currency_ledger (
  id text primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id text not null references public.child_profiles(id) on delete cascade,
  amount integer not null,
  transaction_type text not null check (transaction_type in ('task_completion', 'reward_redemption', 'adjustment', 'migration')),
  source_id text,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  expo_push_token text not null unique,
  platform text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.profile_invites (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_id text not null references public.child_profiles(id) on delete cascade,
  code_hash text not null unique,
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  used_by uuid references auth.users(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.migration_imports (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  imported_at timestamptz not null default now(),
  source_version text,
  primary key (workspace_id, user_id)
);

create index if not exists workspace_members_user_idx on public.workspace_members(user_id);
create index if not exists child_profiles_workspace_idx on public.child_profiles(workspace_id);
create index if not exists child_profiles_linked_user_idx on public.child_profiles(linked_user_id);
create index if not exists task_templates_workspace_idx on public.task_templates(workspace_id);
create index if not exists task_assignments_profile_idx on public.task_assignments(profile_id);
create index if not exists task_completions_profile_idx on public.task_completions(profile_id, completed_at desc);
create index if not exists task_requests_workspace_status_idx on public.task_completion_requests(workspace_id, status);
create index if not exists reward_templates_workspace_idx on public.reward_templates(workspace_id);
create index if not exists reward_assignments_profile_idx on public.reward_assignments(profile_id);
create index if not exists reward_redemptions_profile_idx on public.reward_redemptions(profile_id, redeemed_at desc);
create index if not exists reward_deliveries_profile_status_idx on public.reward_deliveries(profile_id, status);
create index if not exists ledger_profile_idx on public.currency_ledger(profile_id, created_at desc);
create index if not exists device_tokens_workspace_idx on public.device_tokens(workspace_id);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger user_profiles_updated_at before update on public.user_profiles for each row execute function public.set_updated_at();
create trigger workspaces_updated_at before update on public.workspaces for each row execute function public.set_updated_at();
create trigger child_profiles_updated_at before update on public.child_profiles for each row execute function public.set_updated_at();
create trigger task_templates_updated_at before update on public.task_templates for each row execute function public.set_updated_at();
create trigger reward_templates_updated_at before update on public.reward_templates for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_profiles(user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (user_id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_workspace_manager(p_workspace_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = (select auth.uid())
      and role in ('parent', 'teacher')
  );
$$;

create or replace function public.is_linked_profile(p_profile_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(
    select 1 from public.child_profiles
    where id = p_profile_id and linked_user_id = (select auth.uid())
  );
$$;

create or replace function public.create_workspace(p_name text, p_type text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_role text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if p_type not in ('family', 'classroom') then raise exception 'Invalid workspace type'; end if;
  v_role := case when p_type = 'classroom' then 'teacher' else 'parent' end;
  insert into public.workspaces(name, type, created_by)
  values (trim(p_name), p_type, (select auth.uid())) returning id into v_id;
  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_id, (select auth.uid()), v_role);
  return v_id;
end;
$$;

grant execute on function public.create_workspace(text, text) to authenticated;

create or replace function public.profile_balance(p_profile_id text)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v_workspace uuid;
  v_start integer;
  v_total integer;
begin
  select workspace_id, starting_balance into v_workspace, v_start from public.child_profiles where id = p_profile_id;
  if v_workspace is null or (not public.is_workspace_manager(v_workspace) and not public.is_linked_profile(p_profile_id)) then
    raise exception 'Not authorized';
  end if;
  select coalesce(sum(amount), 0) into v_total from public.currency_ledger where profile_id = p_profile_id;
  return greatest(0, v_start + v_total);
end;
$$;
grant execute on function public.profile_balance(text) to authenticated;

create or replace function public.task_period_key(p_frequency text, p_occurred_at timestamptz)
returns text language sql immutable as $$
  select case
    when p_frequency = 'unlimited' then 'event-' || extract(epoch from p_occurred_at)::text
    when p_frequency in ('daily', 'custom') then 'day-' || to_char(p_occurred_at at time zone 'UTC', 'YYYY-MM-DD')
    else 'week-' || to_char(date_trunc('week', p_occurred_at at time zone 'UTC'), 'IYYY-IW') || '-weekday-' || extract(dow from p_occurred_at at time zone 'UTC')::int::text
  end;
$$;

create or replace function public.task_is_scheduled(p_task public.task_templates, p_occurred_at timestamptz)
returns boolean language sql stable as $$
  select case
    when p_task.frequency in ('unlimited', 'daily') then true
    when p_task.frequency = 'weekly' then coalesce(extract(dow from p_occurred_at at time zone 'UTC')::smallint = any(p_task.schedule_days), false)
    else coalesce((p_occurred_at at time zone 'UTC')::date = any(p_task.schedule_dates), false)
  end;
$$;

create or replace function public.complete_task_direct(
  p_event_id text,
  p_task_id text,
  p_profile_id text,
  p_occurred_at timestamptz default now()
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_task public.task_templates%rowtype;
  v_period text;
  v_inserted boolean := false;
  v_rows integer := 0;
  v_balance integer;
begin
  select * into v_task from public.task_templates where id = p_task_id;
  if v_task.id is null or not public.is_workspace_manager(v_task.workspace_id) then raise exception 'Not authorized'; end if;
  if not exists(select 1 from public.task_assignments where task_id=p_task_id and profile_id=p_profile_id) then raise exception 'Task not assigned'; end if;
  if not public.task_is_scheduled(v_task, p_occurred_at) then raise exception 'Task is not scheduled for this date'; end if;
  v_period := public.task_period_key(v_task.frequency, p_occurred_at);
  insert into public.task_completions(id, workspace_id, task_id, profile_id, completed_at, period_key, source, approved_by)
  values (p_event_id, v_task.workspace_id, p_task_id, p_profile_id, p_occurred_at, v_period, 'direct', (select auth.uid()))
  on conflict (task_id, profile_id, period_key) do nothing;
  get diagnostics v_rows = row_count;
  v_inserted := v_rows > 0;
  if v_inserted then
    insert into public.currency_ledger(id, workspace_id, profile_id, amount, transaction_type, source_id, description, created_by, created_at)
    values ('ledger-'||p_event_id, v_task.workspace_id, p_profile_id, v_task.amount, 'task_completion', p_event_id, v_task.title, (select auth.uid()), p_occurred_at)
    on conflict do nothing;
    update public.task_completion_requests set status='approved', reviewed_by=(select auth.uid()), reviewed_at=now()
      where task_id=p_task_id and profile_id=p_profile_id and status='pending';
  end if;
  v_balance := public.profile_balance(p_profile_id);
  return jsonb_build_object('applied', v_inserted, 'amount', v_task.amount, 'balance', v_balance);
end;
$$;

grant execute on function public.complete_task_direct(text,text,text,timestamptz) to authenticated;

create or replace function public.submit_task_request(
  p_request_id text,
  p_task_id text,
  p_profile_id text,
  p_requested_at timestamptz default now()
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_task public.task_templates%rowtype;
  v_period text;
begin
  select * into v_task from public.task_templates where id=p_task_id;
  if v_task.id is null then raise exception 'Task not found'; end if;
  if not public.is_linked_profile(p_profile_id) then raise exception 'Not authorized for profile'; end if;
  if not exists(select 1 from public.task_assignments where task_id=p_task_id and profile_id=p_profile_id) then raise exception 'Task not assigned'; end if;
  if not public.task_is_scheduled(v_task, p_requested_at) then raise exception 'Task is not scheduled for this date'; end if;
  v_period := public.task_period_key(v_task.frequency, p_requested_at);
  if exists(select 1 from public.task_completions where task_id=p_task_id and profile_id=p_profile_id and period_key=v_period) then
    raise exception 'Task already completed for this period';
  end if;
  insert into public.task_completion_requests(id, workspace_id, task_id, profile_id, requested_by, requested_at, period_key)
  values (p_request_id, v_task.workspace_id, p_task_id, p_profile_id, (select auth.uid()), p_requested_at, v_period)
  on conflict do nothing;
  return jsonb_build_object('request_id', p_request_id, 'status', 'pending', 'workspace_id', v_task.workspace_id);
end;
$$;
grant execute on function public.submit_task_request(text,text,text,timestamptz) to authenticated;

create or replace function public.review_task_request(
  p_request_id text,
  p_status text,
  p_completion_id text default null
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_request public.task_completion_requests%rowtype;
  v_task public.task_templates%rowtype;
  v_balance integer;
  v_rows integer := 0;
begin
  select * into v_request from public.task_completion_requests where id=p_request_id for update;
  if v_request.id is null or v_request.status <> 'pending' then raise exception 'Pending request not found'; end if;
  if not public.is_workspace_manager(v_request.workspace_id) then raise exception 'Not authorized'; end if;
  if p_status not in ('approved','denied') then raise exception 'Invalid status'; end if;
  if p_status='approved' then
    select * into v_task from public.task_templates where id=v_request.task_id;
    insert into public.task_completions(id, workspace_id, task_id, profile_id, completed_at, period_key, source, approved_by)
    values (coalesce(p_completion_id,'completion-'||p_request_id), v_request.workspace_id, v_request.task_id, v_request.profile_id, v_request.requested_at, v_request.period_key, 'request', (select auth.uid()))
    on conflict (task_id, profile_id, period_key) do nothing;
    get diagnostics v_rows = row_count;
    if v_rows > 0 then
      insert into public.currency_ledger(id, workspace_id, profile_id, amount, transaction_type, source_id, description, created_by, created_at)
      values ('ledger-'||coalesce(p_completion_id,'completion-'||p_request_id), v_request.workspace_id, v_request.profile_id, v_task.amount, 'task_completion', coalesce(p_completion_id,'completion-'||p_request_id), v_task.title, (select auth.uid()), v_request.requested_at)
      on conflict do nothing;
    end if;
  end if;
  update public.task_completion_requests set status=p_status, reviewed_by=(select auth.uid()), reviewed_at=now() where id=p_request_id;
  v_balance := public.profile_balance(v_request.profile_id);
  return jsonb_build_object('request_id',p_request_id,'status',p_status,'profile_id',v_request.profile_id,'balance',v_balance,'workspace_id',v_request.workspace_id);
end;
$$;
grant execute on function public.review_task_request(text,text,text) to authenticated;

create or replace function public.redeem_reward(
  p_redemption_id text,
  p_delivery_id text,
  p_reward_id text,
  p_profile_id text,
  p_deliver_to_child boolean default true,
  p_redeemed_at timestamptz default now()
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
  if v_balance_before < v_reward.cost then raise exception 'Insufficient balance'; end if;
  insert into public.reward_redemptions(id,workspace_id,reward_id,profile_id,cost,redeemed_by,redeemed_at)
  values (p_redemption_id,v_reward.workspace_id,p_reward_id,p_profile_id,v_reward.cost,(select auth.uid()),p_redeemed_at)
  on conflict do nothing;
  insert into public.currency_ledger(id,workspace_id,profile_id,amount,transaction_type,source_id,description,created_by,created_at)
  values ('ledger-'||p_redemption_id,v_reward.workspace_id,p_profile_id,-v_reward.cost,'reward_redemption',p_redemption_id,v_reward.title,(select auth.uid()),p_redeemed_at)
  on conflict do nothing;
  v_balance_after := public.profile_balance(p_profile_id);
  if p_deliver_to_child then
    insert into public.reward_deliveries(id,workspace_id,reward_id,profile_id,reward_title,reward_icon_type,reward_icon_value,cost,balance_before,balance_after,sent_at)
    values (p_delivery_id,v_reward.workspace_id,p_reward_id,p_profile_id,v_reward.title,v_reward.icon_type,v_reward.icon_value,v_reward.cost,v_balance_before,v_balance_after,p_redeemed_at)
    on conflict do nothing;
  end if;
  return jsonb_build_object('redemption_id',p_redemption_id,'delivery_id',case when p_deliver_to_child then p_delivery_id else null end,'workspace_id',v_reward.workspace_id,'profile_id',p_profile_id,'balance_before',v_balance_before,'balance_after',v_balance_after);
end;
$$;
grant execute on function public.redeem_reward(text,text,text,text,boolean,timestamptz) to authenticated;

create or replace function public.open_reward_delivery(p_delivery_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_delivery public.reward_deliveries%rowtype;
begin
  select * into v_delivery from public.reward_deliveries where id=p_delivery_id for update;
  if v_delivery.id is null then raise exception 'Delivery not found'; end if;
  if not public.is_workspace_manager(v_delivery.workspace_id) and not public.is_linked_profile(v_delivery.profile_id) then raise exception 'Not authorized'; end if;
  update public.reward_deliveries set status='opened', opened_at=coalesce(opened_at,now()) where id=p_delivery_id;
  return jsonb_build_object('delivery_id',p_delivery_id,'status','opened');
end;
$$;
grant execute on function public.open_reward_delivery(text) to authenticated;

create or replace function public.create_profile_invite(p_profile_id text, p_hours integer default 168)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.child_profiles%rowtype;
  v_code text;
  v_id uuid;
begin
  select * into v_profile from public.child_profiles where id=p_profile_id;
  if v_profile.id is null or not public.is_workspace_manager(v_profile.workspace_id) then raise exception 'Not authorized'; end if;
  v_code := upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,8));
  insert into public.profile_invites(workspace_id,profile_id,code_hash,created_by,expires_at)
  values(v_profile.workspace_id,p_profile_id,encode(extensions.digest(lower(v_code),'sha256'),'hex'),(select auth.uid()),now()+make_interval(hours=>greatest(1,p_hours)))
  returning id into v_id;
  return jsonb_build_object('invite_id',v_id,'code',v_code,'expires_at',now()+make_interval(hours=>greatest(1,p_hours)),'profile_id',p_profile_id);
end;
$$;
grant execute on function public.create_profile_invite(text,integer) to authenticated;

create or replace function public.accept_profile_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_invite public.profile_invites%rowtype;
  v_role text := 'child';
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  select * into v_invite from public.profile_invites
   where code_hash=encode(extensions.digest(lower(trim(p_code)),'sha256'),'hex')
     and used_at is null and expires_at > now()
   order by created_at desc limit 1 for update;
  if v_invite.id is null then raise exception 'Invite is invalid or expired'; end if;
  update public.child_profiles set linked_user_id=(select auth.uid()) where id=v_invite.profile_id;
  insert into public.workspace_members(workspace_id,user_id,role)
  values(v_invite.workspace_id,(select auth.uid()),v_role)
  on conflict(workspace_id,user_id) do update set role='child';
  update public.profile_invites set used_by=(select auth.uid()),used_at=now() where id=v_invite.id;
  return jsonb_build_object('workspace_id',v_invite.workspace_id,'profile_id',v_invite.profile_id,'role','child');
end;
$$;
grant execute on function public.accept_profile_invite(text) to authenticated;

alter table public.user_profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.child_profiles enable row level security;
alter table public.task_templates enable row level security;
alter table public.task_assignments enable row level security;
alter table public.task_completions enable row level security;
alter table public.task_completion_requests enable row level security;
alter table public.reward_templates enable row level security;
alter table public.reward_assignments enable row level security;
alter table public.reward_redemptions enable row level security;
alter table public.reward_deliveries enable row level security;
alter table public.currency_ledger enable row level security;
alter table public.device_tokens enable row level security;
alter table public.profile_invites enable row level security;
alter table public.migration_imports enable row level security;

create policy user_profiles_self_select on public.user_profiles for select to authenticated using (user_id=(select auth.uid()));
create policy user_profiles_self_update on public.user_profiles for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy workspaces_member_select on public.workspaces for select to authenticated using (public.is_workspace_member(id));
create policy workspaces_manager_update on public.workspaces for update to authenticated using (public.is_workspace_manager(id)) with check (public.is_workspace_manager(id));
create policy workspace_members_self_or_manager_select on public.workspace_members for select to authenticated using (user_id=(select auth.uid()) or public.is_workspace_manager(workspace_id));
create policy workspace_members_manager_write on public.workspace_members for all to authenticated using (public.is_workspace_manager(workspace_id)) with check (public.is_workspace_manager(workspace_id));

create policy profiles_select on public.child_profiles for select to authenticated using (public.is_workspace_manager(workspace_id) or linked_user_id=(select auth.uid()));
create policy profiles_manager_insert on public.child_profiles for insert to authenticated with check (public.is_workspace_manager(workspace_id));
create policy profiles_manager_update on public.child_profiles for update to authenticated using (public.is_workspace_manager(workspace_id)) with check (public.is_workspace_manager(workspace_id));
create policy profiles_manager_delete on public.child_profiles for delete to authenticated using (public.is_workspace_manager(workspace_id));

create policy tasks_select on public.task_templates for select to authenticated using (
  public.is_workspace_manager(workspace_id) or exists(
    select 1 from public.task_assignments a join public.child_profiles p on p.id=a.profile_id
    where a.task_id=task_templates.id and p.linked_user_id=(select auth.uid())
  )
);
create policy tasks_manager_write on public.task_templates for all to authenticated using (public.is_workspace_manager(workspace_id)) with check (public.is_workspace_manager(workspace_id));
create policy task_assignments_select on public.task_assignments for select to authenticated using (
  public.is_workspace_manager(workspace_id) or exists(select 1 from public.child_profiles p where p.id=profile_id and p.linked_user_id=(select auth.uid()))
);
create policy task_assignments_manager_write on public.task_assignments for all to authenticated using (public.is_workspace_manager(workspace_id)) with check (public.is_workspace_manager(workspace_id));
create policy task_completions_select on public.task_completions for select to authenticated using (public.is_workspace_manager(workspace_id) or public.is_linked_profile(profile_id));
create policy task_requests_select on public.task_completion_requests for select to authenticated using (public.is_workspace_manager(workspace_id) or public.is_linked_profile(profile_id));

create policy rewards_select on public.reward_templates for select to authenticated using (
  public.is_workspace_manager(workspace_id) or exists(
    select 1 from public.reward_assignments a join public.child_profiles p on p.id=a.profile_id
    where a.reward_id=reward_templates.id and p.linked_user_id=(select auth.uid())
  )
);
create policy rewards_manager_write on public.reward_templates for all to authenticated using (public.is_workspace_manager(workspace_id)) with check (public.is_workspace_manager(workspace_id));
create policy reward_assignments_select on public.reward_assignments for select to authenticated using (
  public.is_workspace_manager(workspace_id) or exists(select 1 from public.child_profiles p where p.id=profile_id and p.linked_user_id=(select auth.uid()))
);
create policy reward_assignments_manager_write on public.reward_assignments for all to authenticated using (public.is_workspace_manager(workspace_id)) with check (public.is_workspace_manager(workspace_id));
create policy reward_redemptions_select on public.reward_redemptions for select to authenticated using (public.is_workspace_manager(workspace_id) or public.is_linked_profile(profile_id));
create policy reward_deliveries_select on public.reward_deliveries for select to authenticated using (public.is_workspace_manager(workspace_id) or public.is_linked_profile(profile_id));
create policy ledger_select on public.currency_ledger for select to authenticated using (public.is_workspace_manager(workspace_id) or public.is_linked_profile(profile_id));

create policy device_tokens_self_select on public.device_tokens for select to authenticated using (user_id=(select auth.uid()));
create policy device_tokens_self_insert on public.device_tokens for insert to authenticated with check (user_id=(select auth.uid()) and public.is_workspace_member(workspace_id));
create policy device_tokens_self_update on public.device_tokens for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()));
create policy device_tokens_self_delete on public.device_tokens for delete to authenticated using (user_id=(select auth.uid()));
create policy profile_invites_manager_select on public.profile_invites for select to authenticated using (public.is_workspace_manager(workspace_id));
create policy migration_imports_self_or_manager on public.migration_imports for select to authenticated using (user_id=(select auth.uid()) or public.is_workspace_manager(workspace_id));
create policy migration_imports_self_insert on public.migration_imports for insert to authenticated with check (user_id=(select auth.uid()) and public.is_workspace_manager(workspace_id));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('brightsteps-media','brightsteps-media',false,10485760,array['image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

create policy media_member_read on storage.objects for select to authenticated using (
  bucket_id='brightsteps-media' and (
    public.is_workspace_manager(((storage.foldername(name))[1])::uuid)
    or (
      (storage.foldername(name))[2] = 'profiles'
      and public.is_linked_profile((storage.foldername(name))[3])
    )
    or (
      (storage.foldername(name))[2] = 'tasks'
      and exists (
        select 1 from public.task_assignments a
        join public.child_profiles p on p.id = a.profile_id
        where a.task_id = (storage.foldername(name))[3]
          and p.linked_user_id = (select auth.uid())
      )
    )
    or (
      (storage.foldername(name))[2] = 'rewards'
      and exists (
        select 1 from public.reward_assignments a
        join public.child_profiles p on p.id = a.profile_id
        where a.reward_id = (storage.foldername(name))[3]
          and p.linked_user_id = (select auth.uid())
      )
    )
  )
);
create policy media_manager_insert on storage.objects for insert to authenticated with check (
  bucket_id='brightsteps-media' and public.is_workspace_manager(((storage.foldername(name))[1])::uuid)
);
create policy media_manager_update on storage.objects for update to authenticated using (
  bucket_id='brightsteps-media' and public.is_workspace_manager(((storage.foldername(name))[1])::uuid)
) with check (
  bucket_id='brightsteps-media' and public.is_workspace_manager(((storage.foldername(name))[1])::uuid)
);
create policy media_manager_delete on storage.objects for delete to authenticated using (
  bucket_id='brightsteps-media' and public.is_workspace_manager(((storage.foldername(name))[1])::uuid)
);

revoke all on public.task_completions, public.task_completion_requests, public.reward_redemptions, public.reward_deliveries, public.currency_ledger from anon, authenticated;
grant select on public.task_completions, public.task_completion_requests, public.reward_redemptions, public.reward_deliveries, public.currency_ledger to authenticated;
grant select,insert,update,delete on public.user_profiles,public.workspaces,public.workspace_members,public.child_profiles,public.task_templates,public.task_assignments,public.reward_templates,public.reward_assignments,public.device_tokens,public.profile_invites,public.migration_imports to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.child_profiles;
exception when duplicate_object then null;
end $$;
do $$
begin alter publication supabase_realtime add table public.task_templates; exception when duplicate_object then null; end $$;
do $$
begin alter publication supabase_realtime add table public.task_assignments; exception when duplicate_object then null; end $$;
do $$
begin alter publication supabase_realtime add table public.task_completions; exception when duplicate_object then null; end $$;
do $$
begin alter publication supabase_realtime add table public.task_completion_requests; exception when duplicate_object then null; end $$;
do $$
begin alter publication supabase_realtime add table public.reward_templates; exception when duplicate_object then null; end $$;
do $$
begin alter publication supabase_realtime add table public.reward_assignments; exception when duplicate_object then null; end $$;
do $$
begin alter publication supabase_realtime add table public.reward_redemptions; exception when duplicate_object then null; end $$;
do $$
begin alter publication supabase_realtime add table public.reward_deliveries; exception when duplicate_object then null; end $$;
do $$
begin alter publication supabase_realtime add table public.currency_ledger; exception when duplicate_object then null; end $$;
