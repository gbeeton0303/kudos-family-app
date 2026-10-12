-- Forward-only correction. Do not rewrite completed imports or old accounting.
alter table public.reward_redemptions add column if not exists occurred_at timestamptz;
alter table public.migration_imports add column if not exists payload_hash text;

create or replace function public.redeem_reward(
  p_redemption_id text,p_delivery_id text,p_reward_id text,p_profile_id text,
  p_deliver_to_child boolean,p_redeemed_at timestamptz,p_allow_early boolean
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_reward public.reward_templates%rowtype; v_profile public.child_profiles%rowtype;
  v_existing public.reward_redemptions%rowtype; v_before integer; v_after integer;
  v_charge integer; v_accounted_at timestamptz;
begin
  if coalesce(trim(p_redemption_id),'')='' or p_redeemed_at is null or not isfinite(p_redeemed_at)
    or (p_deliver_to_child and coalesce(trim(p_delivery_id),'')='') then
    raise exception 'The reward request is incomplete';
  end if;
  select * into v_reward from public.reward_templates where id=p_reward_id for share;
  if v_reward.id is null then raise exception 'Reward not found'; end if;
  if not public.is_workspace_manager(v_reward.workspace_id) then raise exception 'Not authorized'; end if;
  select * into v_profile from public.child_profiles where id=p_profile_id for no key update;
  if v_profile.id is null or v_profile.workspace_id<>v_reward.workspace_id then
    raise exception 'Reward and profile do not belong to the same workspace';
  end if;
  select * into v_existing from public.reward_redemptions where id=p_redemption_id;
  if v_existing.id is not null then
    if v_existing.workspace_id<>v_reward.workspace_id or v_existing.profile_id<>p_profile_id
      or v_existing.reward_id<>p_reward_id then raise exception 'Redemption identifier already used'; end if;
    return jsonb_build_object('redemption_id',p_redemption_id,'profile_id',p_profile_id,
      'delivery_id',case when p_deliver_to_child then p_delivery_id else null end,
      'balance_after',public.profile_balance(p_profile_id),'already_redeemed',true);
  end if;
  perform 1 from public.reward_assignments where reward_id=p_reward_id and profile_id=p_profile_id
    and workspace_id=v_reward.workspace_id for share;
  if not found then raise exception 'Reward not assigned'; end if;
  if exists(select 1 from public.currency_ledger where id='ledger-'||p_redemption_id)
    or exists(select 1 from public.profile_balance_resets where id='reset-'||p_redemption_id)
    or (p_deliver_to_child and exists(select 1 from public.reward_deliveries where id=p_delivery_id)) then
    raise exception 'Reward request identifier already used';
  end if;
  v_before:=public.profile_balance(p_profile_id);
  if p_allow_early then v_charge:=v_before;
  else
    if v_before<v_reward.cost then raise exception 'Insufficient balance'; end if;
    v_charge:=v_reward.cost;
  end if;
  -- While holding the same lock as all balance writers, append this debit.
  -- Even future-dated credits cannot place it before funds being consumed.
  select greatest(clock_timestamp(),max(at)+interval '1 millisecond') into v_accounted_at from (
    select created_at as at from public.currency_ledger where profile_id=p_profile_id
    union all select reset_at from public.profile_balance_resets where profile_id=p_profile_id
  ) history;
  if not isfinite(v_accounted_at) then raise exception 'Invalid accounting history'; end if;
  insert into public.reward_redemptions(id,workspace_id,reward_id,profile_id,cost,redeemed_by,redeemed_at,occurred_at)
    values(p_redemption_id,v_reward.workspace_id,p_reward_id,p_profile_id,v_charge,auth.uid(),v_accounted_at,p_redeemed_at);
  if v_charge>0 then
    insert into public.currency_ledger(id,workspace_id,profile_id,amount,transaction_type,source_id,description,created_by,created_at)
      values('ledger-'||p_redemption_id,v_reward.workspace_id,p_profile_id,-v_charge,'reward_redemption',
        p_redemption_id,v_reward.title,auth.uid(),v_accounted_at);
  end if;
  if p_allow_early then
    insert into public.profile_balance_resets(id,workspace_id,profile_id,source_id,reset_at,created_by)
      values('reset-'||p_redemption_id,v_reward.workspace_id,p_profile_id,p_redemption_id,v_accounted_at,auth.uid());
  end if;
  v_after:=public.profile_balance(p_profile_id);
  if v_after<>greatest(0,v_before-v_charge) then raise exception 'Reward accounting conflict'; end if;
  if p_deliver_to_child then
    insert into public.reward_deliveries(id,workspace_id,reward_id,profile_id,reward_title,reward_icon_type,
      reward_icon_value,cost,balance_before,balance_after,sent_at)
      values(p_delivery_id,v_reward.workspace_id,p_reward_id,p_profile_id,v_reward.title,v_reward.icon_type,
        v_reward.icon_value,v_reward.cost,v_before,v_after,p_redeemed_at);
  end if;
  return jsonb_build_object('redemption_id',p_redemption_id,'profile_id',p_profile_id,
    'delivery_id',case when p_deliver_to_child then p_delivery_id else null end,
    'balance_before',v_before,'balance_after',v_after,'charged',v_charge,'early',p_allow_early,
    'accounted_at',v_accounted_at,'occurred_at',p_redeemed_at);
end;
$$;
revoke all on function public.redeem_reward(text,text,text,text,boolean,timestamptz,boolean) from public,anon;
grant execute on function public.redeem_reward(text,text,text,text,boolean,timestamptz,boolean) to authenticated;

-- Invoker-only, service-role-only RPC. The Edge function verifies the user;
-- database rechecks manager membership and serializes receipt/commit per workspace.
create or replace function public.commit_local_import(
  p_workspace_id uuid,p_user_id uuid,p_writes jsonb,p_payload_hash text,p_source_version text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_marker public.migration_imports%rowtype; v_write jsonb; v_row jsonb;
  v_table text; v_columns text; v_select text; v_column text; v_reference text;
  v_exists boolean; v_workspace uuid;
begin
  perform 1 from public.workspaces where id=p_workspace_id for update;
  if not found or not exists(select 1 from public.workspace_members where workspace_id=p_workspace_id
    and user_id=p_user_id and role in ('parent','teacher')) then raise exception 'Not authorized'; end if;
  select * into v_marker from public.migration_imports where workspace_id=p_workspace_id and user_id=p_user_id;
  if found then
    if v_marker.payload_hash is not null and v_marker.payload_hash is distinct from p_payload_hash then
      raise exception 'A different import has already completed';
    end if;
    return jsonb_build_object('imported',true,'alreadyImported',true);
  end if;
  if coalesce(p_payload_hash,'')='' or jsonb_typeof(p_writes) is distinct from 'array' then raise exception 'Invalid import plan'; end if;
  for v_write in select value from jsonb_array_elements(p_writes) loop
    v_table:=v_write->>'table';
    if v_table is null or v_table not in ('child_profiles','profile_balance_resets','task_templates',
      'task_assignments','task_completions','currency_ledger','reward_templates','reward_assignments',
      'reward_redemptions','task_completion_requests','reward_deliveries')
      or jsonb_typeof(v_write->'rows') is distinct from 'array' then raise exception 'Invalid import table'; end if;
    for v_row in select value from jsonb_array_elements(v_write->'rows') loop
      if jsonb_typeof(v_row) is distinct from 'object' or (v_row->>'workspace_id')::uuid is distinct from p_workspace_id then
        raise exception 'Import record belongs to another workspace';
      end if;
      -- Validate dependent references as well as table ownership. No overwrite,
      -- ignore-conflict or repair path is allowed for an uncommitted import.
      foreach v_column in array array['profile_id','task_id','reward_id'] loop
        if v_row->>v_column is not null then
          v_reference:=case v_column when 'profile_id' then 'child_profiles' when 'task_id' then 'task_templates' else 'reward_templates' end;
          execute format('select workspace_id from public.%I where id=$1',v_reference) into v_workspace using v_row->>v_column;
          if v_workspace is distinct from p_workspace_id then raise exception 'Import reference belongs to another workspace'; end if;
        end if;
      end loop;
      if v_row ? 'id' then
        execute format('select exists(select 1 from public.%I where id=$1)',v_table) into v_exists using v_row->>'id';
        if v_exists then raise exception 'Import ID belongs to another workspace or record; incomplete legacy import requires review'; end if;
      end if;
      v_columns:=''; v_select:='';
      for v_column in select jsonb_object_keys(v_row) loop
        if v_column in ('linked_user_id','linked_at') or not exists(
          select 1 from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid
          join pg_catalog.pg_namespace n on n.oid=c.relnamespace
          where n.nspname='public' and c.relname=v_table and a.attname=v_column and a.attnum>0 and not a.attisdropped
        ) then raise exception 'Invalid import column'; end if;
        v_columns:=v_columns||case when v_columns='' then '' else ',' end||format('%I',v_column);
        v_select:=v_select||case when v_select='' then '' else ',' end||format('r.%I',v_column);
      end loop;
      execute format('insert into public.%I(%s) select %s from jsonb_populate_record(null::public.%I,$1) r',
        v_table,v_columns,v_select,v_table) using v_row;
    end loop;
  end loop;
  insert into public.migration_imports(workspace_id,user_id,source_version,payload_hash)
    values(p_workspace_id,p_user_id,coalesce(p_source_version,'local'),p_payload_hash);
  return jsonb_build_object('imported',true);
end;
$$;
revoke all on function public.commit_local_import(uuid,uuid,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.commit_local_import(uuid,uuid,jsonb,text,text) to service_role;
