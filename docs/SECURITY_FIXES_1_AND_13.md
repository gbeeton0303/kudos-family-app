# Audit fixes 1 and 13

These changes update only the `migrate-local-data` and `reward-action` Edge Functions and their shared helpers. No database migration or new iOS build is needed to activate them. Deploy from this updated project folder so the new handler and shared files are included.

## Changes

- Imports generate deterministic SHA-256 IDs scoped to the destination workspace for profiles, templates, requests, deliveries, and history. All references are remapped together. References outside the submitted import are rejected before writes.
- Existing import IDs are checked for workspace and record ownership before writes. Insert conflicts never update existing records; ownership is checked again after inserting, before dependent writes. Old import markers prevent duplicate imports after this upgrade.
- Reward repair verifies the adult's manager role and checks that the child and any existing reward belong to the workspace. Existing prices/titles are preserved. A concurrent template ID conflict is checked rather than overwritten.
- Notifications require a committed delivery matching the child, manager access to the delivery's workspace, and a child profile in that workspace. Device tokens are filtered to that child and workspace.
- A notification failure after redemption cannot reverse or report failure for the committed redemption.

## Local checks

```powershell
npm test
npm run typecheck
npm run typecheck:security
```

The security tests execute the actual request handlers with a simulated database and push sender. They cover allowed and rejected requests, cross-workspace ID collisions, concurrent insert collisions, retries, legacy import markers, and ownership checks above the API row limit. They do not exercise a deployed Postgres database or deliver real push notifications.

## Deploy to development first

```powershell
Set-Location -LiteralPath 'C:\Users\beeto\OneDrive\Desktop\KudosFamily-v1.0.1'
npx supabase@latest functions deploy migrate-local-data --project-ref qnxncpituyxeeynnanub --use-api
npx supabase@latest functions deploy reward-action --project-ref qnxncpituyxeeynnanub --use-api
```

Explicit project references avoid changing which database the CLI is linked to. Test with development accounts: redeem a reward and confirm the child receives/opens it; import local data into an empty test workspace; confirm repeating the import does not duplicate points; confirm the same local IDs can be imported into a second test workspace without changing the first.

## Production after development checks

```powershell
npx supabase@latest functions deploy migrate-local-data --project-ref vhlonzbasqqbulwoxdxk --use-api
npx supabase@latest functions deploy reward-action --project-ref vhlonzbasqqbulwoxdxk --use-api
```

These functions accept the existing app's request format. Import IDs change only for future imports; previously imported data is not rewritten. This patch does not address the other audit findings, including financial-history import amounts (#6).
