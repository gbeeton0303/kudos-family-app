import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  LIFETIME_PRODUCT_ID,
  OFFLINE_TRIAL_GRACE_MS,
  evaluateEntitlement,
} from '../src/purchases/entitlementPolicy.ts';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');
const DAY = 24 * 60 * 60 * 1000;

function entitlement(overrides = {}) {
  return {
    workspaceId: 'workspace-a',
    status: 'not_started',
    canAccess: false,
    canPurchase: true,
    isBillingOwner: true,
    role: 'parent',
    trialStartedAt: null,
    trialExpiresAt: null,
    lifetimeUnlockedAt: null,
    lastVerifiedAt: null,
    checkedAt: '2026-09-06T12:00:00.000Z',
    ...overrides,
  };
}

test('the seven-day trial remains active before its server expiration and ends afterward', () => {
  const start = Date.parse('2026-09-06T12:00:00.000Z');
  const trial = entitlement({
    status: 'trial',
    canAccess: true,
    trialStartedAt: new Date(start).toISOString(),
    trialExpiresAt: new Date(start + 7 * DAY).toISOString(),
  });
  assert.equal(evaluateEntitlement(trial, start + 7 * DAY - 1).canAccess, true);
  const expired = evaluateEntitlement(trial, start + 7 * DAY, 'online');
  assert.equal(expired.canAccess, false);
  assert.equal(expired.status, 'expired');
});

test('temporary internet loss receives a bounded grace period, not a permanent trial', () => {
  const expires = Date.parse('2026-09-13T12:00:00.000Z');
  const trial = entitlement({ status: 'trial', canAccess: true, trialExpiresAt: new Date(expires).toISOString() });
  const grace = evaluateEntitlement(trial, expires + OFFLINE_TRIAL_GRACE_MS - 1, 'offline');
  assert.equal(grace.canAccess, true);
  assert.equal(grace.isOfflineGrace, true);
  assert.equal(evaluateEntitlement(trial, expires + OFFLINE_TRIAL_GRACE_MS + 1, 'offline').canAccess, false);
});

test('a backend-verified lifetime unlock remains available from the local cache offline', () => {
  const unlocked = entitlement({
    status: 'lifetime',
    canAccess: true,
    lifetimeUnlockedAt: '2026-09-06T12:00:00.000Z',
  });
  const yearsLater = Date.parse('2036-09-06T12:00:00.000Z');
  const result = evaluateEntitlement(unlocked, yearsLater, 'offline');
  assert.equal(result.canAccess, true);
  assert.equal(result.source, 'offline');
});

test('trial starts through Kudos Cloud while lifetime purchases verify before finishing', async () => {
  const screen = await read('../src/screens/PurchaseAccessScreen.tsx');
  const verifyAt = screen.indexOf('await verifyWorkspacePurchase');
  const finishAt = screen.indexOf('await finishTransaction', verifyAt);
  assert.match(screen, /getAvailablePurchases\(\{ onlyIncludeActiveItemsIOS: true \}\)/);
  assert.match(screen, /openRedeemOfferCode/);
  assert.match(screen, /Redeem Offer Code/);
  assert.match(screen, /const redeemOfferCode = async/);
  assert.ok(verifyAt >= 0 && finishAt > verifyAt, 'StoreKit transactions must be verified before they are finished');
  assert.match(screen, /appAccountToken: userId/);
  assert.match(screen, /await startWorkspaceTrial\(userId, access\.workspaceId\)/);
  assert.match(screen, /beginPurchase\(LIFETIME_PRODUCT_ID\)/);
  assert.doesNotMatch(screen, /beginPurchase\(TRIAL_PRODUCT_ID\)/);
  assert.match(screen, /The trial does not auto-renew/);
  assert.match(screen, /access\.workspaceType === 'classroom'/);
  assert.match(screen, /Lifetime \{workspaceNoun\} access/);
  assert.match(screen, /assets\/category\/rewards\.png/);
  assert.match(screen, /lifetimeFeatures\.map/);
  assert.doesNotMatch(screen, /<Text style=\{styles\.planIcon\}>🎉<\/Text>/);
});

test('server-managed trial uses one trusted seven-day workspace window', async () => {
  const migration = await read('../supabase/migrations/20260907000100_server_managed_trial.sql');
  const edge = await read('../supabase/functions/entitlement-action/index.ts');
  assert.match(migration, /create or replace function public\.start_workspace_trial/);
  assert.match(migration, /v_started_at \+ interval '7 days'/);
  assert.match(migration, /if v_entitlement\.status = 'trial'/);
  assert.match(migration, /grant execute on function public\.start_workspace_trial\(uuid, uuid\) to service_role/);
  assert.match(edge, /action === 'start_trial'/);
  assert.match(edge, /Only the family or classroom creator can start the free trial/);
});

test('workspace entitlement is shared across adults while purchase authority belongs to the creator', async () => {
  const migration = await read('../supabase/migrations/20260906000100_workspace_entitlements.sql');
  const edge = await read('../supabase/functions/entitlement-action/index.ts');
  assert.match(migration, /workspace_id uuid primary key/);
  assert.match(migration, /billing_owner_id uuid references auth\.users\(id\) on delete set null/);
  assert.match(migration, /select id, created_by from public\.workspaces/);
  assert.match(edge, /const canPurchase = manager && \(!entitlement\.billing_owner_id \|\| entitlement\.billing_owner_id === userId\)/);
  assert.match(edge, /canAccess: entitlement\.status === 'lifetime' \|\| trialActive/);
});

test('child accounts never route to a purchase screen and inherit the workspace access result', async () => {
  const app = await read('../App.tsx');
  const screen = await read('../src/screens/PurchaseAccessScreen.tsx');
  assert.match(app, /entitlement\.canPurchase && access\.role !== 'child'/);
  assert.match(app, /WorkspaceAccessPausedScreen/);
  assert.match(screen, /const child = access\.role === 'child'/);
  assert.match(screen, /Ask your \$\{classroom \? 'teacher' : 'parent'\}/);
});

test('the billing owner can upgrade during an active trial from Settings', async () => {
  const app = await read('../App.tsx');
  const settings = await read('../src/screens/SettingsScreen.tsx');
  const purchase = await read('../src/screens/PurchaseAccessScreen.tsx');
  assert.match(app, /entitlement\.status === 'trial' && entitlement\.canPurchase && access\.role !== 'child'/);
  assert.match(app, /showTrialUpgrade=\{canUpgradeDuringTrial\}/);
  assert.match(settings, /Upgrade to lifetime access now!/);
  assert.match(settings, /onOpenLifetimeUpgrade/);
  assert.match(settings, /assets\/category\/rewards\.png/);
  assert.match(purchase, /Your free trial is active/);
  assert.match(purchase, /Back to Settings/);
  assert.match(purchase, /displayPrice \?\? null/);
  assert.match(purchase, /disabled=\{busy \|\| !lifetimePrice\}/);
  assert.match(purchase, /Loading Price…/);
  assert.doesNotMatch(purchase, /\$5\.99/);
  assert.doesNotMatch(settings, /\$5\.99/);
});

test('child device replacement cannot create a second purchase requirement', async () => {
  const migration = await read('../supabase/migrations/20260906000100_workspace_entitlements.sql');
  const profileInvite = await read('../supabase/functions/profile-invite/index.ts');
  assert.doesNotMatch(migration, /linked_profile_id|device_token/i);
  assert.match(profileInvite, /action === 'replace'/);
  assert.match(migration, /workspace_id uuid primary key/);
});

test('backend accepts only recognized products after an authenticated Apple server lookup', async () => {
  const edge = await read('../supabase/functions/entitlement-action/index.ts');
  const client = await read('../src/purchases/entitlements.ts');
  assert.match(edge, /npm:jose\@5\.10\.0/);
  assert.match(edge, /importPKCS8\(privateKey, 'ES256'\)/);
  assert.match(edge, /new SignJWT\(\{ bid: BUNDLE_ID \}\)/);
  assert.match(edge, /https:\/\/api\.storekit\.apple\.com/);
  assert.match(edge, /https:\/\/api\.storekit-sandbox\.apple\.com/);
  assert.match(edge, /transactionEnvironmentHint\(deviceJws\)/);
  assert.match(edge, /if \(!jws\.includes\('\.'\)\) return null/);
  assert.match(edge, /hint === 'Sandbox'/);
  assert.match(edge, /response\.status !== 401 && response\.status !== 404/);
  assert.match(edge, /failures\.every\(\(failure\) => failure\.status === 401\)/);
  assert.doesNotMatch(edge, /crypto\.subtle\.sign/);
  assert.match(edge, /verified\.bundleId !== BUNDLE_ID/);
  assert.match(edge, /verified\.transactionId !== requestedTransactionId/);
  assert.match(edge, /requirePurchaseAccountMatch\(admin, verified, user\.id\)/);
  assert.match(edge, /verified\.offerType === 3 && verified\.offerIdentifier\?\.trim\(\)/);
  assert.match(edge, /transaction ledger prevents one code from unlocking two workspaces/);
  assert.match(edge, /admin\.auth\.admin\.getUserById\(normalizedToken\)/);
  assert.match(edge, /different active Kudos adult account/);
  assert.match(edge, /same Apple transaction from unlocking a second active workspace/);
  assert.match(edge, /verified\.revocationDate/);
  assert.match(edge, /apply_verified_app_store_transaction/);
  assert.doesNotMatch(edge, /!purchaseToken\.includes\('\.'\)/);
  assert.match(client, /purchaseToken: purchase\.purchaseToken \?\? ''/);
  assert.equal(LIFETIME_PRODUCT_ID, 'com.beeton.kudosfamily.lifetime');
  assert.doesNotMatch(edge, /com\.beeton\.kudosfamily\.trial\.7day/);
});

test('new adult accounts record acceptance of the purchase-aware legal documents', async () => {
  const legal = await read('../src/legal.ts');
  const migration = await read('../supabase/migrations/20260906000100_workspace_entitlements.sql');
  assert.match(legal, /TERMS_VERSION = '2026-09-06'/);
  assert.match(legal, /PRIVACY_VERSION = '2026-10-10'/);
  const childMigration = await read('../supabase/migrations/20261010154920_persistent_child_login_security.sql');
  assert.match(childMigration, /v_privacy in \('2026-09-06','2026-10-10'\)/);
  assert.match(migration, /v_terms = '2026-09-06' and v_privacy = '2026-09-06'/);
});

test('configured production sign-in does not expose the unlimited local demo bypass', async () => {
  const authScreen = await read('../src/screens/AuthScreen.tsx');
  const setupScreen = await read('../src/screens/CloudSetupScreen.tsx');
  assert.doesNotMatch(authScreen, /Continue with a local-only demo/);
  assert.doesNotMatch(authScreen, /onUseLocalDemo/);
  assert.match(setupScreen, /__DEV__ \?/);
});

test('Apple Family Sharing transactions can unlock a separate adult account securely', async () => {
  const edge = await read('../supabase/functions/entitlement-action/index.ts');
  const migration = await read('../supabase/migrations/20260928001705_apple_family_sharing_entitlements.sql');
  assert.match(edge, /verified\.inAppOwnershipType === 'FAMILY_SHARED'/);
  assert.match(edge, /p_ownership_type: ownershipType/);
  assert.match(edge, /if \(verified\.revocationDate\)[\s\S]*revoke_verified_app_store_entitlement/);
  assert.match(migration, /ownership_type in \('PURCHASED', 'FAMILY_SHARED'\)/);
  assert.match(migration, /source_ownership_type = p_ownership_type/);
  assert.match(migration, /v_existing_purchaser is distinct from p_purchaser_user_id/);
  assert.match(migration, /grant execute on function public\.apply_verified_app_store_transaction[\s\S]*to service_role/);
});

test('family-shared access is removed only after a successful StoreKit reconciliation', async () => {
  const hook = await read('../src/purchases/useFamilySharingReconciliation.ts');
  const app = await read('../App.tsx');
  const migration = await read('../supabase/migrations/20260928001705_apple_family_sharing_entitlements.sql');
  assert.match(hook, /await getAvailablePurchases\(\{ onlyIncludeActiveItemsIOS: true \}\)/);
  assert.match(hook, /reconcileMissingApplePurchase/);
  assert.match(hook, /Temporary App Store failures must not lock a family out/);
  assert.match(hook, /AppState\.addEventListener\('change'/);
  assert.match(app, /Boolean\(entitlement\.ownershipType\)/);
  assert.match(app, /entitlement\.isBillingOwner/);
  assert.match(migration, /revoke_missing_apple_entitlement/);
  assert.match(migration, /and we\.source_ownership_type in \('PURCHASED', 'FAMILY_SHARED'\)/);
  assert.match(migration, /revoke all on function public\.revoke_missing_apple_entitlement[\s\S]*authenticated/);
});

test('the purchase page identifies Apple Family Sharing support from StoreKit metadata', async () => {
  const screen = await read('../src/screens/PurchaseAccessScreen.tsx');
  assert.match(screen, /isFamilyShareableIOS/);
  assert.match(screen, /Eligible Apple Family Sharing members can restore access/);
  assert.match(screen, /members of the purchaser’s Apple Family can restore/);
});
