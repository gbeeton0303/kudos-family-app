# Backend balance and access fixes

These changes are saved in the active KudosFamily-v1.0.1 project. They do not require a new iOS build, but they are not active until the migration and Edge Functions are deployed. Test development first; production deployment affects current users when they next synchronize or check access.

## What changes

- Audit 2: reward redemption locks the child's balance before checking or spending it. Ledger and reset changes use the same per-profile lock. Duplicate redemption IDs cannot spend again, and mismatched profile or delivery IDs are rejected.
- Audit 5: the server follows the app's chronological, non-negative balance rules and includes early-redemption reset boundaries. Undoing old earnings does not create debt against later earnings. Historical ledger amounts are not rewritten.
- Audit 9: child accounts cannot recreate a removed task assignment using previous completion history. Archived tasks cannot be submitted. Managers can still repair an active cached assignment in Child Mode. The legacy request entry point receives the same checks.
- Audit 10: deleting a reward template preserves its already-sent delivery, title, icon and status. The spending ledger remains. Redemption-row deletion stays compatible with the released app's recovery of orphaned spending history.
- Audit 11: an invited adult cannot remove or demote the creator or purchasing owner, or rewrite creator attribution to bypass that protection. Normal invited-adult removal, name changes, workspace deletion and Auth-account deletion remain available.
- Audit 12: an empty StoreKit result cannot revoke a direct lifetime purchase. The backend looks up its stored transaction with Apple and revokes only a matching, verified refund/revocation. Lookup outages or mismatched responses preserve access. Missing Family Sharing access continues to expire through a separate shared-only path.

New migration: `20261009153321_backend_reward_and_access_integrity.sql`.

Updated Edge Functions for this batch: `adult-invite` and `entitlement-action`. Deploy the migration before these functions. Existing secrets do not need to change.

The preceding security fixes also changed `migrate-local-data` and `reward-action`. The commands below include those functions so both batches can be deployed together.

## Development deployment

Open the active project folder in VS Code. Confirm the terminal is at the folder containing `package.json`.

Run these checks:

```powershell
npm install
npm test
npm run typecheck
npm run typecheck:security
```

Link development and inspect the migration plan:

```powershell
npx supabase@latest link --project-ref qnxncpituyxeeynnanub
npx supabase@latest migration list
npx supabase@latest db push --dry-run
```

Confirm the target is development. On a fully synchronized development database, the only new migration should be `20261009153321_backend_reward_and_access_integrity.sql`. If other migrations appear, review them before proceeding. Never repair migration history just to skip an unfamiliar migration.

Apply the reviewed migration, then deploy the four functions:

```powershell
npx supabase@latest db push
npx supabase@latest functions deploy adult-invite --project-ref qnxncpituyxeeynnanub --use-api
npx supabase@latest functions deploy entitlement-action --project-ref qnxncpituyxeeynnanub --use-api
npx supabase@latest functions deploy migrate-local-data --project-ref qnxncpituyxeeynnanub --use-api
npx supabase@latest functions deploy reward-action --project-ref qnxncpituyxeeynnanub --use-api
```

If the latest CLI cannot create migrations locally, the migration in this project has already been created using CLI 2.75.0. Do not generate a second copy or rename its timestamp.

## Development testing

Use devices connected to development Supabase, not production. No new development binary is needed for these backend changes.

1. Give a test profile 28 coins. Redeem a 25-coin reward normally. Confirm both adults see 3 coins, including after restarting and refreshing. Retry the same completed request and confirm there is no second debit.
2. With two adult logins on two devices, try redeeming two 25-coin rewards nearly simultaneously from a 28-coin balance. Confirm no two normal redemptions spend the same available coins. The current app can silently retry an insufficient normal redemption as an early redemption; that separate app-side behavior is not fixed by this migration. If it occurs, inspect the request's `allowEarly` value and the charged amount.
3. Delete the redeemed library reward before the child opens it. Confirm the balance remains 3 and the child can still open the delivered reward.
4. Test an explicit early redemption, then award new earnings. Confirm the earlier balance does not return and the new earnings count correctly. Test undo and different profiles too.
5. Submit a currently assigned task from a linked child login. Remove that assignment as an adult and confirm the child cannot submit it again from a stale screen. Archive a task and confirm neither child nor manager can submit it.
6. Try removing the creator from an invited adult login. Confirm it is refused. Confirm another invited adult can be removed and the family name can still be changed.
7. With disposable development accounts, test account deletion with another adult remaining, deletion of a sole adult's account, and deletion of the entire workspace.
8. In Apple Sandbox, test direct lifetime access, Restore Purchases, both owned workspaces, invited adults and child access. Confirm an Apple lookup outage does not remove a direct purchase. Separately test missing Family Sharing access and an Apple-confirmed revoked transaction; a different transaction must not be affected.

## Production rollout after development passes

Ensure a recent production database backup is available. Review development results and check the Supabase logs before deploying. This migration does not bulk-rewrite history or immediately revoke existing access, but the new balance calculation can change a server-reported balance when it previously disagreed with the app's reset or undo rules.

```powershell
npx supabase@latest link --project-ref vhlonzbasqqbulwoxdxk
npx supabase@latest migration list
npx supabase@latest db push --dry-run
```

Review the exact migration list and verify the production project reference. Only then apply and deploy:

```powershell
npx supabase@latest db push
npx supabase@latest functions deploy adult-invite --project-ref vhlonzbasqqbulwoxdxk --use-api
npx supabase@latest functions deploy entitlement-action --project-ref vhlonzbasqqbulwoxdxk --use-api
npx supabase@latest functions deploy migrate-local-data --project-ref vhlonzbasqqbulwoxdxk --use-api
npx supabase@latest functions deploy reward-action --project-ref vhlonzbasqqbulwoxdxk --use-api
```

Retest with a dedicated production test family. Monitor failed redemptions, task requests, account deletion and entitlement checks. Do not roll back by deleting migration history; use a reviewed forward corrective migration if an issue appears.

## Verification and remaining work

All 121 automated tests and both type checks passed locally. The new tests execute PostgreSQL 17.5 through PGlite, applying every application migration; Supabase Storage, Realtime and pgcrypto services are not simulated. Edge helpers are tested with injected responses. PGlite uses one database connection, so these tests verify locking definitions and transaction behavior, not a live two-connection race or Apple's real server responses. The two-device and Sandbox checks above remain required before production.

Audit 3 needs an app change to ask for explicit confirmation instead of silently retrying as early redemption. Audit 4 needs app-side pagination to load histories beyond API row limits. Audits 7 and 8 need app changes for reliable queued mutations and user-isolated caches. Audit 6's complete local-import history/snapshot review is also still pending. These are not resolved by this backend batch.
