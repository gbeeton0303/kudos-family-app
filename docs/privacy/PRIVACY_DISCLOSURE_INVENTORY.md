# Kudos Privacy Disclosure Inventory

Audit date: September 6, 2026

This inventory covers the current Kudos source code, Supabase schema and Edge Functions, Expo SDK 54 dependencies, local device storage, photo selection, and push notifications. It should be reviewed whenever a dependency, backend table, analytics tool, advertising tool, payment system, or user-facing feature changes.

## Collection boundary

Kudos supports local-only use and optional Kudos Cloud use. Information that remains only on a person's device is not treated as “collected” for Apple's App Privacy answers. The disclosures below conservatively cover information transmitted through Kudos Cloud, Supabase, or Expo push services, even when collection is optional.

## Data collected for app functionality

| App Store data type | Kudos data | Linked to identity | Tracking | Purpose and destination |
|---|---|---:|---:|---|
| Contact Info — Email Address | Parent/teacher account email; password-reset destination; adult invitation and support destination | Yes | No | Account authentication and recovery through Supabase Auth; transactional email through Resend |
| Contact Info — Name | Adult display name; family/classroom name; child name or nickname | Yes | No | Identify accounts, workspaces, and profiles in Kudos Cloud |
| Identifiers — User ID | Supabase user ID, optional child username and non-deliverable internal login identifier, workspace ID, child profile ID, invitation relationship | Yes | No | Authentication, permissions, account linking, and data isolation |
| Identifiers — Device ID | Expo push token and platform | Yes | No | Deliver task approval and reward notifications; not used for advertising |
| User Content — Photos or Videos | Optional profile, task, or reward photos selected by a parent/teacher | Yes | No | Display user-selected images; stored in private Supabase Storage |
| User Content — Other User Content | Task and reward titles, descriptions, schedules, values, icons, family/classroom name | Yes | No | Core task and reward functionality |
| Usage Data — Product Interaction | Task assignments, completion requests, approvals, completion timestamps, reward redemptions, balances, and delivery/open status | Yes | No | Operate histories, balances, progress, approvals, and synchronization |
| Purchases — Purchase History | App Store product and transaction identifiers, purchase date, verification date, trial dates, and workspace lifetime entitlement | Yes | No | Securely verify, restore, and share purchased access across an authorized family/classroom |

## Data not collected by the current release

- Advertising data or data used for cross-app tracking
- Precise or coarse location
- Contacts, browsing history, or search history
- Health, fitness, payment-card, credit, or sensitive information
- Audio recordings
- Analytics data
- Crash reports, performance diagnostics, or other diagnostic telemetry
- Subscription information (Kudos uses non-consumable products, not a subscription)

Apple processes the user's payment method. Kudos does not receive or store card numbers or Apple Account payment details.

If crash reporting, analytics, subscriptions, advertising, or customer-support SDKs are added later, this inventory, the privacy manifest, the public privacy policy, and App Store Connect must all be updated before submission.

## Local device data

Kudos uses AsyncStorage for local family state, authentication/session state, selected workspace, appearance, tutorial completion, teacher mode, sync queue, and sync failure records. Photo files may be read temporarily for an upload selected by the user. These local operations use SDK privacy manifests supplied by AsyncStorage and Expo FileSystem.

## Backend inventory

Supabase stores authentication users; adult display names; legal-document acceptance versions and timestamps; workspaces and memberships; workspace trial/lifetime entitlement; verified App Store transaction identifiers; child profiles; task and reward templates and assignments; completion requests and reviews; completions; currency ledger entries; reward redemptions and deliveries; push tokens; invitation hashes; balance resets; and migration records. Row-level security restricts data to authorized workspace members, and privileged operations run in server-side Edge Functions.

## Third parties

- Supabase: authentication, PostgreSQL database, private photo storage, realtime synchronization, and Edge Functions.
- Expo: application runtime and Expo Push Service for notifications.
- Apple Push Notification service: final delivery of iOS notifications.
- Resend: transactional adult-invitation and support email delivery.
- Apple App Store and StoreKit: payment processing and signed purchase transactions. The backend uses Apple's App Store Server API to verify each entitlement.

Kudos has no advertising, analytics, or crash-reporting provider in the audited dependency tree. `expo-iap` provides the StoreKit bridge and does not replace Apple's payment processing.
