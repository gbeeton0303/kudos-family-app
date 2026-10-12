-- Service-only preparation for the explicit entire-account Edge Function.
-- Preview (p_apply=false) is read-only, including on old app versions.
create or replace function public.prepare_entire_kudos_account_deletion(
  p_user_id uuid,
  p_owned_workspace_ids uuid[],
  p_joined_workspace_ids uuid[],
  p_apply boolean default false
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_owned uuid[];
  v_joined uuid[];
begin
  if not exists(select 1 from auth.users where id=p_user_id and is_anonymous is not true)
    or exists(select 1 from public.workspace_members where user_id=p_user_id and role='child') then
    raise exception 'Only an adult can delete their entire account';
  end if;
  select coalesce(array_agg(id order by id), '{}'::uuid[]) into v_owned
    from public.workspaces where created_by=p_user_id;
  select coalesce(array_agg(workspace_id order by workspace_id), '{}'::uuid[]) into v_joined
    from public.workspace_members where user_id=p_user_id and not (workspace_id=any(v_owned));
  if v_owned is distinct from (select coalesce(array_agg(id order by id), '{}'::uuid[]) from unnest(p_owned_workspace_ids) id)
    or v_joined is distinct from (select coalesce(array_agg(id order by id), '{}'::uuid[]) from unnest(p_joined_workspace_ids) id) then
    raise exception 'Your workspaces changed. Review Delete My Entire Account again';
  end if;
  if p_apply is not true then return; end if;

  -- Bytes in owned workspaces were removed by the Storage API before this RPC.
  -- Clear only the departing user's ownership metadata on remaining shared
  -- files. Their paths/bytes and the joined workspace's data remain untouched.
  -- Storage versions may have deprecated owner, current owner_id, or both.
  if exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='owner') then
    execute 'update storage.objects set owner=null where bucket_id=$1 and owner::text=$2' using 'brightsteps-media', p_user_id::text;
  end if;
  if exists(select 1 from information_schema.columns where table_schema='storage' and table_name='objects' and column_name='owner_id') then
    execute 'update storage.objects set owner_id=null where bucket_id=$1 and owner_id=$2' using 'brightsteps-media', p_user_id::text;
  end if;
  delete from public.workspaces where id=any(v_owned) and created_by=p_user_id;
  -- Detach joined memberships before the Auth cleanup trigger can mistake
  -- leaving a workspace for deleting its last manager's workspace.
  delete from public.workspace_members where user_id=p_user_id and workspace_id=any(v_joined);
end;
$$;
revoke all on function public.prepare_entire_kudos_account_deletion(uuid,uuid[],uuid[],boolean) from public, anon, authenticated;
grant execute on function public.prepare_entire_kudos_account_deletion(uuid,uuid[],uuid[],boolean) to service_role;
