import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { getAvailablePurchases, type Purchase, useIAP } from 'expo-iap';
import { SafeAreaView } from 'react-native-safe-area-context';
import { deleteKudosAccount } from '../cloud/accountActions';
import type { WorkspaceAccess } from '../cloud/types';
import { PRIVACY_URL, TERMS_URL } from '../legal';
import { startWorkspaceTrial, verifyWorkspacePurchase } from '../purchases/entitlements';
import {
  KUDOS_PRODUCT_IDS,
  LIFETIME_PRODUCT_ID,
  trialDaysRemaining,
  type EvaluatedEntitlement,
} from '../purchases/entitlementPolicy';
import { darkTheme, lightTheme } from '../theme';

type Props = {
  access: WorkspaceAccess;
  entitlement: EvaluatedEntitlement;
  error?: string | null;
  onClose?: () => void;
  onRefresh: () => Promise<EvaluatedEntitlement | null>;
  onSignOut: () => void;
  onVerified: (entitlement: EvaluatedEntitlement) => void;
  userId: string;
};

function confirmDeleteAccount(access: WorkspaceAccess, onSignOut: () => void) {
  const child = access.role === 'child';
  const workspaceNoun = access.workspaceType === 'classroom' ? 'classroom' : 'family';
  Alert.alert(
    child ? 'Delete your account?' : `Delete ${workspaceNoun} account?`,
    child
      ? 'This permanently deletes your child account, linked profile, and associated data.'
      : `This permanently deletes “${access.workspaceName}”, all of its data, and linked ${access.workspaceType === 'classroom' ? 'student' : 'child'} accounts.`,
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Continue',
        style: 'destructive',
        onPress: () => Alert.alert('Are you absolutely sure?', 'Deleted accounts and data cannot be recovered.', [
          { text: 'Keep Account', style: 'cancel' },
          {
            text: 'Delete Permanently',
            style: 'destructive',
            onPress: () => void deleteKudosAccount(access)
              .then(onSignOut)
              .catch((value) => Alert.alert('Could Not Delete Account', value instanceof Error ? value.message : String(value))),
          },
        ]),
      },
    ],
  );
}

export function PurchaseAccessScreen({ access, entitlement, error, onClose, onRefresh, onSignOut, onVerified, userId }: Props) {
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const [storeError, setStoreError] = useState<string | null>(null);
  const deliveredTransactions = useRef(new Set<string>());

  const handlePurchase = async (purchase: Purchase) => {
    const key = purchase.transactionId || purchase.id;
    if (deliveredTransactions.current.has(key)) return;
    deliveredTransactions.current.add(key);
    try {
      setPendingProductId(purchase.productId);
      const verified = await verifyWorkspacePurchase(userId, access.workspaceId, purchase);
      await finishTransaction({ purchase, isConsumable: false });
      onVerified(verified);
      setStoreError(null);
    } catch (value) {
      deliveredTransactions.current.delete(key);
      const message = value instanceof Error ? value.message : 'Apple could not verify this purchase.';
      setStoreError(message);
      Alert.alert('Purchase not activated', message);
    } finally {
      setPendingProductId(null);
    }
  };

  const { connected, fetchProducts, finishTransaction, openRedeemOfferCode, products, requestPurchase } = useIAP({
    onPurchaseSuccess: (purchase) => { void handlePurchase(purchase); },
    onPurchaseError: (purchaseError) => {
      setPendingProductId(null);
      if (/cancel/i.test(purchaseError.message)) return;
      setStoreError(purchaseError.message || 'The App Store purchase did not complete.');
    },
    onError: (purchaseError) => setStoreError(purchaseError.message),
  });

  useEffect(() => {
    if (!connected || Platform.OS !== 'ios') return;
    void fetchProducts({ skus: [...KUDOS_PRODUCT_IDS], type: 'in-app' });
  }, [connected, fetchProducts]);

  const lifetimeProduct = useMemo(
    () => products.find((product) => product.id === LIFETIME_PRODUCT_ID) ?? null,
    [products],
  );
  const lifetimePrice = lifetimeProduct?.displayPrice ?? null;
  const familySharingAvailable = Boolean(
    lifetimeProduct
      && 'isFamilyShareableIOS' in lifetimeProduct
      && lifetimeProduct.isFamilyShareableIOS,
  );

  const startTrial = async () => {
    setStoreError(null);
    setPendingProductId('trial');
    try {
      const started = await startWorkspaceTrial(userId, access.workspaceId);
      onVerified(started);
    } catch (value) {
      const message = value instanceof Error ? value.message : 'The free trial could not be started.';
      setStoreError(message);
      Alert.alert('Trial not started', message);
    } finally {
      setPendingProductId(null);
    }
  };

  const beginPurchase = async (productId: string) => {
    if (Platform.OS !== 'ios') {
      Alert.alert('iPhone and iPad only', 'This release uses Apple In-App Purchase.');
      return;
    }
    if (!connected) {
      Alert.alert('App Store unavailable', 'Connect to the internet and try again.');
      return;
    }
    if (productId === LIFETIME_PRODUCT_ID && !lifetimePrice) {
      Alert.alert('Price still loading', 'Wait for the App Store price to appear, then try again.');
      return;
    }
    setStoreError(null);
    setPendingProductId(productId);
    try {
      await requestPurchase({
        request: {
          apple: {
            sku: productId,
            appAccountToken: userId,
            andDangerouslyFinishTransactionAutomatically: false,
          },
        },
        type: 'in-app',
      });
    } catch (value) {
      setPendingProductId(null);
      const message = value instanceof Error ? value.message : 'The App Store purchase did not start.';
      if (!/cancel/i.test(message)) setStoreError(message);
    }
  };

  const restore = async () => {
    if (Platform.OS !== 'ios' || !connected) {
      Alert.alert('App Store unavailable', 'Connect to the internet and try again.');
      return;
    }
    setPendingProductId('restore');
    setStoreError(null);
    try {
      const purchases = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
      const candidates = purchases
        .filter((purchase) => KUDOS_PRODUCT_IDS.includes(purchase.productId as typeof KUDOS_PRODUCT_IDS[number]))
        .filter((purchase) => purchase.productId === LIFETIME_PRODUCT_ID);
      if (!candidates.length) throw new Error('No Kudos Family lifetime purchase was found for this Apple ID.');
      await handlePurchase(candidates[0]);
    } catch (value) {
      const message = value instanceof Error ? value.message : 'Purchases could not be restored.';
      setStoreError(message);
      Alert.alert('Nothing restored', message);
    } finally {
      setPendingProductId(null);
    }
  };

  const redeemOfferCode = async () => {
    if (Platform.OS !== 'ios' || !connected) {
      Alert.alert('App Store unavailable', 'Connect to the internet and try again.');
      return;
    }
    setPendingProductId('offer-code');
    setStoreError(null);
    try {
      // Apple owns the secure code-entry sheet. A successful redemption is
      // normally delivered to onPurchaseSuccess; reconcile purchases as a
      // fallback for devices that close the sheet before emitting the update.
      await openRedeemOfferCode();
      const purchases = await getAvailablePurchases({ onlyIncludeActiveItemsIOS: true });
      const lifetime = purchases.find((purchase) => purchase.productId === LIFETIME_PRODUCT_ID);
      if (lifetime) {
        await handlePurchase(lifetime);
      } else {
        Alert.alert(
          'Code submitted',
          'If Apple accepted the code, access will update automatically. You can also tap Check Access Again or Restore Purchases.',
        );
      }
    } catch (value) {
      const message = value instanceof Error ? value.message : 'The offer code screen could not be opened.';
      if (!/cancel/i.test(message)) {
        setStoreError(message);
        Alert.alert('Offer code not redeemed', message);
      }
    } finally {
      setPendingProductId(null);
    }
  };

  const expired = entitlement.status === 'expired';
  const trialActive = entitlement.status === 'trial' && entitlement.canAccess;
  const busy = Boolean(pendingProductId);
  const classroom = access.workspaceType === 'classroom';
  const workspaceNoun = classroom ? 'classroom' : 'family';
  const memberDescription = classroom ? 'every teacher and student profile' : 'every adult and child profile';
  const includedMembers = classroom ? 'All invited teachers and student devices included' : 'All invited adults and child devices included';
  const lifetimeFeatures = [
    'Unlimited profiles, tasks, and rewards',
    'Cloud sync and offline access',
    includedMembers,
    ...(familySharingAvailable ? ['Eligible Apple Family Sharing members can restore access'] : []),
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {onClose ? <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}><Text style={[styles.closeButtonText, { color: theme.primary }]}>‹ Back to Settings</Text></Pressable> : null}
        <View style={[styles.hero, { backgroundColor: theme.surfaceStrong }]}>
          <Text style={styles.sparkles}>✦  ★  ✦</Text>
          <Text style={styles.brand}>Kudos Family</Text>
          <Text style={styles.heroTitle}>{expired ? 'Keep the progress going' : trialActive ? `Unlock your ${workspaceNoun} for life` : `Start your ${workspaceNoun}’s free trial`}</Text>
          <Text style={styles.heroCopy}>One lifetime purchase unlocks both family and classroom workspaces created by this adult account, including {memberDescription}.</Text>
        </View>

        {trialActive ? <View style={[styles.trialActive, { backgroundColor: theme.successSoft, borderColor: theme.success }]}><Text style={[styles.trialActiveTitle, { color: theme.success }]}>✓ Your free trial is active</Text><Text style={[styles.trialActiveText, { color: theme.textMuted }]}>{trialDaysRemaining(entitlement)} day{trialDaysRemaining(entitlement) === 1 ? '' : 's'} remaining · Upgrade now to keep uninterrupted access.</Text></View> : !expired ? <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.planHeading}>
            <View style={styles.planCopy}>
              <Text style={[styles.planTitle, { color: theme.text }]}>7 days free</Text>
              <Text style={[styles.planSubtitle, { color: theme.textMuted }]}>Full {workspaceNoun} access</Text>
            </View>
            <View style={[styles.priceBadge, { backgroundColor: theme.successSoft }]}><Text style={[styles.priceBadgeText, { color: theme.success }]}>$0</Text></View>
          </View>
          <Pressable disabled={busy} onPress={() => void startTrial()} style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.primary }, (pressed || busy) && styles.pressed]}>
            {pendingProductId === 'trial' ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Start 7-Day Free Trial</Text>}
          </Pressable>
          <Text style={[styles.disclosure, { color: theme.textMuted }]}>The trial does not auto-renew. After 7 days, choose the one-time lifetime unlock to continue.</Text>
        </View> : <View style={[styles.trialEnded, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.trialEndedTitle, { color: theme.text }]}>Your 7-day trial is complete</Text><Text style={[styles.trialEndedText, { color: theme.textMuted }]}>Your {workspaceNoun} data and progress are safe. Unlock lifetime access below to continue.</Text></View>}

        <View style={[styles.lifetimeCard, { backgroundColor: theme.rewardSoft, borderColor: theme.reward }]}>
          <Text style={[styles.lifetimeSparkles, { color: theme.reward }]}>✦  LIFETIME  ✦</Text>
          <View style={styles.lifetimeHeading}>
            <View style={[styles.trophyFrame, { backgroundColor: theme.surface, borderColor: theme.reward }]}>
              <Image accessibilityLabel="Reward trophy" resizeMode="contain" source={require('../../assets/category/rewards.png')} style={styles.trophyImage} />
            </View>
            <View style={styles.lifetimeCopy}>
              <Text style={[styles.lifetimeEyebrow, { color: theme.reward }]}>ONE-TIME PURCHASE</Text>
              <Text style={[styles.lifetimeTitle, { color: theme.text }]}>Lifetime {workspaceNoun} access</Text>
              <Text style={[styles.lifetimeText, { color: theme.textMuted }]}>Pay once. No subscription or recurring charge.</Text>
            </View>
          </View>
          <View style={[styles.lifetimePriceBadge, { backgroundColor: theme.surface, borderColor: theme.reward }]}>
            <Text style={[styles.lifetimePriceLabel, { color: theme.textMuted }]}>LIFETIME UNLOCK</Text>
            <Text style={[styles.lifetimePrice, { color: theme.reward }]}>{lifetimePrice ?? 'Loading price…'}</Text>
          </View>
          <View style={[styles.lifetimeBenefits, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            {lifetimeFeatures.map((item) => (
              <View key={item} style={styles.featureRow}><View style={[styles.checkCircle, { backgroundColor: theme.successSoft }]}><Text style={[styles.check, { color: theme.success }]}>✓</Text></View><Text style={[styles.featureText, { color: theme.text }]}>{item}</Text></View>
            ))}
          </View>
          <Pressable disabled={busy || !lifetimePrice} onPress={() => void beginPurchase(LIFETIME_PRODUCT_ID)} style={({ pressed }) => [styles.goldButton, { backgroundColor: theme.reward }, (pressed || busy || !lifetimePrice) && styles.pressed]}>
            {pendingProductId === LIFETIME_PRODUCT_ID ? <ActivityIndicator color="#183437" /> : <Text style={styles.goldButtonText}>{lifetimePrice ? `Unlock for ${lifetimePrice}` : 'Loading Price…'}</Text>}
          </Pressable>
          {Platform.OS === 'ios' ? <Pressable disabled={busy} onPress={() => void redeemOfferCode()} style={({ pressed }) => [styles.offerCodeButton, { borderColor: theme.reward }, (pressed || busy) && styles.pressed]}>
            {pendingProductId === 'offer-code' ? <ActivityIndicator color={theme.reward} /> : <Text style={[styles.offerCodeText, { color: theme.reward }]}>Redeem Offer Code</Text>}
          </Pressable> : null}
          {Platform.OS === 'ios' ? <Text style={[styles.offerCodeHint, { color: theme.textMuted }]}>Have a code? Enter it securely through Apple.</Text> : null}
        </View>

        {storeError || error ? <View style={[styles.errorBox, { backgroundColor: theme.dangerSoft }]}><Text style={[styles.errorText, { color: theme.danger }]}>{storeError || error}</Text></View> : null}

        <Pressable disabled={busy} onPress={() => void restore()} style={styles.linkButton}><Text style={[styles.linkButtonText, { color: theme.primary }]}>Restore Purchases</Text></Pressable>
        <Pressable onPress={() => void onRefresh()} style={styles.linkButton}><Text style={[styles.secondaryLink, { color: theme.textMuted }]}>Check Access Again</Text></Pressable>
        <Text style={[styles.familyNote, { color: theme.textMuted }]}>Only the workspace creator manages payment. Their family and classroom share lifetime access. {classroom ? 'Other teachers and every student profile' : 'Other adults and every child profile'} inherit access automatically.{familySharingAvailable ? ' Eligible members of the purchaser’s Apple Family can restore the shared purchase with their own Apple ID.' : ''}</Text>
        <View style={styles.legalRow}>
          <Pressable onPress={() => void Linking.openURL(TERMS_URL)}><Text style={[styles.legalLink, { color: theme.primary }]}>Terms of Service</Text></Pressable>
          <Text style={{ color: theme.textMuted }}>•</Text>
          <Pressable onPress={() => void Linking.openURL(PRIVACY_URL)}><Text style={[styles.legalLink, { color: theme.primary }]}>Privacy Policy</Text></Pressable>
        </View>
        <Pressable onPress={onSignOut} style={styles.signOut}><Text style={[styles.signOutText, { color: theme.danger }]}>Sign out</Text></Pressable>
        <Pressable onPress={() => confirmDeleteAccount(access, onSignOut)} style={styles.deleteAccess}><Text style={[styles.deleteAccessText, { color: theme.danger }]}>Delete Account &amp; Data</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

export function WorkspaceAccessPausedScreen({ access, entitlement, error, onRefresh, onSignOut }: Omit<Props, 'onVerified' | 'userId'>) {
  const theme = useColorScheme() === 'dark' ? darkTheme : lightTheme;
  const child = access.role === 'child';
  const classroom = access.workspaceType === 'classroom';
  const workspaceNoun = classroom ? 'classroom' : 'family';
  const remaining = trialDaysRemaining(entitlement);
  const offlineUnavailable = Boolean(error && entitlement.source === 'offline' && !entitlement.canAccess);
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <View style={styles.pausedRoot}>
        <View style={[styles.pausedIcon, { backgroundColor: theme.rewardSoft }]}><Text style={styles.pausedEmoji}>{child ? '🏆' : '🔐'}</Text></View>
        <Text style={[styles.pausedTitle, { color: theme.text }]}>{offlineUnavailable ? 'Connect to check access' : child ? `Ask your ${classroom ? 'teacher' : 'parent'}` : `${classroom ? 'Classroom' : 'Family'} access needs attention`}</Text>
        <Text style={[styles.pausedText, { color: theme.textMuted }]}>
          {offlineUnavailable
            ? `Kudos needs a brief internet connection to confirm this ${workspaceNoun}’s trial or lifetime unlock.`
            : child
              ? `Your ${workspaceNoun}’s 7-day trial has ended. Ask your ${classroom ? 'teacher' : 'parent'} to unlock Kudos Family—your profile and progress are still safe.`
              : `The creator of ${access.workspaceName} can start the free trial or purchase lifetime access. You will be unlocked automatically.${remaining ? ` ${remaining} trial days remain.` : ''}`}
        </Text>
        {error ? <Text style={[styles.pausedError, { color: theme.danger }]}>{error}</Text> : null}
        <Pressable onPress={() => void onRefresh()} style={[styles.primaryButton, styles.pausedButton, { backgroundColor: theme.primary }]}><Text style={styles.primaryButtonText}>Check Again</Text></Pressable>
        <Pressable onPress={onSignOut} style={styles.linkButton}><Text style={[styles.signOutText, { color: theme.danger }]}>Sign out</Text></Pressable>
        <View style={styles.legalRow}>
          <Pressable onPress={() => void Linking.openURL(TERMS_URL)}><Text style={[styles.legalLink, { color: theme.primary }]}>Terms of Service</Text></Pressable>
          <Text style={{ color: theme.textMuted }}>•</Text>
          <Pressable onPress={() => void Linking.openURL(PRIVACY_URL)}><Text style={[styles.legalLink, { color: theme.primary }]}>Privacy Policy</Text></Pressable>
        </View>
        <Pressable onPress={() => confirmDeleteAccount(access, onSignOut)} style={styles.deleteAccess}><Text style={[styles.deleteAccessText, { color: theme.danger }]}>Delete Account &amp; Data</Text></Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { alignSelf: 'center', maxWidth: 680, padding: 20, paddingBottom: 42, width: '100%' },
  closeButton: { alignSelf: 'flex-start', marginBottom: 10, paddingHorizontal: 2, paddingVertical: 8 },
  closeButtonText: { fontSize: 14, fontWeight: '900' },
  hero: { alignItems: 'center', borderRadius: 28, overflow: 'hidden', paddingHorizontal: 24, paddingVertical: 30 },
  sparkles: { color: '#FFD15A', fontSize: 20, fontWeight: '900', letterSpacing: 5 },
  brand: { color: '#FFD15A', fontSize: 16, fontWeight: '900', letterSpacing: 1.5, marginTop: 8 },
  heroTitle: { color: '#FFFFFF', fontSize: 29, fontWeight: '900', marginTop: 8, textAlign: 'center' },
  heroCopy: { color: '#DDF5F1', fontSize: 15, lineHeight: 21, marginTop: 10, textAlign: 'center' },
  card: { borderRadius: 24, borderWidth: 1, marginTop: 16, padding: 20 },
  planHeading: { alignItems: 'center', flexDirection: 'row' },
  planCopy: { flex: 1 },
  planTitle: { fontSize: 21, fontWeight: '900' },
  planSubtitle: { fontSize: 12, marginTop: 3 },
  priceBadge: { borderRadius: 14, paddingHorizontal: 13, paddingVertical: 8 },
  priceBadgeText: { fontSize: 16, fontWeight: '900' },
  featureRow: { alignItems: 'center', flexDirection: 'row', marginTop: 11 },
  checkCircle: { alignItems: 'center', borderRadius: 13, height: 26, justifyContent: 'center', marginRight: 10, width: 26 },
  check: { fontSize: 15, fontWeight: '900' },
  featureText: { flex: 1, fontSize: 13, fontWeight: '800', lineHeight: 18 },
  primaryButton: { alignItems: 'center', borderRadius: 17, marginTop: 20, minHeight: 54, justifyContent: 'center', paddingHorizontal: 18 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
  disclosure: { fontSize: 11, lineHeight: 16, marginTop: 11, textAlign: 'center' },
  trialActive: { borderRadius: 20, borderWidth: 1.5, marginTop: 16, padding: 17 },
  trialActiveTitle: { fontSize: 17, fontWeight: '900', textAlign: 'center' },
  trialActiveText: { fontSize: 13, lineHeight: 18, marginTop: 5, textAlign: 'center' },
  trialEnded: { borderRadius: 20, borderWidth: 1, marginTop: 16, padding: 17 },
  trialEndedTitle: { fontSize: 17, fontWeight: '900', textAlign: 'center' },
  trialEndedText: { fontSize: 13, lineHeight: 18, marginTop: 5, textAlign: 'center' },
  lifetimeCard: { borderRadius: 26, borderWidth: 2, marginTop: 16, overflow: 'hidden', padding: 20 },
  lifetimeSparkles: { fontSize: 12, fontWeight: '900', letterSpacing: 2, marginBottom: 14, textAlign: 'center' },
  lifetimeHeading: { alignItems: 'center', flexDirection: 'row' },
  trophyFrame: { alignItems: 'center', borderRadius: 22, borderWidth: 1.5, height: 76, justifyContent: 'center', marginRight: 12, width: 76 },
  trophyImage: { height: 68, width: 68 },
  lifetimeCopy: { flex: 1, minWidth: 0 },
  lifetimeEyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  lifetimeTitle: { fontSize: 20, fontWeight: '900', marginTop: 4 },
  lifetimeText: { fontSize: 13, lineHeight: 18, marginTop: 5 },
  lifetimePriceBadge: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', justifyContent: 'center', marginTop: 16, paddingHorizontal: 14, paddingVertical: 10 },
  lifetimePriceLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1.1, marginRight: 12 },
  lifetimePrice: { fontSize: 25, fontWeight: '900' },
  lifetimeBenefits: { borderRadius: 18, borderWidth: 1, marginTop: 16, paddingBottom: 12, paddingHorizontal: 14, paddingTop: 1 },
  goldButton: { alignItems: 'center', borderRadius: 17, justifyContent: 'center', marginTop: 18, minHeight: 52 },
  goldButtonText: { color: '#183437', fontSize: 16, fontWeight: '900' },
  offerCodeButton: { alignItems: 'center', borderRadius: 17, borderWidth: 1.5, justifyContent: 'center', marginTop: 12, minHeight: 48 },
  offerCodeText: { fontSize: 14, fontWeight: '900' },
  offerCodeHint: { fontSize: 11, lineHeight: 16, marginTop: 7, textAlign: 'center' },
  errorBox: { borderRadius: 14, marginTop: 14, padding: 12 },
  errorText: { fontSize: 12, fontWeight: '800', lineHeight: 17, textAlign: 'center' },
  linkButton: { alignItems: 'center', padding: 10 },
  linkButtonText: { fontSize: 14, fontWeight: '900' },
  secondaryLink: { fontSize: 12, fontWeight: '800' },
  familyNote: { fontSize: 11, lineHeight: 16, marginTop: 4, paddingHorizontal: 16, textAlign: 'center' },
  legalRow: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 18 },
  legalLink: { fontSize: 11, fontWeight: '800', textDecorationLine: 'underline' },
  signOut: { alignItems: 'center', marginTop: 8, padding: 10 },
  signOutText: { fontSize: 12, fontWeight: '900' },
  deleteAccess: { alignItems: 'center', padding: 10 },
  deleteAccessText: { fontSize: 11, fontWeight: '800', textDecorationLine: 'underline' },
  pressed: { opacity: 0.65 },
  pausedRoot: { alignItems: 'center', alignSelf: 'center', flex: 1, justifyContent: 'center', maxWidth: 520, padding: 28, width: '100%' },
  pausedIcon: { alignItems: 'center', borderRadius: 40, height: 80, justifyContent: 'center', width: 80 },
  pausedEmoji: { fontSize: 39 },
  pausedTitle: { fontSize: 27, fontWeight: '900', marginTop: 20, textAlign: 'center' },
  pausedText: { fontSize: 15, lineHeight: 22, marginTop: 10, textAlign: 'center' },
  pausedError: { fontSize: 12, fontWeight: '700', lineHeight: 17, marginTop: 14, textAlign: 'center' },
  pausedButton: { marginTop: 22, width: '100%' },
});
