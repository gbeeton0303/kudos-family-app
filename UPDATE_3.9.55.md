# Kudos Family 3.9.55

- Changed the installed and App Store-facing display name to Kudos Family.
- Added in-app links to the full mobile Privacy Policy and Terms of Service.
- Added final mobile-app Privacy Policy and Terms copy plus a child-data/privacy review.
- Records accepted legal-document versions and timestamps in Auth metadata and the new `legal_acceptances` table.
- Added a parent-controlled replacement flow for a lost or replaced child device while preserving the child profile and history.
- Disabled the unused image-picker microphone permission and removed the unnecessary full photo-library permission request.
- Declared that iOS uses only standard/exempt encryption.
- Added daily task, approval, duplicate, undo, local-midnight, multi-profile, multi-adult, relinking, and legal-consent regression tests.
- Removed generated Expo export directories from the project and excluded future `dist-*` directories.

## Deployment required

Apply migrations `20260827000100_legal_acceptance_records.sql` and `20260827000200_require_anonymous_child_invites.sql`, then deploy the updated `profile-invite` Edge Function together with the rest of the production migrations and functions.

Publish `docs/privacy/PRIVACY_POLICY.md` and `docs/privacy/TERMS_OF_SERVICE.md` at the URLs used by the app before external TestFlight or App Review.
