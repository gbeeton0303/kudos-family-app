# Kudos Family 1.0.0 — Expo SDK 54 + Supabase Cloud

Kudos Family is a positive-reinforcement app for families and classrooms with account-specific data, cross-device sharing, and a workspace-wide App Store entitlement.

## Cloud features

- Supabase email/password authentication
- Family and classroom workspaces
- Parent, teacher, and linked child roles
- Postgres database with Row-Level Security
- Private cloud storage for profile, task, and reward photos
- Realtime cross-device refresh
- Offline AsyncStorage cache and persistent mutation queue
- One-time import from earlier local-only BrightSteps versions
- Temporary invitation codes for child accounts
- Transactional task approval and reward redemption
- Expo push-token registration and Edge Function notifications
- Auditable currency ledger for every award and redemption
- Seven-day non-renewing trial and one-time lifetime family/classroom unlock

## Quick start

```bash
unzip brightsteps-supabase-cloud-backend-sdk54.zip
cd brightsteps-family-rewards
npm install
cp .env.example .env
```

Add your Supabase URL and publishable key to `.env`, deploy the included backend, then start Expo:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run supabase:push
npm run supabase:functions:deploy
npm start
```

See [CLOUD_SETUP.md](./CLOUD_SETUP.md) for cloud setup and [PURCHASE_SETUP.md](./PURCHASE_SETUP.md) for App Store products, server verification, and TestFlight purchase testing.

## Local demo

When Supabase is not configured, developers can open the original local-only demo. Production sign-in does not expose this path because it would bypass workspace entitlement checks.

## Main folders

```text
src/cloud/                 Supabase client, auth, repositories, media, sync, migration, push
src/hooks/useCloudFamilyData.ts
                           Realtime cloud state, offline cache, mutation queue
supabase/migrations/       Versioned Postgres schema, functions, RLS, Storage policies
supabase/functions/        Edge Functions for task/reward actions, invites, push, migration, purchase verification
```

## Validation

```bash
npm run typecheck
npm run doctor
npm run export:web
```

Push notifications require an EAS development or production build; remote Android push is not available in Expo Go.
