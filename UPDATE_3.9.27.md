# Kudos 3.9.27

## Account deletion
- Settings > Account now includes a destructive Delete Account & Data section.
- Parent/teacher managers can permanently delete the family/classroom workspace, all workspace data, the current manager account, and linked child auth accounts.
- Child accounts can permanently delete their own linked profile data and their own auth account.
- Two destructive confirmations are required before deletion.
- Added the `delete-account` Supabase Edge Function. Deploy this function with the rest of the Supabase functions before release.

## Flow / animation optimization
- Task-complete celebrations are presented after current interactions/state mutations settle rather than in the same render frame.
- Task celebration card now fades in only after the modal surface has had a brief composition window.
- Reward celebration uses the same brief composition delay.
- Storage-container bitmap fading is disabled to avoid Android image flashes.
- Celebration shells are rasterized/hardware-composited to reduce redraw churn during currency, sparkle, and firework animation.
