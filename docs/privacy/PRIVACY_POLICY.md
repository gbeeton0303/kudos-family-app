# Kudos Family Privacy Policy

**Effective date: October 10, 2026**

**Policy version: 2026-10-10**

Kudos Family ("Kudos," "we," "us," or "our") helps parents, guardians, teachers, and other authorized adults manage tasks, rewards, and progress for children or students. This policy explains the information processed by the Kudos Family mobile application, the Kudos Cloud service, and related support services.

We designed Kudos to collect only information needed to provide these features. We do not sell personal information, show third-party advertising, or track people across other companies' apps or websites.

## Who should use Kudos

An adult should create and manage each family or classroom workspace. A child may use a limited child account only after an authorized adult creates a child profile and generates a temporary linking code. Child accounts do not require or request a child's email address.

Kudos is not submitted under Apple's Kids Category and is not intended for children to create independent accounts. This does not reduce our protections for children's information. Adults are responsible for having the authority and any consent required to create a child or student profile, assign activities, and upload a photo.

## Information we process

### Adult account and workspace information

When an adult creates a Kudos Cloud account, we process the adult's email address, optional display name, authentication identifiers, family or classroom name, workspace role, invitations, and the versions and time of the Terms of Service and Privacy Policy accepted during registration.

### Child or student profile information

An authorized adult may provide a child's name or nickname, a built-in avatar or optional photo, appearance preferences, currency and storage-container preferences, and the account identifier used to link that profile to a child device. We encourage adults to use a nickname and built-in avatar when appropriate.

After connecting with an adult-generated code, a child may optionally choose a username and password to sign in again. Usernames should be nicknames, not full names. A child does not provide a real email address: an internal, non-deliverable login identifier allows our authentication provider to manage the password securely. Supabase stores the password as a protected hash; Kudos does not store readable passwords in its app data, logs, or profile records. The username is linked to the existing child profile solely for authentication. A parent or teacher managing that profile can reset its username and password or revoke its login through device replacement. Children who do not choose a login can continue using their linked session and reconnect through an adult-issued replacement code if needed.

### Tasks, rewards, and activity

We process task and reward titles, descriptions, schedules, assignments, values, completion requests, approvals or denials, completion history, balances, reward redemption and delivery history, and related timestamps. These records allow the app to prevent duplicate awards and show accurate progress across authorized devices.

### Photos

Photos are optional. The mobile operating system's photo picker provides Kudos only the image an adult selects. If an adult takes a new photo, Kudos requests camera permission at that time. Selected profile, task, and reward images are uploaded to private cloud storage and displayed only to authorized members of the related workspace. Kudos does not scan a person's photo library or upload unselected images.

### Notifications and device information

If notifications are enabled, we process an Expo push token, device platform, workspace identifier, and account identifier to deliver task approval and reward alerts. We do not use notification identifiers for advertising or tracking.

### Support communications

If an adult contacts support, we process the contact information and message they submit so we can answer and resolve the request. Support requests should not contain passwords, child invite codes, or unnecessary information about a child.

### Trial and purchase information

Apple processes payments for Kudos Family. We receive and store the App Store product identifier, transaction and original transaction identifiers, purchase date, verification date, trial start and expiration dates, and lifetime-access status. We link this purchase history to the adult purchaser and family or classroom workspace so access can be verified, restored, and shared with authorized members. We do not receive or store payment-card numbers or Apple Account payment details.

## How we use information

We use information to:

- authenticate adult and linked child accounts;
- operate and synchronize family or classroom workspaces;
- show tasks, rewards, balances, progress, approvals, and history;
- prevent duplicate completion awards and protect data integrity;
- deliver requested notifications and transactional emails;
- generate, verify, expire, and revoke adult or child invitation codes;
- reconnect a child profile to a replacement device when an adult requests it;
- provide support, investigate problems, and protect account security;
- verify App Store transactions and provide, restore, and share workspace access;
- comply with applicable law and enforce our Terms of Service.

The current release does not use third-party advertising, behavioral profiling, cross-app tracking, analytics SDKs, crash-reporting SDKs, or subscriptions. The seven-day trial is managed by Kudos Cloud and does not auto-renew. StoreKit processes the one-time lifetime purchase through Apple.

## Children's information and adult controls

Kudos limits child accounts to the profile and workspace authorized by the adult-generated code. A linked child can view their own tasks, rewards, balance, and history; submit task completion requests; open rewards delivered to them; and change limited profile preferences. Database access controls prevent a child account from managing adults or accessing unrelated profiles.

An authorized adult can view, correct, export through ordinary app views, or delete a child profile and its associated information. An adult can reset a child's username/password login, or revoke a lost child's login and issue a replacement code while preserving the profile's history. Parents or guardians may contact us to request access, correction, or deletion. We will take reasonable steps to verify the requester's authority before acting.

We do not knowingly ask a child for an email address, postal address, phone number, precise location, contacts, payment information, health information, or advertising identifier. If you believe a child provided personal information without appropriate adult authorization, contact us so we can review and delete it when required.

Teachers and schools must use Kudos consistently with their school's authorization, policies, and applicable student-privacy requirements. Schools should not use Kudos to store education records or sensitive information beyond the app's ordinary task and reward features unless they have confirmed they are permitted to do so.

## Service providers

We use providers that process information on our behalf for app functionality:

- **Supabase** provides authentication, PostgreSQL database hosting, private file storage, realtime synchronization, and server-side Edge Functions.
- **Expo** provides the application runtime, build services, and Expo Push Service used to route notifications.
- **Apple Push Notification service (APNs)** delivers notifications to Apple devices.
- **Resend** delivers transactional messages such as adult-family invitations and support email.
- **Apple** processes App Store purchases and provides signed transaction information used by our server to verify access.

These providers receive only information needed to provide their services and operate under their own contractual and security obligations. Information may also be disclosed when required by law, to protect users or the service, or as part of a business transfer subject to appropriate protections. We do not provide personal information to data brokers.

## Local-only use

Kudos may be used in a local-only demo mode. Information in local-only mode remains on that device and is not synchronized to Kudos Cloud. It remains until removed through the app, the app is uninstalled, or the device's app storage is cleared. Operating-system backups may retain local app data according to the device owner's backup settings.

## Retention and deletion

We retain cloud information while an account or workspace remains active and as reasonably needed to provide the service, maintain security, resolve disputes, or comply with law.

Adults can delete a child profile in the app. In **Settings → Account**, a manager can permanently delete a selected family or classroom workspace, its profiles, tasks, rewards, history, private photos, and associated logins as described by the confirmation. **Delete My Entire Account** removes the adult's personal login and workspaces they created, and leaves joined workspaces without deleting those workspaces or other adults' logins. A linked child can delete their own child account and linked profile. Account deletion removes active service data; limited records may remain temporarily in encrypted provider backups until those backups age out under the provider's normal retention cycle, or longer if law requires.

Transactional support communications may be retained as reasonably necessary to resolve the request and document the response. We do not retain invitation codes in readable form; codes are stored as one-way hashes and expire or are revoked.

## Security

Kudos uses authenticated access, workspace membership rules, row-level database security, private storage, hashed invitation codes, rate limits, one-time codes, and server-side privileged operations. Replacing a linked child device revokes the former child login before a new code is issued. No service can guarantee absolute security, but we use safeguards designed for the nature of the information processed.

## Choices and rights

Adults may decline camera, photo, and notification permissions and continue using core task and reward features with built-in images and without alerts. Account and profile information can be edited or deleted in the app.

Depending on where you live, you may have rights to request access, correction, deletion, restriction, portability, or objection, or to appeal a privacy decision. A parent or guardian may exercise applicable rights for a child. Submit a request through our support page. We may ask for information needed to verify identity and authority. You may also contact the privacy or data-protection authority in your region.

## International processing

Our providers may process information in countries other than the user's country. Where required, we and our providers use recognized safeguards for international transfers.

## Changes to this policy

We may update this policy when features, providers, or legal requirements change. We will change the effective date and, when required, provide additional notice or request renewed acceptance. Materially different uses of children's information will not be applied without the authorization required by law.

## Contact

Kudos Family is the operator responsible for this policy. Privacy questions, parental requests, and deletion requests can be submitted at:

**https://www.mykudosfamily.com/support**

The public copy of this policy should be hosted at:

**https://www.mykudosfamily.com/privacy**
