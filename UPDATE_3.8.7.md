# Kudos 3.8.7

## Storage
- Recentered Treasure Chest piles for Stars, Marbles, Points, and Coins; Dollars retain their already-centered distribution.
- The currency stage itself remains centered in the chest.
- Storage replay no longer applies a pressed-state redraw to the storage card.

## Task celebration
- Added a fireworks burst around the storage container when a task-completion celebration opens.
- Firework particles are absolute/native-driver animations and do not affect modal layout.

## Smoothness / vertical jump debugging
- The root app now captures the exact ScrollView offset before profile editors, reward/task celebrations, libraries, notifications, settings overlays, and tutorials open.
- After an overlay closes, the same offset is restored after layout settles using two animation frames.
- Disabled iOS/Android overscroll/bounce paths and clipped-subview recycling on the main ScrollView.
- Reward redemption animation no longer translates the entire reward card vertically; it scales/fades in place.
- Reward modal scrolling has bounce/overscroll disabled.
- Task celebration storage area has a fixed height so fireworks/currency animations cannot change modal height.

## Parent Quick Start
- Replaced the Welcome plant with the supplied gold laurel artwork.
- Updated only the first Welcome paragraph to:
  "Kudos is designed to help parents and classrooms start each day with positivity, structure, and clear expectations that help children thrive. Through positive reinforcement, children can build confidence, essential life skills, learn responsibility, and create healthy habits that last."
