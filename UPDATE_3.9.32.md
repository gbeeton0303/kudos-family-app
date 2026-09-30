# Kudos 3.9.32

- Changed piggy-bank native mount order so its complete front/detail frame is created before the bitmap-heavy currency pile while remaining visually above the currency.
- Added eager preloading and immediate bundled fallbacks for coin, marble, and dollar artwork as well as the layered storage artwork.
- This specifically removes the frame delay seen when many coin or marble image elements mount during profile and celebration rendering.
- Removed `Approved for this period` and `Ready to complete` from Assigned Tasks.
- Moved the parent-only task Edit button to the left column directly beneath each task icon.
