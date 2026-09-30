# Kudos Family 3.9.70

- Fixes the false “App Store purchase information is incomplete” message caused by an older pending StoreKit transaction delivered when the purchase screen connects.
- Makes the device purchase token optional because Apple’s authenticated transaction lookup uses the transaction ID.
- Preserves product, bundle, account, revocation, transaction, and workspace-uniqueness verification before lifetime access is granted.
