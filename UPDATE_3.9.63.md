# Kudos Family 3.9.63

- Corrected the production and Sandbox App Store Server API hostnames used by the `entitlement-action` Edge Function.
- Valid StoreKit lifetime purchases can now be verified by Apple and applied to the family or classroom entitlement.
- Existing unfinished Sandbox purchases can be recovered with **Restore Purchases** after the updated function is deployed.
- Added a regression assertion that rejects the obsolete `*.itunes.apple.com` verification hosts.
