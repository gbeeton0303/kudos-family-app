# Kudos 3.9.14

## Reward redemption correctness
- Normal redemption now subtracts exactly the reward cost and preserves remaining points.
- Only an explicit Redeem Early action can create a reset-to-zero balance event.
- Removed runtime inference that could reinterpret a normal reward delivery as an early reset.
- Added a Supabase migration that removes erroneous legacy delivery-reset rows where reward cost was less than the available balance.
- Early redemption explicitly consumes the full current balance and ends at zero.

## Treasure Chest fill
- Widened the chest currency stage from 148px to 160px and recentered it from left 30px to 24px.
- Removed the previous non-dollar right-shift compensation.
- Currency now reaches evenly toward both left and right gold vertical rails.

## Reward goal badge
- Reward name/cost is now displayed in its own overlay badge on the storage card.
- Badge background uses the child's selected accent color.
- Added a soft accent-colored shadow/glow behind the badge.
- Reward name automatically uses 17/15/13/11px sizing based on name length.
- Cost automatically scales for larger values.
- Both lines use adjustsFontSizeToFit to stay evenly contained inside the badge.
