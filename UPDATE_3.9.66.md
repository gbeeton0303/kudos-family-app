# Kudos Family 3.9.66

- Replaced the Node-specific Apple JWT signer with the WebCrypto-compatible `jose` implementation for Supabase Edge Functions.
- Normalized multiline, escaped, and quoted PKCS#8 In-App Purchase secrets into a canonical PEM before signing.
- Preserved Apple-required ES256 claims and production-to-Sandbox transaction lookup behavior.
- Retained the server-managed seven-day trial and secure lifetime transaction validation.
