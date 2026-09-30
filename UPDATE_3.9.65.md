# Kudos Family 3.9.65

- Replaced the custom App Store Server API authorization token implementation with Apple's official Node server library.
- Production and Sandbox transaction lookups now use Apple's maintained client and environment selection.
- Added specific, non-sensitive diagnostics for rejected Apple server credentials.
- Preserved the server-managed seven-day trial and lifetime purchase restoration flow from v3.9.64.
