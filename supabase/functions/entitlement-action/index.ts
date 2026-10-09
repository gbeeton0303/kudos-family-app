import { corsHeaders, jsonResponse } from '../_shared/cors.ts';
import { requireUser, serviceClient } from '../_shared/supabase.ts';
import { importPKCS8, SignJWT } from 'npm:jose@5.10.0';
import { reconcileAppleEntitlement } from '../_shared/entitlement-reconciliation.ts';

const BUNDLE_ID = Deno.env.get('APPLE_IAP_BUNDLE_ID')?.trim() || 'com.beeton.kudosfamily';
const LIFETIME_PRODUCT_ID = 'com.beeton.kudosfamily.lifetime';
const PRODUCT_IDS = new Set([LIFETIME_PRODUCT_ID]);
const APPLE_PRODUCTION_API = 'https://api.storekit.apple.com';
const APPLE_SANDBOX_API = 'https://api.storekit-sandbox.apple.com';

type AppleEnvironment = 'Production' | 'Sandbox';

type VerifiedTransaction = {
  appAccountToken?: string;
  bundleId?: string;
  environment?: string;
  inAppOwnershipType?: 'PURCHASED' | 'FAMILY_SHARED' | string;
  offerIdentifier?: string;
  offerType?: number;
  originalTransactionId?: string;
  productId?: string;
  purchaseDate?: number;
  revocationDate?: number;
  transactionId?: string;
  type?: string;
};

function decodeJwsPayload(jws: string): VerifiedTransaction {
  const payload = jws.split('.')[1];
  if (!payload) throw new Error('Apple returned an invalid signed transaction.');
  const padded = payload.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - payload.length % 4) % 4);
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as VerifiedTransaction;
}

function transactionEnvironmentHint(jws: string): AppleEnvironment | null {
  if (!jws.includes('.')) return null;
  try {
    const environment = decodeJwsPayload(jws).environment;
    if (environment === 'Production' || environment === 'Sandbox') return environment;
  } catch {
    // The device JWS is only an endpoint hint. Apple remains the authority.
  }
  return null;
}

function appStoreCredentials() {
  const issuerId = Deno.env.get('APPLE_IAP_ISSUER_ID')?.trim();
  const keyId = Deno.env.get('APPLE_IAP_KEY_ID')?.trim();
  let privateKey = Deno.env.get('APPLE_IAP_PRIVATE_KEY')?.trim();
  if (!issuerId || !keyId || !privateKey) {
    throw new Error('Apple purchase verification is not configured. Add APPLE_IAP_ISSUER_ID, APPLE_IAP_KEY_ID, and APPLE_IAP_PRIVATE_KEY to this Supabase project.');
  }

  // Supabase accepts either real PEM line breaks or a single-line secret with
  // escaped line breaks. Rebuild a canonical PKCS#8 PEM before importing it.
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    try {
      privateKey = JSON.parse(privateKey);
    } catch {
      privateKey = privateKey.slice(1, -1);
    }
  } else if (privateKey.startsWith("'") && privateKey.endsWith("'")) {
    privateKey = privateKey.slice(1, -1);
  }
  privateKey = privateKey.replaceAll('\\r', '').replaceAll('\\n', '\n').replaceAll('\r', '');
  const match = privateKey.match(/-----BEGIN PRIVATE KEY-----([\s\S]*?)-----END PRIVATE KEY-----/);
  const body = match?.[1]?.replace(/\s/g, '') ?? '';
  if (!body || !/^[A-Za-z0-9+/]+={0,2}$/.test(body)) {
    throw new Error('APPLE_IAP_PRIVATE_KEY is not a valid App Store Connect In-App Purchase private key.');
  }
  try {
    atob(body);
  } catch {
    throw new Error('APPLE_IAP_PRIVATE_KEY contains invalid base64 key data.');
  }
  const wrappedBody = body.match(/.{1,64}/g)?.join('\n');
  privateKey = `-----BEGIN PRIVATE KEY-----\n${wrappedBody}\n-----END PRIVATE KEY-----`;
  return { issuerId, keyId, privateKey };
}

async function appStoreConnectToken() {
  const { privateKey, keyId, issuerId } = appStoreCredentials();
  const signingKey = await importPKCS8(privateKey, 'ES256');
  return new SignJWT({ bid: BUNDLE_ID })
    .setProtectedHeader({ alg: 'ES256', kid: keyId, typ: 'JWT' })
    .setIssuer(issuerId)
    .setAudience('appstoreconnect-v1')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(signingKey);
}

function purchaseVerificationError(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  console.error('App Store transaction lookup failed', 0, null, message.slice(0, 500));
  throw new Error('Apple could not verify this purchase. Please try again or use Restore Purchases.');
}

async function fetchVerifiedTransaction(transactionId: string, deviceJws: string) {
  let token: string;
  try {
    token = await appStoreConnectToken();
  } catch (tokenError) {
    purchaseVerificationError(tokenError);
  }

  const request = async (environment: AppleEnvironment) => fetch(
    `${environment === 'Sandbox' ? APPLE_SANDBOX_API : APPLE_PRODUCTION_API}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
    {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'KudosFamily/3.9.67',
      },
    },
  );

  const hint = transactionEnvironmentHint(deviceJws);
  const environments: AppleEnvironment[] = hint === 'Sandbox'
    ? ['Sandbox', 'Production']
    : ['Production', 'Sandbox'];
  const failures: Array<{ environment: AppleEnvironment; status: number; detail: string }> = [];

  for (const environment of environments) {
    let response: Response;
    try {
      response = await request(environment);
    } catch (requestError) {
      purchaseVerificationError(requestError);
    }
    if (response.ok) {
      const result = await response.json();
      if (typeof result?.signedTransactionInfo !== 'string') {
        throw new Error('Apple did not return a signed transaction.');
      }
      return decodeJwsPayload(result.signedTransactionInfo);
    }

    const detail = await response.text().catch(() => '');
    failures.push({ environment, status: response.status, detail: detail.slice(0, 500) });
    // An unreleased app can return 401 from production for a Sandbox purchase.
    if (response.status !== 401 && response.status !== 404) break;
  }

  console.error('App Store transaction lookup failed', JSON.stringify(failures));
  if (failures.length === 2 && failures.every((failure) => failure.status === 401)) {
    throw new Error('Apple rejected the server purchase credentials. Confirm the In-App Purchase key, Key ID, and Issuer ID in Kudos Cloud.');
  }
  throw new Error('Apple could not find this purchase in either the Sandbox or production store. Please use the Apple ID that originally purchased it.');
}

async function requireMembership(admin: ReturnType<typeof serviceClient>, workspaceId: string, userId: string) {
  const { data, error } = await admin
    .from('workspace_members')
    .select('role')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('You no longer have access to this family or classroom.');
  return data.role as 'parent' | 'teacher' | 'child';
}

async function requirePurchaseAccountMatch(
  admin: ReturnType<typeof serviceClient>,
  verified: VerifiedTransaction,
  currentUserId: string,
) {
  // Family Sharing gives each entitled Apple family member a separate,
  // Apple-signed transaction. It may retain the original purchaser's account
  // token, so Apple ownership—not appAccountToken—is authoritative here.
  if (verified.inAppOwnershipType === 'FAMILY_SHARED') return;

  const normalizedToken = verified.appAccountToken?.toLowerCase();
  if (!normalizedToken) {
    // Apple's system offer-code sheet cannot receive an appAccountToken. Only
    // accept that missing binding when Apple's signed transaction explicitly
    // identifies a configured offer-code redemption. The caller has already
    // established that this user is the workspace's purchasing authority, and
    // the transaction ledger prevents one code from unlocking two workspaces.
    if (verified.offerType === 3 && verified.offerIdentifier?.trim()) return;
    throw new Error('Apple did not return the Kudos account attached to this purchase.');
  }
  if (normalizedToken === currentUserId.toLowerCase()) return;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedToken)) {
    throw new Error('This purchase belongs to a different Kudos adult account.');
  }

  // A recreated email receives a new Supabase UUID. Permit the Apple owner to
  // reclaim the purchase only when the UUID originally attached by StoreKit no
  // longer belongs to an active Auth user. The transaction table still prevents
  // the same Apple transaction from unlocking a second active workspace.
  const { data, error } = await admin.auth.admin.getUserById(normalizedToken);
  if (data?.user) throw new Error('This purchase belongs to a different active Kudos adult account.');
  if (error && error.status !== 404 && !/not found/i.test(error.message)) {
    console.error('Could not confirm deleted purchase owner', error.status ?? null, error.message.slice(0, 300));
    throw new Error('Kudos could not safely confirm the previous purchase owner. Please try again.');
  }
}

async function entitlementStatus(admin: ReturnType<typeof serviceClient>, workspaceId: string, userId: string) {
  const role = await requireMembership(admin, workspaceId, userId);
  let { data: entitlement, error } = await admin
    .from('workspace_entitlements')
    .select('status,billing_owner_id,trial_started_at,trial_expires_at,lifetime_unlocked_at,last_verified_at,source_ownership_type')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error) throw error;

  if (!entitlement) {
    const { data: workspace, error: workspaceError } = await admin
      .from('workspaces')
      .select('created_by')
      .eq('id', workspaceId)
      .single();
    if (workspaceError) throw workspaceError;
    const created = await admin
      .from('workspace_entitlements')
      .upsert({ workspace_id: workspaceId, billing_owner_id: workspace.created_by }, { onConflict: 'workspace_id' })
      .select('status,billing_owner_id,trial_started_at,trial_expires_at,lifetime_unlocked_at,last_verified_at,source_ownership_type')
      .single();
    if (created.error) throw created.error;
    entitlement = created.data;
  }

  const checkedAt = new Date();
  const expiresAt = entitlement.trial_expires_at ? new Date(entitlement.trial_expires_at) : null;
  const trialActive = entitlement.status === 'trial' && Boolean(expiresAt && expiresAt.getTime() > checkedAt.getTime());
  const normalizedStatus = entitlement.status === 'trial' && !trialActive ? 'expired' : entitlement.status;
  const manager = role === 'parent' || role === 'teacher';
  const canPurchase = manager && (!entitlement.billing_owner_id || entitlement.billing_owner_id === userId);

  return {
    workspaceId,
    status: normalizedStatus,
    canAccess: entitlement.status === 'lifetime' || trialActive,
    canPurchase,
    isBillingOwner: canPurchase,
    role,
    trialStartedAt: entitlement.trial_started_at,
    trialExpiresAt: entitlement.trial_expires_at,
    lifetimeUnlockedAt: entitlement.lifetime_unlocked_at,
    lastVerifiedAt: entitlement.last_verified_at,
    ownershipType: entitlement.source_ownership_type,
    checkedAt: checkedAt.toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const { user } = await requireUser(req);
    const admin = serviceClient();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'status');
    const workspaceId = String(body.workspaceId ?? '');
    if (!workspaceId) throw new Error('A workspace is required.');

    if (action === 'status') {
      return jsonResponse({ data: await entitlementStatus(admin, workspaceId, user.id) });
    }

    if (action === 'start_trial') {
      const before = await entitlementStatus(admin, workspaceId, user.id);
      if (!before.canPurchase) throw new Error('Only the family or classroom creator can start the free trial.');
      const { error: trialError } = await admin.rpc('start_workspace_trial', {
        p_workspace_id: workspaceId,
        p_requester_user_id: user.id,
      });
      if (trialError) throw new Error(trialError.message);
      return jsonResponse({ data: await entitlementStatus(admin, workspaceId, user.id) });
    }

    if (action === 'reconcile_apple_entitlement') {
      const before = await entitlementStatus(admin, workspaceId, user.id);
      if (!before.isBillingOwner) throw new Error('Only the workspace creator can reconcile Apple purchase access.');
      await reconcileAppleEntitlement(
        admin, workspaceId, user.id, BUNDLE_ID, LIFETIME_PRODUCT_ID, fetchVerifiedTransaction,
      );
      return jsonResponse({ data: await entitlementStatus(admin, workspaceId, user.id) });
    }

    if (action === 'verify') {
      const role = await requireMembership(admin, workspaceId, user.id);
      if (!['parent', 'teacher'].includes(role)) throw new Error('Child accounts cannot manage purchases.');

      const requestedProductId = String(body.productId ?? '');
      const requestedTransactionId = String(body.transactionId ?? '');
      const purchaseToken = String(body.purchaseToken ?? '');
      if (!PRODUCT_IDS.has(requestedProductId) || !requestedTransactionId) {
        throw new Error('The App Store purchase information is incomplete.');
      }

      // Confirm purchasing authority before performing the Apple request.
      const before = await entitlementStatus(admin, workspaceId, user.id);
      if (!before.canPurchase) throw new Error('Only the family or classroom creator can manage this purchase.');

      const verified = await fetchVerifiedTransaction(requestedTransactionId, purchaseToken);
      if (verified.bundleId !== BUNDLE_ID) throw new Error('This purchase belongs to a different app.');
      if (verified.transactionId !== requestedTransactionId) throw new Error('The verified transaction does not match this purchase.');
      if (verified.productId !== requestedProductId || !PRODUCT_IDS.has(verified.productId)) throw new Error('The verified App Store product does not match this purchase.');
      const ownershipType = verified.inAppOwnershipType === 'FAMILY_SHARED' ? 'FAMILY_SHARED' : 'PURCHASED';
      await requirePurchaseAccountMatch(admin, verified, user.id);
      if (verified.revocationDate) {
        const { error: revokeError } = await admin.rpc('revoke_verified_app_store_entitlement', {
          p_workspace_id: workspaceId,
          p_requester_user_id: user.id,
          p_transaction_id: verified.transactionId,
        });
        if (revokeError) throw new Error(revokeError.message);
        return jsonResponse({ data: await entitlementStatus(admin, workspaceId, user.id) });
      }
      if (verified.type && verified.type !== 'Non-Consumable') throw new Error('This purchase is not a lifetime entitlement.');
      if (!verified.purchaseDate || !Number.isFinite(verified.purchaseDate)) throw new Error('Apple did not return a valid purchase date.');

      const { error: applyError } = await admin.rpc('apply_verified_app_store_transaction', {
        p_workspace_id: workspaceId,
        p_purchaser_user_id: user.id,
        p_product_id: verified.productId,
        p_transaction_id: verified.transactionId,
        p_original_transaction_id: verified.originalTransactionId ?? '',
        p_environment: verified.environment ?? 'Unknown',
        p_purchase_date: new Date(verified.purchaseDate).toISOString(),
        p_ownership_type: ownershipType,
      });
      if (applyError) throw new Error(applyError.message);

      return jsonResponse({ data: await entitlementStatus(admin, workspaceId, user.id) });
    }

    return jsonResponse({ error: 'Unknown entitlement action.' }, 400);
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'The purchase request failed.' }, 400);
  }
});
