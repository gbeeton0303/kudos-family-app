# Kudos 3.8.9 — Screen stability + tutorial readability

## Screen movement / visual glitches

This build addresses the major sources of unsolicited vertical movement rather
than trying to correct the scroll position after it moves.

1. Removed the post-modal `scrollTo()` restoration logic. That code could
   visibly move the background after an animation/editor closed.
2. The root ScrollView is now frozen while any profile editor, celebration,
   reward modal, library, notification sheet, appearance sheet, sync-review
   sheet, or tutorial is active.
3. Normal transient cloud syncing no longer inserts/removes the Cloud Sync
   banner above the current screen. The banner remains available for actionable
   offline/error/failed-sync states. This prevents the entire profile from being
   pushed down and then pulled up after every save/task/reward operation.
4. Edit Profile now uses an opaque full-screen modal instead of iOS `pageSheet`.
   `pageSheet` intentionally scales/translates the presenting screen in the
   background as part of the native iOS animation, which looked like a glitch.
5. Main/profile-editor ScrollViews have bounce/overscroll and automatic inset
   adjustment disabled where appropriate.

## Parent Quick Start

- Removed swipe navigation completely. Pages now change only with Back and Next.
- Kept the X close button on every page.
- Reduced the Welcome laurel image from 112px to 94px.
- Doubled description text from 14px to 28px.
- Doubled tip/description text from 13px to 26px.
- Description text now uses the higher-contrast main text color rather than the
  lighter muted gray.
