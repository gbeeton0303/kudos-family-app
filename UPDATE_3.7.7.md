# BrightSteps 3.7.7

- Fixed task completion period locking so finite-frequency tasks cannot be completed repeatedly during the same active period.
- Daily tasks lock after one completion for the local calendar day and display Approved.
- Weekly tasks now lock after one completion for the entire calendar week instead of once per selected weekday.
- Added Monthly frequency. Monthly tasks can be completed once per calendar month and remain Approved for that month.
- Custom tasks can be completed only once for each specifically scheduled calendar date.
- Device-generated period keys are sent to Supabase so local dates and cloud dates no longer disagree because of UTC timezone boundaries.
- Cloud direct-completion and child-request RPCs now enforce the same period key used by the app.
- Duplicate cloud task taps return the authoritative existing completion instead of creating points or a failed sync operation.
- Pending child requests are now evaluated by their active task period rather than blocking the task forever.
- Cloud task completion now performs a pre-check before enqueueing, preventing redundant mutations from stale/repeated taps.
- Existing task completion timestamps continue to mark the appropriate current period Approved in the UI.
