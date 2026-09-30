# Kudos 3.8.1 — Cloud queue recovery

- Fixed the sync queue so one failed reward/RPC operation cannot block every later profile, currency, storage, task, or reward change.
- Genuine network/offline failures still pause and retry; application/RPC/Edge Function failures are moved to Failed Sync Changes and the queue continues.
- Removed the v3.8.0 client-side direct reward self-heal writes.
- Reward repair now happens inside the authenticated `reward-action` Edge Function after verifying the caller is a parent/teacher for that workspace.
- The Edge Function can repair a stale reward template/assignment and retry the atomic redemption once.
- Cloud errors now identify the mutation type (for example `redeem_reward:` or `update_profile:`) instead of only showing `Cloud request failed`.
- Existing stuck v3.8.0 mutations will be moved out of the pending queue automatically when v3.8.1 flushes, allowing later changes to sync.
