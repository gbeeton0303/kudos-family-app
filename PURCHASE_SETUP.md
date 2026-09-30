# Kudos Family — App Store Purchase Setup

Release 1.0.0 includes a server-managed, workspace-wide seven-day trial and a $5.99 lifetime unlock. Complete every section in both the development and production environments before building TestFlight.

## 1. Create the App Store products

In App Store Connect, open Kudos Family → Monetization → In-App Purchases and create one **Non-Consumable** product:

| Reference name | Product ID | Price |
|---|---|---:|
| Kudos Family Lifetime | `com.beeton.kudosfamily.lifetime` | USD $5.99 |

The seven-day trial is started by the Kudos backend and is not an App Store product. Apple free-trial offers apply to auto-renewable subscriptions, while the Kudos lifetime unlock is a non-consumable purchase. If you previously created `com.beeton.kudosfamily.trial.7day`, do not submit it for review and remove it from sale if App Store Connect permits that action.

Use a clear review name and description for the lifetime product. Add its required App Review screenshot and make it available for sale.

### Turn on Apple Family Sharing

In App Store Connect, open **Kudos Family → Monetization → In-App Purchases → Kudos Family Lifetime**. Scroll to **Family Sharing**, click **Turn On**, review the confirmation, and click **Confirm**. Apple does not allow Family Sharing to be turned off after it is enabled for an In-App Purchase.

Family members use their own Apple IDs. Apple gives each eligible member a separate family-shared transaction, and that adult can use **Restore Purchases** in Kudos to unlock the family/classroom workspaces they create. Invited adults and linked child/student profiles continue to inherit the workspace creator's access without restoring or purchasing anything.

Confirm the Paid Applications agreement, tax forms, and banking information are active in App Store Connect. StoreKit will not return usable products if the agreements or product setup are incomplete.

## 2. Create the Apple server verification key

In App Store Connect → Users and Access → Integrations → In-App Purchase, create an In-App Purchase key. A clear name is **Kudos Server Purchase Verification**. Download the `.p8` private key immediately; Apple allows it to be downloaded only once. Record the Issuer ID and Key ID shown with the key.

## 3. Add Supabase Edge Function secrets

In each Supabase project, open Project Settings → Edge Functions → Secrets and add:

- `APPLE_IAP_ISSUER_ID` — the Apple In-App Purchase Issuer ID
- `APPLE_IAP_KEY_ID` — the Apple In-App Purchase Key ID
- `APPLE_IAP_PRIVATE_KEY` — the complete `.p8` file, including BEGIN/END lines
- `APPLE_IAP_BUNDLE_ID` — `com.beeton.kudosfamily`

Never place the `.p8` key or these values in Expo environment variables, `.env`, the app bundle, or source control.

## 4. Apply the database and function changes

Link the intended Supabase project, confirm the project reference, then run:

```powershell
npx supabase@latest db push --dry-run
npx supabase@latest db push
npx supabase@latest functions deploy entitlement-action --use-api
```

For production, the project reference should be `vhlonzbasqqbulwoxdxk`. Apply both `20260927183149_dual_family_classroom_workspaces.sql` and `20260928001705_apple_family_sharing_entitlements.sql` before deploying the updated function. The migrations create one entitlement per family/classroom, give purchase authority to its creator, and distinguish direct purchases from Apple Family Sharing. They do not delete or reset existing family data.

## 5. Create a new native build

`expo-iap` contains native StoreKit code and does not work in Expo Go. After installing dependencies, create a new development build for sandbox testing or a new production build for TestFlight. The trial itself does not open an Apple purchase sheet; only the lifetime unlock does.

```powershell
npm install
npx eas-cli@latest build --platform ios --profile development
```

After sandbox testing succeeds:

```powershell
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production --latest
```

## 6. Test before App Review

Use StoreKit testing or an App Store sandbox tester and confirm:

1. The workspace creator can start the free trial and immediately enter the app.
2. Trial access works for seven days according to the server timestamps and does not auto-renew.
3. The $5.99 lifetime transaction unlocks the workspace after backend verification.
4. Restore Purchases recovers access after reinstalling on the purchasing Apple Account.
5. A temporary network loss keeps a cached active trial available and keeps lifetime access available.
6. An invited adult receives access but never sees payment controls.
7. A linked child never sees payment controls and retains access after device replacement.
8. A revoked or mismatched transaction is rejected by the Edge Function.
9. Create a Sandbox Test Family with at least two Sandbox Apple Accounts. Purchase with one member and restore with the other; Apple should report the restored transaction as `FAMILY_SHARED`.
10. In the Sandbox Test Family, stop sharing purchases for the restoring member. Reopen or foreground Kudos and confirm that the shared adult account returns to the purchase screen while the original purchaser remains unlocked.
11. Change the workspace creator's active Media & Purchases Apple Account. After a successful App Store check, access should pause until the entitled Apple Account restores the purchase again.

Keep the in-app price derived from StoreKit. The purchase action stays disabled until Apple supplies the localized price; the app does not display a hardcoded fallback price.
