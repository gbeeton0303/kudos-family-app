# Kudos 3.9.2

## Home progress panels
- Rewards Progress and Daily Task Progress use a slightly deeper mint/teal background in light mode.
- The small explanatory copy now uses the main text color for stronger contrast.
- Dark mode retains the layered dark-mode surfaces introduced in 3.9.1.

## Parent / Child Mode
- The selected Parent Mode button now uses `theme.primaryStrong`, matching the teal/green used for the Kudos Family title.
- Replaced the Parent Mode emoji with a true white outline-style person drawn in React Native, so its color is controllable.
- Replaced the Child Mode emoji with the supplied transparent gold child silhouette asset; no background was added.
- The child silhouette remains visible on both selected and unselected Child Mode states.

## Parent Quick Start
- Fixed the visible Tasks/Rewards icon swap lag.
- Both local category images are now mounted simultaneously and the tutorial changes their opacity instead of changing the native Image source.
- This removes the frame where the previous Tasks or Rewards bitmap could remain visible after pressing Next or Back.
