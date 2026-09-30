# BrightSteps 3.4.0
- Removed scaling/rasterization from storage containers so piggy bank, treasure chest, coins and marbles stay crisp.
- Piggy bank now renders at its natural geometry without fractional scaling.
- Treasure chest is static; currency sits in a clipped cavity behind a crisp front-chest overlay so it reads as inside the chest.
- Coin/marble fill uses native-resolution image assets without animated image scaling.
- Task-completion celebration no longer scales/rasterizes the entire modal; it uses a short translate/fade entrance and lighter flying-currency motion.
- Flying task-completion currency uses the real CurrencyIcon assets for coins and marbles.
- Home Tasks/Rewards cards now have centered large icons with centered titles and no numeric count badge.
- Bottom navigation now uses consistent custom outline icons for Home, History, Chore Chart and Settings.
