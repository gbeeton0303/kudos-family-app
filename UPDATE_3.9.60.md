# Kudos Family 3.9.60

## Account deletion reliability

- Removes restrictive Auth foreign keys that caused Supabase's "Database error deleting user" message.
- Deletes the last manager's workspace when an Auth user is removed directly from the Supabase dashboard.
- Cleans up empty workspaces accidentally created by older anonymous-child onboarding builds.
- Deletes workspace media before Auth users so Storage ownership cannot block the in-app deletion flow.
- Deletes linked child and adult Auth accounts when the deleted family was their only workspace.
- Retains an adult login when it still belongs to another workspace.
- Uses explicit hard deletion and surfaces the detailed Edge Function error in the app.

## Production deployment required

Apply migration `20260901000200_auth_user_deletion_integrity.sql` and deploy the updated `delete-account` Edge Function to the production Supabase project.
