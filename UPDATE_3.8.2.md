# Kudos 3.8.2 — Direct reward redemption

- Core reward redemption no longer depends on the `reward-action` Edge Function.
- The app now calls the authenticated `redeem_reward` Postgres RPC directly.
- Missing legacy reward assignments are repaired through the normal manager-authorized Supabase tables before redemption.
- A missing reward template is inserted only when it is actually absent; existing cloud reward data is never overwritten during redemption.
- Push notification is now a best-effort `notify` Edge Function call after the database redemption succeeds. Push failure cannot create a Failed Sync Change.
- Added a six-argument compatibility wrapper around the seven-argument `redeem_reward` RPC so older deployed reward functions remain compatible.
- Normal redemptions also fall back to the legacy six-argument RPC if the local database has not yet received the allowEarly signature.
