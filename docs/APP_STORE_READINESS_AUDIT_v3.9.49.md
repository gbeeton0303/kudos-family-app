# Kudos App Store Readiness Audit — v3.9.49

Audit date: August 25, 2026

This is a code and configuration audit of the supplied project. It is not a substitute for legal advice or testing the signed App Store archive on real devices.

## Red — must fix before submission

1. **Publish the completed mobile policy.** Release 3.9.55 replaces the draft with `docs/privacy/PRIVACY_POLICY.md`, adds the matching mobile Terms, and links both documents from the in-app Privacy screen. Publish those exact documents at the stable HTTPS URLs used by the app, verify the correct legal operator/contact details, and enter the privacy URL in App Store Connect.
2. **Complete child-privacy/legal review.** The app stores child names or nicknames, optional photos, tasks, rewards, activity, and linked identifiers. Decide whether Kudos will be submitted to the Kids Category and which age band applies. Obtain appropriate parental consent and legal review for every launch region; an in-app parental gate alone is not legal consent.
3. **Deploy and verify the new database repair migration in both environments.** Run `npx supabase db push` while linked to Development, test daily/weekly/monthly completion across midnight and time zones, then repeat against Production. Verify an approved task creates exactly one completion and one currency-ledger credit.
4. **Generate and inspect the final signed iOS archive privacy report.** The JavaScript configuration includes a privacy manifest, but the aggregate archive must also contain valid declarations from Expo, React Native, AsyncStorage, Supabase, and their native dependencies. Resolve every Required Reason API warning before upload.
5. **Build with an accepted SDK.** As of April 28, 2026, uploads must use the iOS 26 SDK or later. Confirm the selected EAS build image uses Xcode 26 or later before the production build.
6. **Prepare a fully functional review environment.** Production Supabase must have all migrations, functions, secrets, private storage policies, email templates, and redirect URLs. Give App Review a working adult test account, child code, review instructions, and populated sample data. Broken cloud flows are a rejection risk.

## Yellow — should fix before launch

1. Add automated regression tests for duplicate task taps, pending requests, approval, undo, day/week/month rollover, time-zone changes, offline retries, and two adults acting simultaneously. Type checking cannot prove these workflows.
2. Run a complete TestFlight matrix on supported iPhone and iPad sizes, light/dark mode, fresh install, upgrade, offline/reconnect, denied photo/notification permissions, account deletion, adult invitation, child invitation, and cloud migration.
3. Confirm the App Store privacy answers match the final binary and backend. The current conservative inventory includes email, names, user IDs, device/push identifiers, photos, other user content, and product interaction, linked to the user and used for app functionality.
4. Replace remaining legacy internal branding (`brightsteps-family-rewards`, storage/cache names, and package description) where practical. It is mostly invisible, but consistent release metadata reduces configuration mistakes.
5. Review whether `expo-dev-client` should remain configured as a global app plugin. It is needed for development builds, but production should be checked to ensure no development-only launcher behavior or unnecessary native surface is shipped.
6. Add crash reporting only if a child-privacy-compatible provider and consent/disclosure plan are chosen. Without it, production failures will be harder to diagnose; adding it changes the privacy disclosures.
7. Verify that `https://mykudosfamily.com/support` and the final privacy URL are live, mobile-friendly, contain current contact information, and do not expose child data in support submissions.
8. Finalize App Store metadata: app name/subtitle, category and age rating, support and marketing URLs, copyright, export-compliance response, review notes, screenshots using fictional families, and the privacy nutrition label.

## Green — ready in the project

1. Permanent bundle identifier is set to `com.beeton.kudosfamily` on iOS and Android.
2. EAS has separate development, preview, and production environments; production uses remote versioning and automatic build-number increments.
3. In-app account deletion exists for adults and linked children, with server-side privileged deletion and cascading family data cleanup.
4. Child accounts can be linked without a child email address.
5. Added-adult invitations are code-based and v3.9.49 stores a pending invite locally so it is accepted once automatically after email verification/sign-in.
6. Photos and notifications are optional and requested in context; core task/reward use remains available without them.
7. Tracking is declared off, and the inspected project contains no advertising or analytics SDK.
8. App icon, adaptive icon, splash image, automatic light/dark appearance, and Kudos-colored splash background are configured.
9. TypeScript validation and Edge Function syntax validation pass for v3.9.49.

## Authoritative references

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple account deletion requirement: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- Apple App Privacy management: https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy/
- Apple privacy manifests: https://developer.apple.com/documentation/bundleresources/privacy-manifest-files
- Apple 2026 SDK minimum: https://developer.apple.com/news/?id=ueeok6yw
- Apple TestFlight overview: https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview
