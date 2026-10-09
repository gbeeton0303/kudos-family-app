// A missing device receipt is not proof that a non-consumable was refunded.
// Only an authenticated App Store lookup may revoke a direct purchase.
type Transaction = {
  bundleId?: string;
  productId?: string;
  transactionId?: string;
  revocationDate?: number;
};

export async function reconcileAppleEntitlement(
  admin: any,
  workspaceId: string,
  userId: string,
  bundleId: string,
  productId: string,
  lookup: (transactionId: string, deviceJws: string) => Promise<Transaction>,
) {
  const { data: entitlement, error } = await admin.from('workspace_entitlements')
    .select('status,source_ownership_type,source_transaction_id')
    .eq('workspace_id', workspaceId).maybeSingle();
  if (error) throw error;
  if (entitlement?.status !== 'lifetime') return;
  if (entitlement.source_ownership_type === 'FAMILY_SHARED') {
    const result = await admin.rpc('revoke_missing_apple_entitlement', {
      p_workspace_id: workspaceId, p_requester_user_id: userId,
    });
    if (result.error) throw new Error(result.error.message);
    return;
  }
  const transactionId = entitlement.source_transaction_id;
  if (!transactionId) return;
  let verified: Transaction;
  try {
    verified = await lookup(transactionId, '');
  } catch {
    // Apple outages, credential errors, or a temporary 404 must not lock users out.
    console.warn('Retained direct lifetime access: Apple reconciliation unavailable.');
    return;
  }
  if (verified.bundleId !== bundleId || verified.productId !== productId
    || verified.transactionId !== transactionId) {
    console.warn('Retained direct lifetime access: Apple reconciliation mismatch.');
    return;
  }
  if (!verified.revocationDate) return;
  const result = await admin.rpc('revoke_verified_app_store_entitlement', {
    p_workspace_id: workspaceId, p_requester_user_id: userId,
    p_transaction_id: transactionId,
  });
  if (result.error) throw new Error(result.error.message);
}
