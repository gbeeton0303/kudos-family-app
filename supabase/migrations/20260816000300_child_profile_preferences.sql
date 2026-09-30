-- BrightSteps 3.7.5
-- A linked child may edit only appearance/currency/storage preferences, never name or avatar.

create or replace function public.update_child_profile_preferences(
  p_profile_id text,
  p_color_key text,
  p_pattern text,
  p_currency_type text,
  p_storage_type text
)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_profile public.child_profiles%rowtype;
begin
  select * into v_profile from public.child_profiles where id = p_profile_id for update;
  if v_profile.id is null then raise exception 'Profile not found'; end if;
  if v_profile.linked_user_id <> (select auth.uid()) then raise exception 'Not authorized for this profile'; end if;
  if p_pattern not in ('solid','striped','polka') then raise exception 'Invalid pattern'; end if;
  if p_currency_type not in ('stars','marbles','points','coins','dollars') then raise exception 'Invalid currency'; end if;
  if p_storage_type not in ('glassJar','piggyBank','treasureChest') then raise exception 'Invalid storage type'; end if;

  update public.child_profiles
  set color_key = p_color_key,
      pattern = p_pattern,
      currency_type = p_currency_type,
      storage_type = p_storage_type,
      updated_at = now()
  where id = p_profile_id;

  return jsonb_build_object('profile_id', p_profile_id, 'updated', true);
end;
$$;

grant execute on function public.update_child_profile_preferences(text,text,text,text,text) to authenticated;
