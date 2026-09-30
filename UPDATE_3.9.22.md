# Kudos 3.9.22

## Profile storage summary
- Moved `MY <STORAGE>`, the total balance, and the currency row slightly upward.
- Kept the total balance centered beneath the storage title.
- Reduced the currency icon beneath the balance from 27px to 23px.
- Reduced the currency label from 14px to 12px and tightened its spacing.

## Task-complete animation performance
- Removed the full-card opacity fade that could briefly flash the celebration screen transparent/white.
- The celebration card is now fully opaque from the first rendered frame.
- Reduced the center storage transform from 1.34x to 1.12x to prevent bitmap/currency blur while keeping the storage visually larger than normal.
- Increased the visual-only container shell dimensions instead of relying on heavy image scaling.
- Explicitly disables iOS rasterization / Android hardware-texture caching on the celebration card to avoid stale/blurry scaled frames.
- Smoothed the point-value pill spring: gentler 1.22x overshoot, lower lift, higher damping.
- Currency drops, fireworks, confetti, persistent currency pulse, and tap-to-replay remain native-driver based.
