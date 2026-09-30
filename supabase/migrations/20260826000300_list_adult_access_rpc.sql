-- Load adult access without depending on an Edge Function cold start. Email
-- addresses remain manager-only and are returned by this security-definer RPC.

create or replace function public.list_adult_access(p_workspace_id uuid)
returns jsonb language plpgsql security definer set search_path = public, auth as $$
declare
  v_adults jsonb;
  v_invitations jsonb;
begin
  if not public.is_workspace_manager(p_workspace_id) then
    raise exception 'Only a family manager can view adult access.';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'userId', wm.user_id,
    'email', coalesce(u.email, 'Adult account'),
    'role', wm.role,
    'isCurrentUser', wm.user_id=(select auth.uid())
  ) order by wm.created_at), '[]'::jsonb)
  into v_adults
  from public.workspace_members wm
  left join auth.users u on u.id=wm.user_id
  where wm.workspace_id=p_workspace_id and wm.role in ('parent','teacher');

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', ai.id,
    'invited_email', ai.invited_email,
    'expires_at', ai.expires_at,
    'created_at', ai.created_at
  ) order by ai.created_at desc), '[]'::jsonb)
  into v_invitations
  from public.adult_invites ai
  where ai.workspace_id=p_workspace_id
    and ai.accepted_at is null
    and ai.revoked_at is null
    and ai.expires_at>now();

  return jsonb_build_object('adults',v_adults,'invitations',v_invitations);
end;
$$;

revoke all on function public.list_adult_access(uuid) from public, anon;
grant execute on function public.list_adult_access(uuid) to authenticated;
