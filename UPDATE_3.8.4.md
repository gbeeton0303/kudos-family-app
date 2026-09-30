# Kudos 3.8.4

Fixes the profile baseline reappearing after early reward redemption. Early redemption now records an explicit reset-to-zero timestamp. The app replays that event chronologically, so imported/starting balances cannot reappear as a false floor such as 14. Existing early reward deliveries are backfilled automatically. Future task earnings accrue normally after the reset.
