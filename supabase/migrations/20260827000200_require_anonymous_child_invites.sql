-- Defense in depth: child codes may be consumed only by an anonymous Auth
-- account, even if someone bypasses the Edge Function and invokes the RPC.

create or replace function public.accept_profile_invite(p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_invite public.profile_invites%rowtype;
  v_profile public.child_profiles%rowtype;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if not exists (
    select 1 from auth.users
    where id = (select auth.uid()) and is_anonymous is true
  ) then
    raise exception 'A child code can only be used while creating a child account';
  end if;

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
    raise exception 'This child profile is already linked. A parent must replace the child device first.';
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
