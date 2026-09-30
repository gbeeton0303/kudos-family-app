# BrightSteps 3.5.0 — Kid-Friendly Animated Storage

- Rebuilt all three storage containers with a more playful child-friendly appearance.
- Glass Jar: brighter glass, colorful cap accent, star sticker, glow, sparkles, bottom-up animated currency.
- Piggy Bank: stable anatomy, two ears, friendly face, cheek, smile, pink kid-friendly styling, animated currency inside.
- Treasure Chest: completely rebuilt from crisp native React Native shapes with an open lid, dark interior cavity, gold trim, lock, gems, and a front wall that keeps currency visibly inside the chest.
- Restored independent animated currency pieces without scaling the containers themselves.
- Coins and marbles keep their real image assets and fall vertically without bitmap scaling.
- Task-completion celebration now starts the container at `balanceBefore`, drops newly earned currency into it, and fills toward `balanceAfter`.
- Removed the separate floating-currency celebration layer so the action is focused on the storage container itself.
