-- A permanent child login must stay a child even after anonymous conversion,
-- metadata edits, removal of memberships, or use of an older app build.
create or replace function public.is_kudos_child_identity(p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users u where u.id=p_user_id
    and (u.is_anonymous is true or u.raw_app_meta_data->>'account_type'='child'));
$$;
revoke all on function public.is_kudos_child_identity(uuid) from public, anon, authenticated;
grant execute on function public.is_kudos_child_identity(uuid) to service_role;

create or replace function public.preserve_kudos_child_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if lower(coalesce(new.email,'')) like '%@child-login.invalid'
    and coalesce(new.raw_app_meta_data->>'account_type','')<>'child'
    and (tg_op='INSERT' or coalesce(old.raw_app_meta_data->>'account_type','')<>'child') then
    raise exception 'This internal login address is reserved for linked child accounts';
  end if;
  if tg_op='INSERT' then return new; end if;
  if old.raw_app_meta_data->>'account_type'='child' then
    new.raw_app_meta_data := coalesce(new.raw_app_meta_data,'{}'::jsonb) || '{"account_type":"child"}'::jsonb;
    -- Preserve legacy client routing as well. This is NOT used as authority.
    new.raw_user_meta_data := coalesce(new.raw_user_meta_data,'{}'::jsonb) || '{"account_type":"child"}'::jsonb;
  end if;
  return new;
end;
$$;
revoke all on function public.preserve_kudos_child_identity() from public, anon, authenticated;
create trigger preserve_kudos_child_identity before insert or update on auth.users
for each row execute function public.preserve_kudos_child_identity();

create or replace function public.guard_kudos_child_administration()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name='workspace_members' then
    if new.role in ('parent','teacher') and public.is_kudos_child_identity(new.user_id) then
      raise exception 'Child accounts cannot have adult access';
    end if;
  elsif new.created_by is not null and public.is_kudos_child_identity(new.created_by) then
    raise exception 'Child accounts cannot create a family or classroom';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_kudos_child_administration() from public, anon, authenticated;
create trigger guard_child_manager_memberships before insert or update on public.workspace_members
for each row execute function public.guard_kudos_child_administration();
create trigger guard_child_workspace_creation before insert or update on public.workspaces
for each row execute function public.guard_kudos_child_administration();

-- Called only by a verified Edge Function. Mark BEFORE Auth converts the
-- anonymous identity; otherwise an old create_workspace RPC could be used.
create or replace function public.prepare_child_login(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_profile text;
begin
  if not public.is_kudos_child_identity(p_user_id) then raise exception 'Only a linked child can set up a child login'; end if;
  select id into v_profile from public.child_profiles where linked_user_id=p_user_id for update;
  if v_profile is null or (select count(*) from public.child_profiles where linked_user_id=p_user_id)<>1
    or (select count(*) from public.workspace_members where user_id=p_user_id)<>1
    or not exists(select 1 from public.workspace_members m join public.child_profiles p on p.workspace_id=m.workspace_id
      where p.id=v_profile and m.user_id=p_user_id and m.role='child') then
    raise exception 'This child login is no longer linked. Ask your parent for a replacement code';
  end if;
  update auth.users set raw_app_meta_data=coalesce(raw_app_meta_data,'{}'::jsonb)||'{"account_type":"child"}'::jsonb,
    raw_user_meta_data=coalesce(raw_user_meta_data,'{}'::jsonb)||'{"account_type":"child"}'::jsonb where id=p_user_id;
end;
$$;
revoke all on function public.prepare_child_login(uuid) from public, anon, authenticated;
grant execute on function public.prepare_child_login(uuid) to service_role;

-- Retain older releases' acceptance versions while recording the updated policy.
create or replace function public.record_new_user_legal_acceptance()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_terms text := new.raw_user_meta_data->>'legal_terms_version';
  v_privacy text := new.raw_user_meta_data->>'legal_privacy_version';
begin
  if ((v_terms='2026-08-27' and v_privacy='2026-08-27')
    or (v_terms='2026-09-06' and v_privacy in ('2026-09-06','2026-10-10')))
    and coalesce(new.raw_user_meta_data->>'account_type','')='adult'
    and new.is_anonymous is not true and coalesce(new.raw_app_meta_data->>'account_type','')<>'child' then
    insert into public.legal_acceptances(user_id,terms_version,privacy_version,client_accepted_at,source)
      values(new.id,v_terms,v_privacy,new.raw_user_meta_data->>'legal_accepted_at','mobile_app')
      on conflict(user_id,terms_version,privacy_version) do nothing;
  end if;
  return new;
end;
$$;
revoke all on function public.record_new_user_legal_acceptance() from public, anon, authenticated;

-- Replace old editable-metadata guards with current server-owned identity.
create or replace function public.create_workspace(p_name text, p_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_role text;
  v_user_id uuid := (select auth.uid());
  v_normalized_name text := trim(coalesce(p_name, ''));
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if public.is_kudos_child_identity(v_user_id) then
    raise exception 'Child accounts cannot create a family or classroom';
  end if;
  if p_type not in ('family', 'classroom') then raise exception 'Invalid workspace type'; end if;
  if length(v_normalized_name) < 2 or length(v_normalized_name) > 80 then
    raise exception 'Enter a name between 2 and 80 characters.';
  end if;

  -- Serialize creation per adult/type so rapid duplicate taps cannot create
  -- two family or two classroom workspaces for the same owner.
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text || ':' || p_type, 0));

  select id into v_id
  from public.workspaces
  where created_by = v_user_id and type = p_type
  order by created_at asc
  limit 1;

  if v_id is not null then
    v_role := case when p_type = 'classroom' then 'teacher' else 'parent' end;
    insert into public.workspace_members(workspace_id, user_id, role)
    values (v_id, v_user_id, v_role)
    on conflict (workspace_id, user_id) do update set role = excluded.role;
    return v_id;
  end if;

  v_role := case when p_type = 'classroom' then 'teacher' else 'parent' end;
  insert into public.workspaces(name, type, created_by)
  values (v_normalized_name, p_type, v_user_id)
  returning id into v_id;

  insert into public.workspace_members(workspace_id, user_id, role)
  values (v_id, v_user_id, v_role);
  return v_id;
end;
$$;


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
  if public.is_kudos_child_identity(p_user_id)
    or not exists(select 1 from auth.users where id=p_user_id and is_anonymous is not true)
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
