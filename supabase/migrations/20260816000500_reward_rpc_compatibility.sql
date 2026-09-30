-- Kudos 3.8.2
-- Keep the original six-argument redeem_reward RPC available as a wrapper
-- around the newer seven-argument implementation.

do $$
begin
  if to_regprocedure('public.redeem_reward(text,text,text,text,boolean,timestamptz,boolean)') is null then
    raise exception 'The 7-argument redeem_reward function must exist before applying compatibility wrapper';
  end if;
end
$$;

create or replace function public.redeem_reward(
  p_redemption_id text,
  p_delivery_id text,
  p_reward_id text,
  p_profile_id text,
  p_deliver_to_child boolean,
  p_redeemed_at timestamptz
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.redeem_reward(
    p_redemption_id,
    p_delivery_id,
    p_reward_id,
    p_profile_id,
    p_deliver_to_child,
    p_redeemed_at,
    false
  );
$$;

grant execute on function public.redeem_reward(text,text,text,text,boolean,timestamptz) to authenticated;
