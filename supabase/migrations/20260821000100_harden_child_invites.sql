-- Consume child invitations atomically and never allow an existing child link
-- to be silently transferred to another Auth account.
create or replace function public.accept_profile_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_invite public.profile_invites%rowtype;
  v_profile public.child_profiles%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;

  select * into v_invite from public.profile_invites
   where code_hash=encode(extensions.digest(lower(trim(p_code)),'sha256'),'hex')
     and used_at is null and expires_at > now()
   order by created_at desc limit 1 for update;
  if v_invite.id is null then raise exception 'Invite is invalid or expired'; end if;

  select * into v_profile from public.child_profiles
   where id=v_invite.profile_id and workspace_id=v_invite.workspace_id
   for update;
  if v_profile.id is null then raise exception 'Child profile no longer exists'; end if;
  if v_profile.linked_user_id is not null and v_profile.linked_user_id <> (select auth.uid()) then
    raise exception 'This child profile is already linked. Create a new code from the parent account if the link must be replaced.';
  end if;

  update public.child_profiles set linked_user_id=(select auth.uid()), updated_at=now() where id=v_invite.profile_id;
  insert into public.workspace_members(workspace_id,user_id,role)
  values(v_invite.workspace_id,(select auth.uid()),'child')
  on conflict(workspace_id,user_id) do update set role='child';
  update public.profile_invites
     set used_by=(select auth.uid()), used_at=now()
   where profile_id=v_invite.profile_id and workspace_id=v_invite.workspace_id and used_at is null;
  return jsonb_build_object('workspace_id',v_invite.workspace_id,'profile_id',v_invite.profile_id,'role','child');
end;
$$;
grant execute on function public.accept_profile_invite(text) to authenticated;

create table if not exists public.profile_invite_rate_limits (
  key_hash text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0
);
alter table public.profile_invite_rate_limits enable row level security;

create or replace function public.consume_profile_invite_attempt(p_key_hash text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_row public.profile_invite_rate_limits%rowtype;
begin
  insert into public.profile_invite_rate_limits(key_hash, attempts) values(p_key_hash, 0)
  on conflict(key_hash) do nothing;
  select * into v_row from public.profile_invite_rate_limits where key_hash=p_key_hash for update;
  if v_row.window_started_at < now() - interval '15 minutes' then
    update public.profile_invite_rate_limits set window_started_at=now(), attempts=1 where key_hash=p_key_hash;
    return true;
  end if;
  if v_row.attempts >= 10 then return false; end if;
  update public.profile_invite_rate_limits set attempts=attempts+1 where key_hash=p_key_hash;
  return true;
end;
$$;
revoke all on function public.consume_profile_invite_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_profile_invite_attempt(text) to service_role;

create or replace function public.create_profile_invite(p_profile_id text, p_hours integer default 168)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_profile public.child_profiles%rowtype; v_code text; v_id uuid; v_expires timestamptz;
begin
  select * into v_profile from public.child_profiles where id=p_profile_id for update;
  if v_profile.id is null or not public.is_workspace_manager(v_profile.workspace_id) then raise exception 'Not authorized'; end if;
  if v_profile.linked_user_id is not null then raise exception 'This child profile is already linked'; end if;
  update public.profile_invites set used_at=now() where profile_id=p_profile_id and used_at is null;
  v_code := upper(substr(encode(extensions.gen_random_bytes(8),'hex'),1,8));
  v_expires := now()+make_interval(hours=>least(168,greatest(1,p_hours)));
  insert into public.profile_invites(workspace_id,profile_id,code_hash,created_by,expires_at)
  values(v_profile.workspace_id,p_profile_id,encode(extensions.digest(lower(v_code),'sha256'),'hex'),(select auth.uid()),v_expires)
  returning id into v_id;
  return jsonb_build_object('invite_id',v_id,'code',v_code,'expires_at',v_expires,'profile_id',p_profile_id);
end;
$$;
grant execute on function public.create_profile_invite(text,integer) to authenticated;
