# Kudos Family 1.0.0

## Initial App Store release

This release changes the public application version from the internal development series to `1.0.0`. It retains all functionality, database migrations, Edge Functions, purchase verification, assets, and regression fixes validated through internal version 3.9.73.

It also preserves completed-task history and earned points when a task is removed from a profile or deleted from the task library. Apply `20260909000100_preserve_task_history_on_removal.sql` before releasing this build.

Purchase pricing is now displayed exclusively from Apple’s localized StoreKit product data. The lifetime purchase button remains disabled with a loading label until the App Store returns the current price, and the Settings upgrade banner no longer contains a fixed dollar amount.

## Before building

- Confirm the production Supabase URL and publishable key are present in the EAS production environment.
- Confirm every included migration has been applied to the production Supabase project.
- Confirm all Edge Functions are deployed to production and their required secrets are configured.
- Confirm the lifetime in-app purchase product is attached to the App Store version.

## Build and submit

```powershell
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production --latest
```

Create or select version `1.0.0` in App Store Connect and attach the newly uploaded production build. Earlier 3.9.x TestFlight builds cannot be attached to the `1.0.0` App Store version because their embedded version numbers differ.
