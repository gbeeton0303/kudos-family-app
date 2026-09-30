# Kudos 3.9.21

- Fixed reward Goal picker crash: `TypeError: Cannot read property 'type' of undefined`.
- Root cause: the picker passed `item={reward}` to ItemIconView, but ItemIconView requires `icon={...}`.
- Reward picker now passes `reward.icon` correctly.
- If a legacy reward has no icon metadata, the picker falls back to a trophy emoji instead of crashing.
- ItemIconView now safely handles an undefined icon globally.
- Reward tracking behavior and all v3.9.20 fixes remain unchanged.
