# Kudos 3.8.3 — Reward balance clamp

Supabase was still rejecting some reward redemptions with `Insufficient balance`
when the app's locally reconstructed balance was higher than the authoritative
cloud ledger balance.

The authoritative `redeem_reward` RPC now follows the intended parent/teacher
behavior:

- A manager may redeem an assigned reward regardless of current balance.
- The server charges only the currency actually available at redemption time.
- The profile balance can never go negative.
- A reward costing more than the current cloud balance is automatically treated
  as an early redemption, even if the device thought the balance was sufficient.
- Future task earnings therefore begin accruing immediately from zero.
- Redemption IDs are idempotent so retries do not double-charge.
- Both 6-argument and 7-argument RPC signatures use the same clamped behavior.

This removes `Insufficient balance` as a valid failure mode for an authorized
parent/teacher reward redemption.
