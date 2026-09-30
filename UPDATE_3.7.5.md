# BrightSteps 3.7.5

- Dollar bills are larger, overlap more tightly in storage containers, and the white highlight line was removed from the bill artwork.
- Treasure Chest fill area is wider, starts lower, and contains substantially more irregular currency positions.
- Piggy Bank fill area extends farther right toward the nose.
- Early reward redemption now consumes only the child's currently available balance and stops at zero. Future task earnings immediately increase the visible total.
- Reward redemptions now track the actual amount charged per redemption so local/offline/cloud totals remain consistent after early redemption.
- Storage replay no longer scales the card, the card has fixed geometry, and the main app ScrollView has iOS bounce disabled to prevent the profile screen from jumping during/after storage animations.
- Replaced the suggested Brush teeth task with Brush teeth - morning and Brush teeth - night; both are daily.
- Added a Child Code button to the Child Mode profile chooser. Parents can select a child profile, generate a 7-day profile code, share it to another device, or close/cancel the banner.
- Child Mode now has an Edit button. Children can change Accent Color, Accent Pattern, Earning Currency, and Storage Container, while name and profile photo remain parent-managed/read-only.
- Added a secure Supabase RPC so a linked child can update only those permitted profile preferences.
