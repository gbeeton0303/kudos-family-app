# App Store Connect — App Privacy Answers

Use this as the conservative entry guide for the current Kudos release.

## Does this app collect data?

Yes. Cloud features transmit data off the device. Optional collection must still be disclosed when the app can collect it.

## Data linked to the user

Select each category below, mark it as linked to the user's identity, mark it as not used for tracking, and select App Functionality as the purpose.

| App Store Connect category | Select | Purpose |
|---|---|---|
| Contact Info → Email Address | Yes | App Functionality |
| Contact Info → Name | Yes | App Functionality |
| User Content → Photos or Videos | Yes | App Functionality |
| User Content → Other User Content | Yes | App Functionality |
| Identifiers → User ID | Yes | App Functionality |
| Identifiers → Device ID | Yes | App Functionality |
| Usage Data → Product Interaction | Yes | App Functionality |
| Purchases → Purchase History | Yes | App Functionality |

For every selected data type:

- Linked to the user's identity: Yes
- Used for tracking: No
- Purpose: App Functionality only

## Do not select for the current build

Payment Info, Other Financial Info, Location, Contacts, Search History, Browsing History, Health, Fitness, Sensitive Info, Diagnostics, Crash Data, Performance Data, Advertising Data, Audio Data, or Other Data.

Apple processes the payment method and billing details. Kudos receives and stores only the App Store transaction identifiers and workspace entitlement needed to start the free trial, unlock the workspace, prevent reuse, and restore access. Select **Purchase History**, not **Payment Info**.

## Tracking questions

- Does the app or its partners use collected data for tracking? No.
- Does the app show third-party advertising? No.
- Does the app share data with data brokers? No.
- Does the app need AppTrackingTransparency permission? No.

## App review notes

Kudos Family is parent/teacher managed. A child can use an account generated through a parent-issued code without providing an email address. Cloud data is used only to provide family/classroom task, reward, synchronization, notification, purchase-entitlement, transactional email, and support functionality. Photos are optional. Account deletion is available in Settings → Account. The app is not listed in Apple's Kids Category, but the public policy and review notes describe the limited child mode and adult controls.

Before submission, compare this sheet with the final App Store binary's Xcode Privacy Report and confirm that no release-only SDK has introduced another category.
