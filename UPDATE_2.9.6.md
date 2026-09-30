# BrightSteps 2.9.6

- Adds Settings → Reset Cloud Sync with a destructive confirmation.
- Reset discards only local pending/failed mutations and cloud cache, preserves login/session and Supabase records, then downloads a fresh workspace snapshot.
- Clears stale sync errors/status after a successful reload.
- Uses the structured cloud error formatter in refresh() so error objects do not become stale generic strings.
