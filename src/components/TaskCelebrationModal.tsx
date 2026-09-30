import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CURRENCY_META, currencyWord } from '../data/currency';
import { getProfileAccent } from '../data/profileStyles';
import type { AppTheme } from '../theme';
import type { ChildProfile, TaskAward } from '../types';
import { CurrencyStorage } from './CurrencyStorage';
import { CurrencyIcon } from './CurrencyIcon';

type TaskCelebrationModalProps = {
  award: TaskAward | null;
  profile: ChildProfile | null;
  goalAmount: number;
  goalLabel?: string;
  onClose: () => void;
  theme: AppTheme;
};

export function TaskCelebrationModal({ award, profile, goalAmount, goalLabel, onClose, theme }: TaskCelebrationModalProps) {

  const opacity = useRef(new Animated.Value(0)).current;
  const sparkle = useRef(new Animated.Value(0)).current;
  const fireworks = useRef(new Animated.Value(0)).current;
  const awardPop = useRef(new Animated.Value(0)).current;

  const playCelebration = useCallback(() => {
    if (!award) return;
    const currencyDropDuration = 85 + (Math.min(8, Math.max(1, Math.ceil(award.amount))) * 306);
    opacity.stopAnimation();
    sparkle.stopAnimation();
    fireworks.stopAnimation();
    awardPop.stopAnimation();
    opacity.setValue(0);
    sparkle.setValue(0);
    fireworks.setValue(0);
    awardPop.setValue(0);

    Animated.parallel([
      Animated.timing(opacity, { delay: 45, duration: 140, easing: Easing.out(Easing.quad), toValue: 1, useNativeDriver: true }),
      Animated.timing(sparkle, { delay: 70, duration: 900, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(140),
        Animated.spring(awardPop, { damping: 10, mass: 0.48, stiffness: 190, toValue: 1, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.delay(currencyDropDuration),
        Animated.timing(fireworks, { duration: 1900, easing: Easing.out(Easing.cubic), toValue: 1, useNativeDriver: true }),
      ]),
    ]).start();
  }, [award, awardPop, fireworks, opacity, sparkle]);

  useEffect(() => {
    if (!award) return;
    playCelebration();
    return () => {
      opacity.stopAnimation();
      sparkle.stopAnimation();
      fireworks.stopAnimation();
      awardPop.stopAnimation();
    };
  }, [award, awardPop, fireworks, opacity, playCelebration, sparkle]);

  const visible = Boolean(award && profile);
  const currency = profile ? CURRENCY_META[profile.currencyType] : null;
  const accent = profile ? getProfileAccent(profile.colorKey) : theme.primary;
  const sparkleY = sparkle.interpolate({ inputRange: [0, 1], outputRange: [20, -95] });
  const sparkleOpacity = sparkle.interpolate({ inputRange: [0, 0.12, 0.75, 1], outputRange: [0, 1, 1, 0] });
  const awardScale = awardPop.interpolate({ inputRange: [0,0.62,1], outputRange: [0.78,1.22,1] });
  const awardLift = awardPop.interpolate({ inputRange: [0,1], outputRange: [8,0] });
  const fireworkPieces = useMemo(() => {
    const clusters = [
      { cx: -108, cy: -72, start: 0.06, glyphs: ['★','✦','✨','✧','★','✦','✨','✧'] },
      { cx: 104, cy: -82, start: 0.22, glyphs: ['✦','★','✨','✧','★','✨','✦','✧'] },
      { cx: -120, cy: 58, start: 0.38, glyphs: ['✨','✦','★','✧','✨','★','✦','✧'] },
      { cx: 118, cy: 65, start: 0.50, glyphs: ['★','✨','✦','✧','★','✦','✨','✧'] },
    ];

    return clusters.flatMap((cluster, clusterIndex) =>
      cluster.glyphs.map((glyph, pieceIndex) => {
        const angle = ((Math.PI * 2) / cluster.glyphs.length) * pieceIndex - Math.PI / 2;
        const distance = 58 + (pieceIndex % 3) * 17;
        const startAt = cluster.start;
        const burstAt = Math.min(0.86, startAt + 0.10);
        const fadeAt = Math.min(0.96, startAt + 0.42);
        const endAt = Math.min(1, startAt + 0.52);
        return {
          glyph,
          key: `${clusterIndex}-${pieceIndex}`,
          color: pieceIndex % 3 === 0 ? theme.reward : pieceIndex % 3 === 1 ? theme.primary : theme.secondary,
          opacity: fireworks.interpolate({
            inputRange: [0, startAt, burstAt, fadeAt, endAt, 1],
            outputRange: [0, 0, 1, 1, 0, 0],
          }),
          scale: fireworks.interpolate({
            inputRange: [0, startAt, burstAt, endAt, 1],
            outputRange: [0.2, 0.2, 1.25, 0.7, 0.7],
          }),
          translateX: fireworks.interpolate({
            inputRange: [0, startAt, burstAt, endAt, 1],
            outputRange: [cluster.cx, cluster.cx, cluster.cx + Math.cos(angle) * 8, cluster.cx + Math.cos(angle) * distance, cluster.cx + Math.cos(angle) * distance],
          }),
          translateY: fireworks.interpolate({
            inputRange: [0, startAt, burstAt, endAt, 1],
            outputRange: [cluster.cy, cluster.cy, cluster.cy + Math.sin(angle) * 8, cluster.cy + Math.sin(angle) * distance, cluster.cy + Math.sin(angle) * distance],
          }),
          rotate: fireworks.interpolate({
            inputRange: [0, startAt, endAt, 1],
            outputRange: ['0deg', '0deg', `${pieceIndex % 2 ? 300 : -300}deg`, `${pieceIndex % 2 ? 300 : -300}deg`],
          }),
        };
      }),
    );
  }, [fireworks, theme.primary, theme.reward, theme.secondary]);

  const confettiPieces = useMemo(() => {
    const glyphs = ['■','●','◆','✦','■','●','◆','✦','■','●','◆','✦','■','●','◆','✦','■','●','◆','✦','■','●','◆','✦','■','●','◆','✦'];
    const colors = [theme.reward, theme.primary, theme.secondary, '#FF7FA6', '#8A7CFF', '#FFB84D'];
    return glyphs.map((glyph, index) => {
      const angle = -Math.PI + ((Math.PI * 2 * index) / glyphs.length);
      const distance = 90 + (index % 5) * 18;
      const lift = 28 + (index % 4) * 8;
      return {
        glyph,
        index,
        color: colors[index % colors.length],
        opacity: fireworks.interpolate({ inputRange: [0,0.10,0.18,0.78,1], outputRange: [0,0,1,1,0] }),
        scale: fireworks.interpolate({ inputRange: [0,0.12,0.22,1], outputRange: [0.25,0.25,1,0.72] }),
        translateX: fireworks.interpolate({ inputRange: [0,0.12,1], outputRange: [0,0,Math.cos(angle) * distance] }),
        translateY: fireworks.interpolate({ inputRange: [0,0.12,0.55,1], outputRange: [15,15,Math.sin(angle) * distance - lift,Math.sin(angle) * distance + 26] }),
        rotate: fireworks.interpolate({ inputRange: [0,1], outputRange: ['0deg', `${index % 2 ? 720 : -720}deg`] }),
      };
    });
  }, [fireworks, theme.primary, theme.reward, theme.secondary]);


  return (
    <Modal animationType="none" hardwareAccelerated onRequestClose={onClose} presentationStyle="overFullScreen" statusBarTranslucent transparent visible={visible}>
      <SafeAreaView style={styles.root}>
        <Pressable accessibilityLabel="Replay celebration" onPress={playCelebration} style={styles.backdrop} />
        {award && profile && currency ? <Animated.View
          collapsable={false}
          onTouchEnd={playCelebration}
          renderToHardwareTextureAndroid
          shouldRasterizeIOS
          style={[
            styles.card,
            { backgroundColor: theme.background, borderColor: theme.border, opacity, shadowColor: theme.shadow },
          ]}
        >
          <Animated.Text pointerEvents="none" style={[styles.sparkleLeft, { opacity: sparkleOpacity, transform: [{ translateY: sparkleY }] }]}>✨</Animated.Text>
          <Animated.Text pointerEvents="none" style={[styles.sparkleCenter, { opacity: sparkleOpacity, transform: [{ translateY: sparkleY }] }]}>⭐</Animated.Text>
          <Animated.Text pointerEvents="none" style={[styles.sparkleRight, { opacity: sparkleOpacity, transform: [{ translateY: sparkleY }] }]}>✨</Animated.Text>


          <View style={[styles.successBadge, { backgroundColor: theme.successSoft }]}><Text style={[styles.successBadgeText, { color: theme.success }]}>✓ TASK COMPLETE</Text></View>
          <Text style={[styles.title, { color: theme.text }]}>Kudos, <Text style={{ color: accent }}>{profile.name}</Text>!</Text>
          <Text style={[styles.subtitle, { color: theme.textMuted }]}>“{award.taskTitle}” complete — watch the new {currencyWord(profile.currencyType, award.amount)} drop in!</Text>
          <Animated.View style={[styles.awardPill, { backgroundColor: theme.rewardSoft, transform:[{translateY:awardLift},{scale:awardScale}] }]}>
            <View style={styles.awardAmountRow}><Text style={[styles.awardAmount, { color: currency.color }]}>+{award.amount}</Text><CurrencyIcon color={currency.color} size={24} type={profile.currencyType} /></View>
            <Text style={[styles.awardLabel, { color: theme.textMuted }]}>{currencyWord(profile.currencyType, award.amount)}</Text>
          </Animated.View>

          <View style={styles.storageWrap}>
            <View style={[styles.storageBalanceCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text style={[styles.storageBalanceLabel, { color: theme.textMuted }]}>New Balance</Text>
              <Text style={[styles.storageBalanceValue, { color: currency.color }]}>
                {award.balanceAfter} {currencyWord(profile.currencyType, award.balanceAfter)}
              </Text>
              <Text style={[styles.storageBalanceMath, { color: theme.textMuted }]}>
                {award.balanceBefore} + {award.amount} = {award.balanceAfter}
              </Text>
            </View>
            <View pointerEvents="none" style={styles.celebrationParticleLayer}>
              {fireworkPieces.map((piece) => (
                <Animated.Text
                  key={`firework-${piece.key}`}
                  style={[
                    styles.fireworkParticle,
                    {
                      color: piece.color,
                      opacity: piece.opacity,
                      transform: [
                        { translateX: piece.translateX },
                        { translateY: piece.translateY },
                        { scale: piece.scale },
                        { rotate: piece.rotate },
                      ],
                    },
                  ]}
                >
                  {piece.glyph}
                </Animated.Text>
              ))}
              {confettiPieces.map((piece) => (
                <Animated.Text
                  key={`confetti-${piece.index}`}
                  style={[
                    styles.confettiParticle,
                    {
                      color: piece.color,
                      opacity: piece.opacity,
                      transform: [
                        { translateX: piece.translateX },
                        { translateY: piece.translateY },
                        { scale: piece.scale },
                        { rotate: piece.rotate },
                      ],
                    },
                  ]}
                >
                  {piece.glyph}
                </Animated.Text>
              ))}
            </View>
            <CurrencyStorage
              balance={award.balanceAfter}
              celebrationAmount={award.amount}
              goalAmount={goalAmount}
              goalLabel={goalLabel}
              initialBalance={award.balanceBefore}
              profile={profile}
              theme={theme}
              visualOnly
            />
          </View>

          <Pressable onPress={onClose} style={({ pressed }) => [styles.doneButton, { backgroundColor: theme.primary }, pressed && styles.pressed]}>
            <Text style={styles.doneText}>Awesome!</Text>
          </Pressable>
        </Animated.View> : null}
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  storageBalanceCard:{alignItems:'center',borderRadius:19,borderWidth:1,marginBottom:-2,padding:13,transform:[{translateY:14}],width:'92%',zIndex:40},
  storageBalanceLabel:{fontSize:12,fontWeight:'800'},
  storageBalanceValue:{fontSize:21,fontWeight:'900',marginTop:2},
  storageBalanceMath:{fontSize:12,marginTop:3},

  root: { alignItems: 'center', flex: 1, justifyContent: 'center', padding: 18 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(12, 18, 32, 0.62)' },
  card: { backfaceVisibility: 'hidden', borderRadius: 30, borderWidth: 1, maxWidth: 520, overflow: 'hidden', padding: 20, shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.22, shadowRadius: 35, width: '100%', elevation: 12 },
  successBadge: { alignSelf: 'center', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  successBadgeText: { fontSize: 12, fontWeight: '900', letterSpacing: 1 },
  title: { fontSize: 25, fontWeight: '900', letterSpacing: -0.6, marginTop: 12, textAlign: 'center' },
  subtitle: { fontSize: 14, marginTop: 5, textAlign: 'center' },
  awardPill: { alignItems: 'center', alignSelf: 'center', borderRadius: 18, flexDirection: 'row', gap: 7, marginVertical: 12, paddingHorizontal: 14, paddingVertical: 9 },
  awardAmountRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  awardAmount: { fontSize: 18, fontWeight: '900' },
  awardLabel: { fontSize: 12, fontWeight: '800' },
  storageWrap:{alignItems:'center',alignSelf:'stretch',height:330,justifyContent:'center',overflow:'visible',paddingHorizontal:4,position:'relative',width:'100%'},
  celebrationParticleLayer:{height:330,left:'50%',marginLeft:-180,pointerEvents:'none',position:'absolute',top:0,width:360,zIndex:30},
  fireworkParticle:{fontSize:24,left:168,position:'absolute',top:150,zIndex:31},
  confettiParticle:{fontSize:13,left:174,position:'absolute',top:160,zIndex:32},
  doneButton: { alignItems: 'center', borderRadius: 17, marginTop: 15, paddingVertical: 15 },
  doneText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  sparkleLeft: { fontSize: 27, left: 45, position: 'absolute', top: 180, zIndex: 5 },
  sparkleCenter: { fontSize: 22, left: '49%', position: 'absolute', top: 160, zIndex: 5 },
  sparkleRight: { fontSize: 29, position: 'absolute', right: 43, top: 190, zIndex: 5 },
  pressed: { opacity: 0.72 },
});
