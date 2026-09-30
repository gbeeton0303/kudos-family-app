# Kudos 3.9.16

## Weekly suggested-task cloud failure fix
Root cause:
- Suggested weekly tasks such as `Clean bedroom` did not provide `scheduleDays`.
- The app treated an empty weekly schedule as the task's creation weekday.
- Supabase treated an empty `schedule_days` array as unscheduled and rejected completion with `Task is not scheduled for this date`.
- This could affect a specific suggested weekly task while other custom weekly tasks worked normally.

Fixes:
- New weekly tasks now always save an explicit weekday when no scheduleDays are supplied.
- Suggested weekly tasks added individually or through Add All now include an explicit weekday before creation.
- Added a Supabase migration that repairs existing weekly tasks with empty schedule_days using their creation weekday.
- Updated `task_is_scheduled_local` to use the same creation-weekday fallback for any legacy empty weekly schedule.
