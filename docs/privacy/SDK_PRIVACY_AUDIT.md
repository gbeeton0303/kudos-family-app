# iOS SDK and Privacy Manifest Audit

Audit date: September 6, 2026

## Current result

The dependency tree contains no advertising, analytics, crash-reporting, or attribution SDK. The principal data-processing dependency is Supabase JS. Expo Notifications provides push registration and notification handling. `expo-iap` 5.5.1 is the StoreKit 2 bridge used for the two non-consumable App Store products.

The app-level Expo configuration now declares collected data, no tracking, and no tracking domains. Native SDK manifests will be aggregated during the iOS build.

## Required-reason API findings

| Dependency | Manifest found | Declared API categories |
|---|---:|---|
| @react-native-async-storage/async-storage 2.2.0 | Yes | File timestamp |
| expo-file-system 19.0.23 | Yes | File timestamp; disk space |
| expo-notifications 0.32.17 | Yes | User defaults |
| expo-iap 5.5.1 | Inspect generated pod manifest | StoreKit purchase access; no advertising or tracking |

Other Expo/React Native dependencies must be rechecked in the final generated iOS project and archive because privacy manifests can be supplied through pods rather than visible JavaScript packages.

## Release checklist

1. Run `npx expo prebuild --clean` using the production bundle identifier and inspect the generated `PrivacyInfo.xcprivacy` files.
2. Build an iOS Release archive in Xcode.
3. From the archive organizer, generate the Privacy Report and review the aggregate declarations.
4. Confirm every required-reason API category has an approved reason supplied by the executable or the SDK that uses it.
5. Compare the report with `APP_STORE_PRIVACY_ANSWERS.md`.
6. Confirm the public privacy-policy URL is live and entered in App Store Connect.
7. Confirm App Store Connect declares linked Purchase History for App Functionality and does not declare Payment Info, because Apple—not Kudos—handles payment details.
8. Re-run this audit after every SDK addition or upgrade.

## Release blockers still requiring owner input

- Supply the legal operator name, privacy contact email, postal address, effective date, and hosted privacy-policy URL.
- Confirm the production Supabase region, retention policy, backup retention, subprocessors, and data-processing agreement.
- Decide the app's intended age category and obtain legal review for child-privacy obligations in launch regions.
