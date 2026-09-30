import fs from 'node:fs';

const requiredFiles = [
  'supabase/config.toml',
  'supabase/migrations/20260721000100_brightsteps_cloud_schema.sql',
  'supabase/migrations/20260821000100_harden_child_invites.sql',
  'supabase/functions/task-action/index.ts',
  'supabase/functions/reward-action/index.ts',
  'supabase/functions/profile-invite/index.ts',
  'supabase/functions/register-device/index.ts',
  'supabase/functions/migrate-local-data/index.ts',
  'supabase/functions/delete-account/index.ts',
];

let failed = false;
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`Missing: ${file}`);
    failed = true;
  }
}

const envPath = '.env';
if (!fs.existsSync(envPath)) {
  console.warn('No .env file found. Copy .env.example to .env before starting Expo.');
} else {
  const text = fs.readFileSync(envPath, 'utf8');
  for (const key of ['EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY']) {
    const match = text.match(new RegExp(`^${key}=(.+)$`, 'm'));
    if (!match || !match[1].trim() || match[1].includes('YOUR_')) {
      console.error(`${key} is missing or still contains a placeholder.`);
      failed = true;
    }
  }
}

const app = JSON.parse(fs.readFileSync('app.json', 'utf8'));
if (String(app.expo?.ios?.bundleIdentifier ?? '').startsWith('com.example.')) {
  console.warn('Replace the placeholder iOS bundle identifier before publishing.');
}
if (String(app.expo?.android?.package ?? '').startsWith('com.example.')) {
  console.warn('Replace the placeholder Android package before publishing.');
}

if (failed) process.exit(1);
console.log('BrightSteps cloud files are present. Continue with CLOUD_SETUP.md.');
