export const LIFETIME_PRODUCT_ID = 'com.beeton.kudosfamily.lifetime';
export const KUDOS_PRODUCT_IDS = [LIFETIME_PRODUCT_ID] as const;
export const TRIAL_LENGTH_DAYS = 7;
export const OFFLINE_TRIAL_GRACE_MS = 24 * 60 * 60 * 1000;

export type WorkspaceEntitlementStatus = 'not_started' | 'trial' | 'expired' | 'lifetime';

export type WorkspaceEntitlement = {
  workspaceId: string;
  status: WorkspaceEntitlementStatus;
  canAccess: boolean;
  canPurchase: boolean;
  isBillingOwner: boolean;
  role: 'parent' | 'teacher' | 'child';
  trialStartedAt: string | null;
  trialExpiresAt: string | null;
  lifetimeUnlockedAt: string | null;
  lastVerifiedAt: string | null;
  ownershipType?: 'PURCHASED' | 'FAMILY_SHARED' | null;
  checkedAt: string;
};

export type EvaluatedEntitlement = WorkspaceEntitlement & {
  source: 'online' | 'offline';
  isOfflineGrace: boolean;
};

export function evaluateEntitlement(
  entitlement: WorkspaceEntitlement,
  now = Date.now(),
  source: EvaluatedEntitlement['source'] = 'online',
): EvaluatedEntitlement {
  if (entitlement.status === 'lifetime') {
    return { ...entitlement, canAccess: true, source, isOfflineGrace: false };
  }

  if (entitlement.status === 'trial' && entitlement.trialExpiresAt) {
    const expiresAt = new Date(entitlement.trialExpiresAt).getTime();
    const trialActive = Number.isFinite(expiresAt) && now < expiresAt;
    const offlineGrace = source === 'offline'
      && Number.isFinite(expiresAt)
      && now >= expiresAt
      && now <= expiresAt + OFFLINE_TRIAL_GRACE_MS;
    return {
      ...entitlement,
      status: trialActive || offlineGrace ? 'trial' : 'expired',
      canAccess: trialActive || offlineGrace,
      source,
      isOfflineGrace: offlineGrace,
    };
  }

  return {
    ...entitlement,
    status: entitlement.status === 'trial' ? 'expired' : entitlement.status,
    canAccess: false,
    source,
    isOfflineGrace: false,
  };
}

export function trialDaysRemaining(entitlement: WorkspaceEntitlement, now = Date.now()) {
  if (!entitlement.trialExpiresAt) return 0;
  const remaining = new Date(entitlement.trialExpiresAt).getTime() - now;
  return Math.max(0, Math.ceil(remaining / (24 * 60 * 60 * 1000)));
}
