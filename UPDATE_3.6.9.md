# BrightSteps 3.6.9

- Moved the smaller Edit button into the profile title row for both child and classroom profiles.
- Profile progress heading now reads ✨ TODAY'S PROGRESS ✨.
- Added a parent/teacher Undo Task control that removes the most recently earned task currency in chronological reverse order.
- Approved task rows can be pressed again to Undo Approval; scheduled tasks return to a pending/ready state and their currency is removed.
- Added Supabase/Edge Function support for undoing task completions, including removal of the matching currency-ledger entry.
- Child Mode task submission now uses a cancellable confirmation popup with an X, Cancel, Send, and “Send to your parent? 🎊”.
- Parent Mode can redeem assigned rewards before the required currency is reached, with explicit Yes/Cancel confirmation. Early redemption is tracked against future earnings.
- Piggy Bank belly fill area is slightly larger and uses the pig artwork’s light pink body color in light and dark modes.
- Treasure Chest local artwork is supplied as its own default source so gold trim is present on the first rendered frame.
- BrightSteps Classroom keeps its green logo tile; the red apple gets an additional bright lime leaf accent for visibility.
- Added migration 20260815000100_task_undo_early_rewards.sql and updated task-action/reward-action Edge Functions.
