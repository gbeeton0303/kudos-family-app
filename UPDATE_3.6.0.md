# BrightSteps 3.6.0 — Shape-Based Storage Fill

- Rebuilt Piggy Bank and Treasure Chest fill rendering around container-specific row geometry instead of rectangular clipping windows.
- Glass Jar implementation is unchanged.
- Piggy Bank rows follow the rounded belly shape: narrow lower/top rows and wider middle rows.
- Treasure Chest rows follow the actual glass cavity with broad horizontal rows.
- Removed rectangular clipping from pig/chest currency stages so complete coins/marbles remain visible.
- Generated dedicated pig/chest frame overlays with large transparent interior cutouts; only the visible outline/frame sits above the currency.
- Base artwork is translucent behind currency; frame artwork is crisp above currency, creating a true inside-the-container effect.
- Profile view and task-completion animation continue to share the exact same CurrencyStorage fill engine.
- Currency reveals bottom-to-top and task-earned pieces drop into the next available positions.
