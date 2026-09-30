# Kudos 3.9.24

- Fixed blurry currency in the enlarged task-complete storage display.
- Removed transform-based enlargement from the visual-only storage wrapper.
- Piggy Bank, Treasure Chest, and Glass Jar now render with dedicated larger native dimensions during task celebrations.
- Currency item coordinates and pixel sizes are rendered natively at the larger size rather than magnifying a smaller currency pile.
- Removed `resizeMethod="resize"` from currency and storage bitmap artwork so React Native does not pre-downsample images before they are animated.
- Disabled celebration-card rasterization/hardware texture caching to prevent soft cached frames.
- The storage container remains clearly larger than on the profile while currency stays crisp during drops, pulsing, and resting.
