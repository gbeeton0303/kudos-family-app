# BrightSteps 3.7.6

- Fixed profiles whose task earnings appeared not to accrue after an older early reward redemption.
- Profile balances are now calculated by replaying task earnings and reward redemptions chronologically.
- A reward redemption can consume only the currency available at the moment it occurs and can never create hidden negative debt.
- Existing profiles with legacy full-cost early-redemption records repair automatically; no profile reset or data deletion is required.
- Future task completions immediately increase the visible account balance after an early redemption.
