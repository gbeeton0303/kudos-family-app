-- BrightSteps 3.7.4
-- Allow the Dollar Bill earning currency on child/classroom profiles.

alter table public.child_profiles
  drop constraint if exists child_profiles_currency_type_check;

alter table public.child_profiles
  add constraint child_profiles_currency_type_check
  check (currency_type in ('stars', 'marbles', 'points', 'coins', 'dollars'));
