# Kudos Family 3.9.58

- Email-confirmation links now finish account confirmation without opening the password-reset screen.
- Only links created by **Forgot password?** open **Create a new password**.
- Adult invitation codes are retained in secure account metadata through email confirmation, accepted automatically on first sign-in, and cleared after membership is confirmed.
- Adult invite acceptance is idempotent, so an app restart or repeated confirmation handoff cannot strand an already-added adult on onboarding.
- Invited adults waiting for acceptance see a dedicated invitation status screen and can no longer fall through to family/classroom creation.
- Child-account failures now explain when Anonymous Sign-Ins must be enabled, and local Supabase configuration enables that required authentication mode.

## Production setup

1. In the production Supabase dashboard, open **Authentication → Sign In / Providers** and enable **Allow anonymous sign-ins**.
2. Deploy the updated `adult-invite` Edge Function.
3. Ensure `kudosfamily://**` is present under the production Auth redirect URLs. This covers the separate signup-confirmation and password-recovery callback flows.

No new database migration is required for the 3.9.58 authentication changes. Keep migration `20260830000100_allow_manager_child_mode_task_requests.sql` from 3.9.57 applied in production.
