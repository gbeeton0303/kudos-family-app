-- Anonymous Auth users are dedicated child accounts. They may be linked only
-- to their personal child profile and must never become workspace managers.

create or replace function public.create_workspace(p_name text, p_type text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
  v_role text;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
  if exists(select 1 from auth.users where id=(select auth.uid()) and is_anonymous is true)
     or coalesce((select auth.jwt()->'user_metadata'->>'account_type'),'')='child' then
    raise exception 'Child accounts cannot create a family or classroom';
  end if;
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

-- Revoke manager memberships accidentally created by anonymous accounts while
-- the old onboarding race was present. Workspace data is preserved.
delete from public.workspace_members wm
using auth.users au
where wm.user_id=au.id
  and au.is_anonymous is true
  and wm.role in ('parent','teacher');
