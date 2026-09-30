# Kudos 3.8.8 — Tutorial navigation

- Added a persistent X close button in the upper-right corner of every Parent Quick Start tutorial page.
- The X exits the tutorial immediately from any step.
- Reworked swipe navigation to capture only deliberate horizontal gestures, preventing conflict with vertical scrolling.
- Reduced the required swipe distance and also considers swipe velocity, making quick swipes more responsive.
- Swiping left advances; swiping right goes back.
- Disabled tutorial ScrollView bounce/overscroll and enabled directional locking for smoother gesture handling.
- Updated the tutorial hint to “Swipe left/right or use the buttons below.”
