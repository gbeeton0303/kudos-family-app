# Kudos 3.9.7

- Replaced the shared Task category clipboard with the supplied teal/gold clipboard sticker.
- Removed all image background by preserving/cropping the transparent PNG and kept every existing Task-category background color.
- Task and Reward artwork now use the same 88% scale in CategoryIcon, so the Home Task clipboard and Rewards trophy have comparable visual weight.
- Extended striped profile patterns across the complete profile badge.
- Rebuilt polka dots as an irregular, evenly scattered field instead of aligned rows.
- Profile editor now uses `useSafeAreaInsets()` with explicit top padding, keeping Cancel/Save below iPhone time/battery/Dynamic Island areas.
- Reward celebration now shows `You earned it!` in the upper banner and `Kudos, <child name>!` as the main heading.
- Early-redeem description now names the reward in quotation marks and clearly states that redeeming early brings current earnings to zero.
- Parent reward confirmation buttons are equal height, equally sized, centered, and use the same 12px text size.
- `Redeem Now` capitalization is consistent.
- Parent Send / Send Reward buttons now use a light-gold background with dark high-contrast text.
- Early Send Reward is centered on two lines.
