import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { endConnection, getAvailablePurchases, initConnection } from 'expo-iap';
import { reconcileMissingApplePurchase, verifyWorkspacePurchase } from './entitlements';
import { LIFETIME_PRODUCT_ID, type EvaluatedEntitlement } from './entitlementPolicy';

export function useApplePurchaseReconciliation({ enabled, onReconciled, userId, workspaceId }: {
  enabled: boolean;
  onReconciled: (entitlement: EvaluatedEntitlement) => void;
  userId: string;
  workspaceId: string;
}) {
  useEffect(() => {
    if (!enabled || Platform.OS !== 'ios') return;
    let mounted = true;
    let connected = false;
    let running = false;

    const reconcile = async () => {
      if (!mounted || running) return;
      running = true;
      try {
        connected = Boolean(await initConnection()) || connected;
        if (!connected || !mounted) return;
        // A successful StoreKit response is required before absence can revoke
        // Apple purchase access. Network/App Store failures leave cached access intact.
        const purchases = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
        if (!mounted) return;
        const lifetime = purchases.find((purchase) => purchase.productId === LIFETIME_PRODUCT_ID);
        const result = lifetime
          ? await verifyWorkspacePurchase(userId, workspaceId, lifetime)
          : await reconcileMissingApplePurchase(userId, workspaceId);
        if (mounted) onReconciled(result);
      } catch {
        // Temporary App Store failures must not lock a family out. The next app
        // launch or foreground transition attempts reconciliation again.
      } finally {
        running = false;
      }
    };

    void reconcile();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void reconcile();
    });

    return () => {
      mounted = false;
      subscription.remove();
      if (connected) void endConnection().catch(() => undefined);
    };
  }, [enabled, onReconciled, userId, workspaceId]);
}
