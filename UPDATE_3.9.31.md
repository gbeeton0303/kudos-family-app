# Kudos 3.9.31

- Fixed the piggy bank briefly rendering without its full detail layer on profile load and in the task-complete popup.
- Added eager cache warming for layered piggy-bank and treasure-chest artwork at app startup.
- Added immediate bundled fallback images to both piggy-bank layers so React Native never displays only the partially decoded base.
- Retained zero-duration bitmap transitions, native-resolution currency rendering, and the existing storage fill and celebration animations.
