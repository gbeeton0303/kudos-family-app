# Kudos Family Child-Data and Privacy Review

**Technical review completed: September 6, 2026**  
**Reviewed release: 3.9.70**

## Conclusion

The current architecture follows a parent-managed, data-minimizing model and is technically suitable for a general App Store listing rather than Apple's Kids Category. It still processes children's personal information and therefore must follow child-privacy laws in every launch region. This review confirms the code and disclosure controls; it is not a substitute for advice from a qualified privacy lawyer.

## Data-flow findings

| Area | Finding | Control in release 3.9.55 |
|---|---|---|
| Account creation | Children do not provide email addresses; optional username/password login is available only after adult-authorized linking | Initial anonymous Supabase Auth is converted on the server without changing the linked profile; Supabase hashes passwords; a reserved .invalid identifier replaces real email |
| Parent authorization | A child profile and code must be created by an authenticated parent or teacher | Manager membership is checked server-side; codes are one-time, hashed, expiring, and rate-limited |
| Child profile | Name/nickname, avatar or optional photo, preferences, tasks, rewards, and activity are processed | Adults are encouraged to use nicknames and built-in avatars; fields are limited to app functionality |
| Photos | Optional photos can identify a child | The system picker exposes only the chosen image; cloud files use private storage and workspace access controls |
| Child access | A child should not see adult administration or unrelated profiles | Row-level security links the account to one profile; server-owned child classification persists after conversion or editable metadata changes; database triggers prevent adult memberships and workspace creation |
| Lost device | A former child device must not retain access | Parent-controlled replacement revokes the old Auth user and membership before issuing a new code; profile/history remain |
| Notifications | Push tokens are persistent identifiers | Optional, linked only for app alerts, disclosed as Device ID, not used for tracking |
| Support email | Support content may contain personal information | Support copy tells users not to submit passwords, codes, or unnecessary child information; Resend is disclosed |
| Advertising/analytics | These increase child-privacy risk | No ads, tracking, analytics, crash-reporting, or data-broker SDKs found |
| Purchases | Children must not be prompted to buy or handle payment details | Only the workspace creator sees StoreKit; invited adults and children inherit the server-verified workspace entitlement; child accounts never see a payment screen |
| Deletion | Parents must be able to control child data | Parent profile deletion and family deletion exist; linked children can delete their own account and profile |
| Consent record | Adult acceptance previously existed only in UI state | Auth metadata and a server-timestamped legal_acceptances record now store document versions |

## Apple-facing decision

- List the app for a general audience and do not select Apple's Kids Category unless the app, metadata, external links, analytics, and advertising model are redesigned for Kids Category requirements.
- Do not market the app as being "for children" or use age-specific children's claims in App Store metadata. Describe it as a parent-managed family task and reward app with a limited linked child mode.
- Complete App Store Connect's age-rating questionnaire accurately based on actual content.
- Provide the mobile-app Privacy Policy URL in App Store Connect and retain the in-app Settings link.
- App Store privacy answers should disclose email, name, user ID, device ID, photos, other user content, product interaction, and purchase history as linked to identity, used for App Functionality, and not used for tracking.

## Regional launch review

Before enabling downloads in a country or region, the operator should confirm whether local law requires a specific parental-consent mechanism, privacy contact, representative, data-processing agreement, school authorization, or age threshold. This includes, where applicable, COPPA and state children's privacy rules in the United States, GDPR/UK GDPR child provisions, and student-privacy obligations for classroom use.

## Required operational controls

1. Publish the final mobile-app Privacy Policy and Terms at the URLs used by the app before external TestFlight or App Review.
2. Confirm the public documents identify the correct legal operator and contact method. Add a business mailing address if counsel determines COPPA or another launch-region rule requires it.
3. Configure Supabase Auth so anonymous child sign-in is enabled and verify production RLS with a real child session.
4. Apply every migration and deploy the updated `profile-invite` function before testing device replacement or consent records.
5. Test deletion, access revocation, private photo access, and child isolation in production.
6. Maintain a written provider list and data-processing agreements for Supabase, Expo, Apple, and Resend.
7. Confirm in TestFlight that children and non-purchasing adults never see StoreKit, while access follows the workspace after a child device replacement.
8. Re-run this review before adding analytics, crash reporting, new payment models, advertising, chat, location, contacts, or new child profile fields.

## Test evidence required before release

- A linked child cannot query another profile or adult-access data.
- A revoked child device loses access immediately, even before its local session expires.
- A replacement device receives the preserved profile and history after entering the new code.
- Reusing or guessing a code fails and rate limiting activates.
- Deleting a profile removes its private media and associated cloud rows.
- Deleting the family removes the workspace, linked child Auth users, private media, and active device tokens.
- Denying photo and notification permissions leaves core functionality usable.
