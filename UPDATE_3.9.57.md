# Kudos Family 3.9.57

- Fixed task submission from Child Mode when Child Mode is opened by an authorized parent or teacher on the main family device.
- Kept dedicated child-account submissions restricted to the single child profile linked to that account.
- Added an explicit same-workspace check so a task request can never cross between families or classrooms.
- Added a regression contract covering both valid Child Mode authorization paths.

## Production deployment

Apply migration `20260830000100_allow_manager_child_mode_task_requests.sql` to the production Supabase project. No Edge Function redeployment is required for this fix.

After the migration is applied, open **Settings → Kudos Cloud → Failed Sync Changes** and select **Retry All** so any request rejected by the old database rule is safely retried.
