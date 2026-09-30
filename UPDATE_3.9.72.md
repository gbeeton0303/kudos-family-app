# Kudos Family 3.9.72

## What changed

- Adults and teachers can tap an already approved daily task and confirm a second award for the same assigned period.
- Child accounts cannot use the repeat-award path, and ordinary daily-task completion remains limited to once per period.
- Repeat awards are stored as separate, auditable completion and ledger entries and remain safe to retry after offline use.
- The native launch screen now fills the display with dark teal and keeps the Kudos logo centered instead of showing a small icon on white.

## Required Supabase update

Apply `supabase/migrations/20260908000100_manager_repeat_daily_task_completions.sql` to both development and production before testing repeat awards:

```powershell
npx supabase@latest link --project-ref YOUR_PROJECT_REF
npx supabase@latest db push
```

No Edge Function deployment is required for this release.

## iOS note

The native splash screen is compiled into the app. Create and install a new development or TestFlight build to see the updated full-screen launch artwork.
