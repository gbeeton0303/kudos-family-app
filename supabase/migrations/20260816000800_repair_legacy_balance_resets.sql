-- Kudos 3.8.5
-- Repair legacy early-redemption histories that were not detected by the first
-- reset backfill. This is intentionally additive/idempotent.

-- A delivery that finishes at zero is a valid reset boundary. This safely
-- includes a normal redemption that happens to use the exact remaining
-- balance: the balance was genuinely zero at that moment either way.
insert into public.profile_balance_resets(
  id, workspace_id, profile_id, source_id, reset_at, created_by
)
select
  'legacy-delivery-reset-' || d.id,
  d.workspace_id,
  d.profile_id,
  d.id,
  d.sent_at,
  null
from public.reward_deliveries d
where
  (coalesce(d.balance_before,0) > 0 and coalesce(d.balance_after,0) = 0)
  or coalesce(d.cost,0) > coalesce(d.balance_before,0)
on conflict do nothing;

-- Several older builds stored only the actual amount charged in
-- reward_redemptions.cost during an early redemption. If that amount is below
-- the reward template's nominal cost, the redemption was early and therefore
-- establishes a zero-balance boundary.
insert into public.profile_balance_resets(
  id, workspace_id, profile_id, source_id, reset_at, created_by
)
select
  'legacy-redemption-reset-' || r.id,
  r.workspace_id,
  r.profile_id,
  r.id,
  r.redeemed_at,
  null
from public.reward_redemptions r
join public.reward_templates t on t.id = r.reward_id
where coalesce(r.cost,0) < coalesce(t.cost,0)
on conflict do nothing;
