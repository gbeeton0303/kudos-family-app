# BrightSteps 2.9.5

- Fixed `[object Object]` cloud error messages.
- Parses structured Supabase/Edge Function errors recursively.
- Reads JSON response bodies from failed Edge Function calls.
- Sanitizes legacy failed-sync records that previously stored `[object Object]`.
- Keeps the offline banner readable even when a provider returns a non-string error.
