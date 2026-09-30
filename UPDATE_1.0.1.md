# Kudos Family 1.0.1

## Changes

- The task icon library now opens from a compact **Choose a task icon** button on personal-task and Task Library create/edit screens. This keeps value, frequency, scheduling, and description fields close to the top of the form.
- Cloud-loaded task completions retain the exact amount originally awarded instead of being recalculated from a task's current value.
- Unassigning or deleting a previously redeemed reward no longer makes its historical points spent disappear from the device balance.
- Deleted reward history is reconstructed from the authoritative currency ledger without restoring the deleted reward to the visible library.
- If another adult or an offline queue changes the cloud balance between confirmation and redemption, Kudos automatically uses the existing early-redemption behavior instead of creating a failed sync change.
- One adult login can now keep a separate family workspace and classroom workspace. The Teacher Mode switch opens the appropriate workspace instead of only changing labels and colors.
- Account settings show separate Family Name and Classroom Name controls, including the option to create the missing workspace.
- Profiles, tasks, rewards, balances, and history remain isolated between the family and classroom.
- A lifetime purchase made by the workspace creator unlocks both family and classroom workspaces owned by that same Kudos adult account. Invited adults and linked child/student accounts inherit their workspace access.
- Deleting one workspace leaves the adult signed in to their other workspace when one remains.
- Apple Family Sharing is supported for the lifetime non-consumable. Eligible Apple family members can restore their own Apple-issued shared transaction to a separate Kudos adult account.
- Direct and family-shared purchases are distinguished on the backend. The workspace creator's Apple entitlement is rechecked at launch and whenever the app returns to the foreground; temporary StoreKit failures do not lock the workspace.
- If Apple reports that the active Media & Purchases account no longer owns or receives the lifetime purchase, access pauses until an entitled Apple Account restores it again. Invited adults and child/student accounts remain covered by their workspace creator.

## Deployment

Apply `supabase/migrations/20260927183149_dual_family_classroom_workspaces.sql` and `supabase/migrations/20260928001705_apple_family_sharing_entitlements.sql`, then deploy the updated `entitlement-action` Edge Function. Turn on Family Sharing for the lifetime non-consumable in App Store Connect. Build the app with the correct EAS environment variables for Development or Production.

## Validation

- TypeScript: passed (`tsc --noEmit`)
- Automated tests: 59 passed
