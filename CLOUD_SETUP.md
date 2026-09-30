# Kudos Cloud Setup

Kudos uses Supabase for authentication, Postgres data, row-level security, private image storage, realtime synchronization, Edge Functions, child and adult invitations, and Expo push notifications. The repository contains all backend migrations and functions, but you must deploy them to a Supabase project that you own.

## 1. Prerequisites

- Node.js 22 or newer
- npm
- A Supabase account and project
- An Expo account for EAS development builds and push-notification credentials
- Docker Desktop only if you want to run Supabase locally

Install project packages:

```bash
npm install
```

## 2. Create the Supabase project

Create a project in the Supabase dashboard. Record:

- Project reference ID
- Project URL
- Publishable key

Never place the service-role key in the Expo application. Edge Functions receive server credentials through the Supabase runtime.

## 3. Configure the Expo client

Copy the environment template:

```bash
cp .env.example .env
```

Set:

```env
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_SUPABASE_PUBLISHABLE_KEY
```

Restart Metro after changing environment variables:

```bash
npx expo start --clear
```

## 4. Deploy the database and security policies

Authenticate and link the local repository:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
```

Push the included SQL migration:

```bash
npm run supabase:push
```

The migration creates:

- User profiles
- Family/classroom workspaces and membership roles
- Child/class profiles and account links
- Task and reward libraries
- Profile assignments
- Completion requests and approvals
- Reward redemptions and child deliveries
- An auditable currency ledger
- Device push tokens
- Temporary child invitation codes
- Temporary adult-manager email invitations
- Local-migration records
- Private image storage bucket and policies
- Realtime publication entries
- Row-level security policies for managers and linked children
- Transactional database functions for completion, approval, redemption, invitations, and balance calculations

## 5. Deploy Edge Functions

```bash
npm run supabase:functions:deploy
```

If Expo push-token enhanced security is enabled, add its token before deploying:

```bash
npx supabase secrets set EXPO_ACCESS_TOKEN=YOUR_EXPO_ACCESS_TOKEN
```

Adult invitation emails require Resend and a verified sending domain:

```bash
npx supabase secrets set RESEND_API_KEY=YOUR_RESEND_API_KEY
npx supabase secrets set KUDOS_INVITE_FROM="Kudos Family <welcome@YOUR_DOMAIN>"
```

This deploys:

- `task-action` — direct completion, child requests, approval/denial, push alerts
- `reward-action` — transactional redemption, child delivery, push alerts
- `profile-invite` — create and accept child-account invitations
- `adult-invite` — email, accept, list, cancel, and manage adult access invitations
- `register-device` — save Expo push tokens
- `migrate-local-data` — one-time upload of the previous AsyncStorage dataset

Supabase automatically provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to hosted Edge Functions. Do not expose the service-role key to the mobile client.

## 6. Configure authentication

In Supabase Authentication:

1. Enable Email authentication.
2. Decide whether email confirmation is required.
3. Add `kudosfamily://auth-callback` to the allowed redirect URLs.
4. Set an appropriate production site URL.
5. Configure SMTP before a public launch so confirmation and reset emails use your own sender.

Parents and teachers create regular accounts. A manager generates a profile invitation from Settings > Kudos Cloud account. The child creates a separate account and enters that temporary code during workspace setup. The database links that Auth user to exactly one child profile. A parent can also email a 48-hour adult invitation; the recipient must verify and sign in with the invited email before joining with full parent access.

## 7. Configure EAS and push notifications

Remote push notifications require an Expo development or production build.

```bash
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build --profile development --platform android
npx eas-cli@latest build --profile development --platform ios
```

Complete the Android FCM and iOS APNs credential prompts in EAS. The app registers the device token after a workspace opens. Edge Functions notify:

- Parents/teachers when a child submits a task
- Children when a request is approved or denied
- Children when a reward is delivered

For EAS builds, add the two `EXPO_PUBLIC_SUPABASE_*` values to the selected EAS environment through the Expo dashboard or EAS environment commands.

## 8. Run locally

Against the hosted Supabase project:

```bash
npm start
```

For a local Supabase stack:

```bash
npm run supabase:start
npm run supabase:reset
```

Use the local API URL and anon/publishable key printed by the CLI in `.env`. Stop it with:

```bash
npm run supabase:stop
```

## 9. Local-to-cloud migration

After a parent or teacher signs in and creates a workspace, BrightSteps checks the previous AsyncStorage keys. If local profiles, tasks, or rewards exist, it offers a one-time upload.

The migration:

- Uploads custom profile/task/reward images to private Storage
- Imports reusable tasks and rewards
- Preserves assignments, completion events, balances, requests, redemptions, and reward deliveries
- Records completion so the prompt is not shown again
- Uses idempotent upserts so a retry can safely continue a partial import

## 10. Cross-device behavior

Supabase Postgres is the source of truth. The app also keeps:

- A workspace-specific AsyncStorage cache for fast startup and offline viewing
- A persistent mutation queue for edits made while disconnected
- Realtime subscriptions for profiles, tasks, assignments, requests, rewards, redemptions, deliveries, and ledger changes

When connectivity returns, queued changes are uploaded and the workspace is refreshed.

## 11. Security model

- Parents and teachers can manage all data in their workspace.
- Linked children can read only their own profile, assignments, completions, rewards, balance activity, requests, and deliveries.
- Children can submit task requests and open delivered rewards only through protected database functions.
- Task awards and reward deductions are written to an immutable-style currency ledger.
- Reward redemption and balance deduction occur in one database transaction.
- Custom images are stored in a private bucket and displayed with temporary signed URLs.
- The Expo client contains only public Supabase credentials; RLS is always the authorization boundary.

## 12. Production checklist

Before release:

- Replace `com.example.brightsteps` in `app.json` with identifiers you own.
- Run `npx eas-cli@latest init` and commit the generated project ID.
- Configure production Supabase Auth redirect URLs and SMTP.
- Test RLS with separate parent, teacher, and child accounts.
- Test offline queue recovery after force-closing the app.
- Test notification delivery on physical Android and iOS devices.
- Configure database backups and Supabase project spending limits.
- Review privacy requirements for storing children’s names and photos.
- Add account deletion, data export, retention, and consent flows before a public child-directed launch.
