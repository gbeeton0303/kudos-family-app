# Kudos 3.8.5

## Balance repair
- Strengthened legacy early-redemption repair for profiles that still treated a starting balance such as 14 as their effective zero.
- The app now derives reset-to-zero events from both `profile_balance_resets` and historical reward-delivery data.
- Added a second idempotent Supabase backfill that detects legacy resets from:
  - reward deliveries that ended at zero,
  - rewards whose nominal cost exceeded the balance before redemption,
  - old reward-redemption rows whose stored charged amount is below the reward's nominal cost.
- Existing profiles should repair without being deleted/recreated.

## Storage
- Piggy Bank fill area now stops at the right wall of the round belly rather than extending into the snout.
- Replaced the rectangular pink fill background with a rounded belly-shaped pink backing, removing the pink square near the eye.
- The first Piggy Bank currency now begins directly on the belly floor and is positioned so it is visible immediately.
- Treasure Chest currency stage is recentered within the chest body.
- Glass Jar now has a dedicated centered currency stage within the jar.
