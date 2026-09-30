-- Replace the legacy largeStar storage option with treasureChest.
update public.child_profiles set storage_type = 'treasureChest' where storage_type = 'largeStar';

alter table public.child_profiles drop constraint if exists child_profiles_storage_type_check;
alter table public.child_profiles add constraint child_profiles_storage_type_check
  check (storage_type in ('glassJar', 'piggyBank', 'treasureChest'));
