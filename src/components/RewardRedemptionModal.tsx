import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CURRENCY_META, currencyWord } from '../data/currency';
import { getProfileAccent } from '../data/profileStyles';
import type { AppTheme } from '../theme';
import type { ChildProfile, RewardRedemption } from '../types';
import { CurrencyIcon } from './CurrencyIcon';
import { ItemIconView } from './ItemIconView';

const CONFETTI = ['⭐', '🎉', '✨', '🎊', '🌈', '💫', '🥳', '🏆', '🎈', '💖', '🌟', '🎁'];

type RewardRedemptionModalProps = {
  redemption: RewardRedemption | null;
  profile: ChildProfile | null;
  theme: AppTheme;
  onClose: () => void;
};

export function RewardRedemptionModal({ redemption, profile, theme, onClose }: RewardRedemptionModalProps) {
  const visible = Boolean(redemption && profile);
  const cardScale = useRef(new Animated.Value(0.45)).current;
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const confetti = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;
  const celebrationAnimation = useRef<Animated.CompositeAnimation | null>(null);

  const playCelebration = useCallback(() => {
    if (!visible) return;
    celebrationAnimation.current?.stop();

    cardScale.setValue(0.45);
    cardOpacity.setValue(0);
    bounce.setValue(0);
    confetti.setValue(0);
    glow.setValue(0);

    const animation = Animated.parallel([
      Animated.timing(cardOpacity, { delay: 45, duration: 150, toValue: 1, useNativeDriver: true }),
      Animated.spring(cardScale, { damping: 10, mass: 0.75, stiffness: 180, toValue: 1, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(210),
        Animated.spring(bounce, { damping: 5, mass: 0.5, stiffness: 240, toValue: 1, useNativeDriver: true }),
        Animated.spring(bounce, { damping: 8, mass: 0.6, stiffness: 180, toValue: 0, useNativeDriver: true }),
      ]),
      Animated.timing(confetti, { duration: 2300, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: true }),
      Animated.loop(Animated.sequence([
        Animated.timing(glow, { duration: 650, toValue: 1, useNativeDriver: true }),
        Animated.timing(glow, { duration: 650, toValue: 0, useNativeDriver: true }),
      ]), { iterations: 3 }),
    ]);

    celebrationAnimation.current = animation;
    animation.start(({ finished }) => {
      if (finished && celebrationAnimation.current === animation) celebrationAnimation.current = null;
    });
  }, [bounce, cardOpacity, cardScale, confetti, glow, visible]);

  useEffect(() => {
    if (!visible) return;
    playCelebration();
    return () => {
      celebrationAnimation.current?.stop();
      celebrationAnimation.current = null;
    };
  }, [playCelebration, redemption?.occurredAt, visible]);

  const confettiPieces = useMemo(() => CONFETTI.map((item, index) => {
    const angle = (-Math.PI * 0.92) + ((Math.PI * 1.84 * index) / Math.max(1, CONFETTI.length - 1));
    const distance = 170 + (index % 3) * 32;
    const translateX = confetti.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * distance] });
    const translateY = confetti.interpolate({ inputRange: [0, 1], outputRange: [25, Math.sin(angle) * distance - 35] });
    const opacity = confetti.interpolate({ inputRange: [0, 0.05, 0.72, 1], outputRange: [0, 1, 1, 0] });
    const scale = confetti.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0.35, 1.15, 0.8] });
    const rotate = confetti.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${index % 2 ? 540 : -540}deg`] });
    return { item, index, opacity, rotate, scale, translateX, translateY };
  }), [confetti]);

  const currency = profile ? CURRENCY_META[profile.currencyType] : null;
  const parentSent = redemption?.presentation === 'parentSent';
  const accent = profile ? getProfileAccent(profile.colorKey) : theme.reward;
  const iconScale = bounce.interpolate({ inputRange: [0, 1], outputRange: [1, 1.38] });
  const iconRotate = bounce.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-12deg'] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.88, 1.22] });
  const glowOpacity = glow.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.5] });

  return (
    <Modal animationType="none" hardwareAccelerated onRequestClose={onClose} presentationStyle="overFullScreen" statusBarTranslucent transparent visible={visible}>
      <SafeAreaView style={styles.root}>
        <Pressable accessibilityLabel="Replay reward celebration" onPress={playCelebration} style={styles.backdrop} />

        <View pointerEvents="none" style={styles.confettiLayer}>
          {confettiPieces.map((piece) => (
            <Animated.Text
              key={`${piece.item}-${piece.index}`}
              style={[
                styles.confetti,
                {
                  opacity: piece.opacity,
                  transform: [
                    { translateX: piece.translateX },
                    { translateY: piece.translateY },
                    { rotate: piece.rotate },
                    { scale: piece.scale },
                  ],
                },
              ]}
            >
              {piece.item}
            </Animated.Text>
          ))}
        </View>

        {redemption && profile && currency ? (
          <Animated.View
            onTouchEnd={playCelebration}
            renderToHardwareTextureAndroid
            shouldRasterizeIOS
            style={[
              styles.cardShell,
              {
                backgroundColor: theme.background,
                borderColor: theme.reward,
                opacity: cardOpacity,
                shadowColor: theme.reward,
                transform: [{ scale: cardScale }],
              },
            ]}
          >
            <Pressable accessibilityLabel="Close reward celebration" hitSlop={12} onPress={onClose} style={[styles.closeButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.closeText, { color: theme.text }]}>×</Text>
            </Pressable>
            <ScrollView contentContainerStyle={styles.card} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Animated.View pointerEvents="none" style={[styles.glow, { backgroundColor: theme.reward, opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
              <View style={[styles.banner, { backgroundColor: theme.rewardSoft }]}>
                <Text style={[styles.bannerText, { color: theme.reward }]}>{parentSent ? '🎁 REWARD SENT! 🎁' : 'You earned it!'}</Text>
              </View>
              <Text style={[styles.title, { color: theme.text }]}>
                {parentSent ? (
                  <>A surprise is waiting for <Text style={{ color: accent }}>{profile.name}</Text>!</>
                ) : (
                  <>Kudos, <Text style={{ color: accent }}>{profile.name}</Text>!</>
                )}
              </Text>
              <Text style={[styles.subtitle, { color: theme.textMuted }]}>{parentSent ? 'The reward is now waiting in Child Mode to be opened.' : 'Time to celebrate your awesome work.'}</Text>

              <View style={styles.iconStage} pointerEvents="none">
                <Animated.View style={[styles.iconGlow, { backgroundColor: theme.reward, opacity: glowOpacity, transform: [{ scale: glowScale }] }]} />
                <Animated.View style={{ transform: [{ scale: iconScale }, { rotate: iconRotate }] }}>
                  <ItemIconView backgroundColor={theme.rewardSoft} icon={redemption.rewardIcon} size={108} theme={theme} />
                </Animated.View>
              </View>

              <Text style={[styles.rewardTitle, { color: theme.text }]}>{redemption.rewardTitle}</Text>
              <View style={[styles.costPill, { backgroundColor: theme.primarySoft }]}>
                <View style={styles.costRow}><Text style={[styles.costText, { color: currency.color }]}>−{redemption.cost}</Text><CurrencyIcon color={currency.color} size={20} type={profile.currencyType} /><Text style={[styles.costText, { color: currency.color }]}>{parentSent ? 'sent' : 'redeemed'}</Text></View>
              </View>
              <View style={[styles.balanceCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
                <Text style={[styles.balanceLabel, { color: theme.textMuted }]}>New Balance</Text>
                <Text style={[styles.balanceValue, { color: currency.color }]}>{redemption.balanceAfter} {currencyWord(profile.currencyType, redemption.balanceAfter)}</Text>
                <Text style={[styles.balanceMath, { color: theme.textMuted }]}>{redemption.balanceBefore} − {redemption.cost} = {redemption.balanceAfter}</Text>
              </View>
              <Text style={[styles.cheer, { color: theme.primary }]}>{parentSent ? `Switch to ${profile.name}'s Child Mode to open the gift! 🌟` : 'Keep going—your next reward is waiting! 🚀'}</Text>
              <Pressable accessibilityRole="button" onPress={onClose} style={({ pressed }) => [styles.doneButton, { backgroundColor: theme.reward }, pressed && styles.pressed]}>
                <Text style={styles.doneText}>{parentSent ? 'Gift sent!' : 'Woohoo!'}</Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        ) : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 18 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12, 18, 32, 0.62)' },
  confettiLayer: { alignItems: 'center', ...StyleSheet.absoluteFillObject, justifyContent: 'center', zIndex: 30 },
  confetti: { fontSize: 28, position: 'absolute' },
  cardShell: { backfaceVisibility: 'hidden', borderRadius: 34, borderWidth: 2, elevation: 18, maxHeight: '92%', maxWidth: 520, overflow: 'hidden', shadowOffset: { width: 0, height: 20 }, shadowOpacity: 0.38, shadowRadius: 42, width: '100%', zIndex: 20 },
  card: { alignItems: 'center', paddingBottom: 22, paddingHorizontal: 22, paddingTop: 46 },
closeButton: { alignItems: 'center', borderRadius: 18, borderWidth: 1, height: 36, justifyContent: 'center', position: 'absolute', right: 12, top: 10, width: 36, zIndex: 50 },
  closeText: { fontSize: 25, fontWeight: '700', lineHeight: 27 },
  glow: { borderRadius: 999, height: 180, position: 'absolute', top: 118, width: 180 },
  banner: { borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  bannerText: { fontSize: 12, fontWeight: '900', letterSpacing: 0.9 },
  title: { fontSize: 27, fontWeight: '900', letterSpacing: -0.7, marginTop: 13, textAlign: 'center' },
  subtitle: { fontSize: 13, marginBottom: 18, marginTop: 5, textAlign: 'center' },
  iconStage: { alignItems: 'center', height: 124, justifyContent: 'center', width: 150 },
  iconGlow: { borderRadius: 999, height: 118, position: 'absolute', width: 118 },
  rewardTitle: { fontSize: 20, fontWeight: '900', marginTop: 14, textAlign: 'center' },
  costPill: { borderRadius: 999, marginTop: 9, paddingHorizontal: 13, paddingVertical: 8 },
  costRow: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center' },
  costText: { fontSize: 14, fontWeight: '900' },
  balanceCard: { alignItems: 'center', borderRadius: 19, borderWidth: 1, marginTop: 14, padding: 13, width: '100%' },
  balanceLabel: { fontSize: 12, fontWeight: '800' },
  balanceValue: { fontSize: 21, fontWeight: '900', marginTop: 2 },
  balanceMath: { fontSize: 12, marginTop: 3 },
  cheer: { fontSize: 13, fontWeight: '900', marginTop: 13, textAlign: 'center' },
  doneButton: { alignItems: 'center', borderRadius: 17, marginTop: 15, paddingVertical: 15, width: '100%' },
  doneText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  pressed: { opacity: 0.72 },
});
