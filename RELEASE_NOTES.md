# Kudos Family Release Notes

## 1.0.0 — Initial App Store release

- Establishes the first public Kudos Family release while retaining every feature and fix validated through internal build 3.9.73.
- Includes family and classroom workspaces, adult and linked-child access, reusable task and reward libraries, cloud sync, offline task actions, notifications, account deletion, and child-device replacement.
- Includes the seven-day non-renewing trial and securely verified lifetime family or classroom unlock.
- Includes full iPhone and iPad layouts, light and dark mode, edge-to-edge launch artwork, and manager-confirmed repeat awards for completed daily tasks.

## 3.9.73 — Full-width iPad stripes and new child submission icon

- Extends striped profile patterns across the complete profile banner on iPad while preserving the existing phone appearance.
- Replaces the child “Send to your parent?” artwork with the supplied teal-and-gold paper-airplane sticker.
- Uses genuine PNG transparency so the new icon blends cleanly into light and dark confirmation cards.

## 3.9.72 — Manager repeat awards and full-screen launch artwork

- Lets adults and teachers tap an already approved daily task and explicitly confirm a second award for the current assigned period.
- Keeps child accounts and ordinary completion requests protected by the existing once-per-period rule.
- Adds an auditable, manager-only Supabase operation for repeat awards with idempotent crediting and offline retry support.
- Replaces the pale, contained launch image with centered Kudos artwork on an edge-to-edge dark-teal splash screen.

## 3.9.71 — Early lifetime upgrade during trial

- Adds a gold lifetime-upgrade banner directly below Family or Classroom Settings while the creator's trial is active.
- Lets the authorized purchasing adult open the lifetime purchase page and upgrade before the seven-day trial ends.
- Keeps invited adults and child accounts from seeing purchase controls.
- Shows an active-trial summary and a clear return-to-settings action on the upgrade page.

## 3.9.70 — Reliable pending StoreKit transaction recovery

- Accepts Apple transaction identifiers even when an older pending iOS event has no JWS-formatted device token.
- Uses the device token only as an optional Sandbox/production routing hint; Apple remains the verification authority.
- Prevents pending StoreKit delivery on purchase-screen startup from producing a false incomplete-purchase error.

## 3.9.69 — Refined lifetime purchase presentation

- Uses family or classroom terminology throughout the purchase and paused-access screens.
- Removes the party emoji from the free-trial card.
- Reuses the Rewards-tab trophy artwork in an expanded lifetime card containing the full benefits checklist.

## 3.9.68 — Safe purchase recovery after account recreation

- Allows a verified Apple purchase to be reclaimed when its original Supabase Auth account has been deleted and recreated.
- Continues rejecting transfers from another active Kudos adult account.
- Retains the database guard that prevents one Apple transaction from unlocking multiple active workspaces.

## 3.9.67 — Sandbox-aware Apple transaction lookup

- Uses the StoreKit transaction JWS as a non-authoritative environment hint so Sandbox purchases go directly to Apple's Sandbox server.
- Falls back between Sandbox and production on both 401 and 404 responses, covering apps awaiting their first production release.
- Logs the result from each Apple environment without exposing credentials.

## 3.9.66 — Edge-compatible Apple JWT signing

- Replaced the Node-only curve validation path with a WebCrypto-compatible JOSE signer for Supabase Edge Functions.
- Added robust PKCS#8 secret normalization before Apple authorization tokens are created.

## 3.9.65 — Official Apple server authorization

- Replaced custom App Store Server API JWT signing with Apple's official server library.
- Added clearer server diagnostics for rejected purchase-verification credentials.

## 3.9.64 — Server-managed seven-day trial

- The free trial is now started and timed securely by Supabase instead of being modeled as a StoreKit product.
- StoreKit is used only for the $5.99 lifetime non-consumable purchase.
- Added an idempotent, creator-only trial-start migration and regression coverage.

## 3.9.63 — App Store purchase verification fix

- Fixed the App Store Server API URLs used to validate production and Sandbox StoreKit transactions.
- Existing completed purchases can be activated through Restore Purchases after deploying the updated entitlement function.

## 3.9.62 — 7-day trial and lifetime family unlock

- Added Apple StoreKit non-consumable products for a non-renewing seven-day trial and $5.99 lifetime access.
- Entitlements belong to the family/classroom: invited adults and linked children inherit access without another purchase.
- Added secure Apple server verification, restore purchases, offline entitlement caching, and purchase-access regression tests.
- Updated privacy, terms, and App Store disclosure documentation for purchase history.

## 3.9.61 — iPad profile layout and child appearance

- Profile progress cards now span the full usable width on iPad and page one at a time.
- The Reward Goal badge aligns with the storage-title column on wide profile layouts.
- Profile task totals now count every assigned task rather than only tasks scheduled today.
- Children can choose System, Light, or Dark appearance from Edit My Profile without access to parent settings.

This release upgrades the latest local-only BrightSteps application to an account-based, cloud-synchronized architecture.

## Implemented

1. Supabase email/password authentication and persisted sessions
2. Family/classroom workspaces with parent, teacher, and linked-child roles
3. Versioned Postgres schema and role-based Row-Level Security
4. Cloud repository replacing AsyncStorage as the source of truth for signed-in users
5. One-time migration from previous BrightSteps local storage
6. Private Storage uploads and signed URLs for custom profile/task/reward images
7. Realtime Postgres subscriptions for cross-device refresh
8. Separate child accounts linked with expiring invitation codes
9. Edge Functions for task requests/approvals, reward redemption/delivery, migration, device registration, and push notifications
10. Workspace-specific offline cache and persistent mutation replay queue
11. Local demo fallback for development without Supabase

## Deployment required

The backend source is included but is not tied to a Supabase account. Follow `CLOUD_SETUP.md` to create/link your project, deploy the SQL migration and Edge Functions, configure EAS credentials, and set the two public Expo environment variables.

## 2.1.1 — Reward modal touch fix
- Prevented decorative confetti and glow layers from intercepting taps.
- Added an always-visible close button to the reward celebration.
- Made reward celebration content scroll on smaller devices.
- Added Android back-button support through the modal close handler.

## 2.3.0 — Family badge and parent quick-start tutorial

- Home account badge now identifies the family surname instead of the final word in the workspace name.
- Supported examples include `Beeton Family` → `B`, `The Beeton Family` → `B`, and `The Beeton's` → `B`.
- New parent accounts receive a six-step first-login tutorial covering profiles, child invitation codes, tasks, rewards, redemption, and History.
- The tutorial can be skipped, completed, and replayed later from Settings → App tutorial.
- Tutorial completion is saved per parent account and family workspace on the device.

## 2.4.0 — Streamlined settings and revised tutorial

- Removed the BrightSteps workspace badge from the bottom of Settings.
- Combined the duplicate Cloud Account and Family Account rows into one Family Account destination.
- Replaced the glass-jar selector symbol with a clearer jar icon.
- Added a new welcome message and Parent Mode introduction to first-login onboarding.
- Shortened the remaining tutorial steps for faster reading.
- Increased smaller supporting text sizes across the app by one point.
