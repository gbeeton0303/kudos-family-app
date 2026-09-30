# Kudos Family 3.9.67

- Routes Sandbox purchase verification to Apple's Sandbox App Store Server API first.
- Falls back safely between Apple's Sandbox and production APIs when an unreleased app returns 401 or 404 from the other environment.
- Keeps the device transaction JWS limited to endpoint selection; Apple server verification remains required before lifetime access is granted.
