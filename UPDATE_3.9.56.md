# Kudos Family 3.9.56

- Replaced the empty Reward Goals present with the standard gold trophy-and-ribbons reward icon.
- Simplified first-account onboarding to a focused Welcome screen for creating a family or classroom.
- Removed the duplicate adult and child joining forms from post-confirmation onboarding; those flows remain on Create Account where they belong.
- Made child task submission use the secure database operation directly, so a missing notification Edge Function cannot prevent a request from reaching the parent.
- Made task-completion, child-request, undo, and approval database writes independent from notification delivery.
- Added optimistic offline task completion with a persistent per-workspace queue, immediate local feedback, automatic foreground retry, and periodic reconnection retry.
- Cached signed-in workspace access so the app can cold-launch into its cached family data without an internet connection.
- Improved Edge Function error parsing so adult invitation failures display the actionable production configuration error rather than only “non-2xx status code.”
- Hardened adult invitation email creation so missing Resend secrets or delivery failures do not leave unusable invitation records behind.
- Added regression checks for direct task RPCs and offline queue/reconnection behavior.

## Production deployment required

Deploy the updated `task-action` and `adult-invite` Edge Functions to production. The production `adult-invite` function also requires these Edge Function secrets:

- `RESEND_API_KEY`
- `KUDOS_INVITE_FROM` (for example, `Kudos Family <welcome@mykudosfamily.com>`)

The Resend API key configured under Supabase Authentication SMTP is separate and is not automatically available to Edge Functions.
