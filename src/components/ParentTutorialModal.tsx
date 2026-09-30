import { Image, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AppTheme } from '../theme';

function TutorialCategoryIcon({ kind, size, backgroundColor }: { kind: 'task' | 'reward'; size: number; backgroundColor: string }) {
  const imageSize = Math.round(size * 0.81);
  return (
    <View style={[styles.tutorialCategoryContainer, { backgroundColor, borderRadius: Math.round(size * 0.31), height: size, width: size }]}>
      <Image
        resizeMode="contain"
        source={require('../../assets/category/tasks.png')}
        style={[styles.tutorialCategoryImage, { height: imageSize, opacity: kind === 'task' ? 1 : 0, width: imageSize }]}
      />
      <Image
        resizeMode="contain"
        source={require('../../assets/category/rewards.png')}
        style={[styles.tutorialCategoryImage, { height: imageSize, opacity: kind === 'reward' ? 1 : 0, width: imageSize }]}
      />
    </View>
  );
}

const STEPS = [
  {
    image: require('../../assets/branding/kudos-star-laurel.png'),
    title: 'Welcome!',
    instructions: 'Kudos is designed to help parents and classrooms start each day with positivity, structure, and clear expectations that help children thrive. Through positive reinforcement, children can build confidence, essential life skills, learn responsibility, and create healthy habits that last.\n\nWe encourage the supervising adult to focus on recognizing successes rather than removing points for mistakes. Children thrive when their achievements retain their value and progress is celebrated.\n\nLittle wins lead to big growth!',
  },
  {
    icon: '👪',
    title: 'Parent Mode',
    instructions: 'You are currently in Parent Mode. Teachers can quickly switch to Teacher Mode from Settings.',
  },
  {
    icon: '👤',
    title: 'Add A Profile',
    instructions: 'From Home, tap Add profile. Choose a name, avatar or photo, accent, currency, and reward container.',
  },
  {
    icon: '📱',
    title: 'Child Mode',
    instructions: 'This feature allows the child to have limited access to their profile on their own device. The supervising adult will be able to approve submitted tasks and send reward notifications to the child. To set this up, open Settings, select the child’s profile, and generate an access code. Enter the code on the child’s device to securely link their profile.',
  },
  {
    category: 'task',
    title: 'Add A Task',
    instructions: 'Open Tasks, tap Add task, choose the value and schedule, then assign it to a profile.',
    tip: 'Points are added after adult approval.',
  },
  {
    category: 'reward',
    title: 'Add A Reward',
    instructions: 'Open Rewards, tap Add reward, set the cost, and assign it to one or more profiles.',
    tip: 'Reachable rewards help build momentum.',
  },
  {
    image: require('../../assets/branding/redeem-reward-fireworks.png'),
    title: 'Redeem A Reward',
    instructions: 'Open a profile, select a reward, and choose whether to redeem it together now or send it to Child Mode to open.',
  },
  {
    icon: '📅',
    title: 'Review History',
    instructions: 'Open History and select a date to review scheduled and completed tasks by profile.',
  },
] as const;

type ParentTutorialModalProps = {
  visible: boolean;
  step: number;
  theme: AppTheme;
  onStepChange: (step: number) => void;
  onFinish: () => void;
  onSkip: () => void;
};

export function ParentTutorialModal({ visible, step, theme, onStepChange, onFinish, onSkip }: ParentTutorialModalProps) {
  const safeStep = Math.min(Math.max(step, 0), STEPS.length - 1);
  const current = STEPS[safeStep];
  const last = safeStep === STEPS.length - 1;

  const goForward = () => {
    if (last) onFinish();
    else onStepChange(safeStep + 1);
  };

  const goBack = () => {
    if (safeStep > 0) onStepChange(safeStep - 1);
  };

  return (
    <Modal animationType="fade" onRequestClose={onSkip} presentationStyle="overFullScreen" transparent visible={visible}>
      <SafeAreaView style={[styles.overlay, { backgroundColor: theme.overlay }]}> 
        <View
          style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}
        >
          <View style={styles.header}>
            <View>
              <Text style={[styles.eyebrow, { color: theme.primary }]}>PARENT QUICK START</Text>
              <Text style={[styles.counter, { color: theme.textMuted }]}>Step {safeStep + 1} of {STEPS.length}</Text>
            </View>
            <Pressable
              accessibilityLabel="Close tutorial"
              accessibilityRole="button"
              hitSlop={12}
              onPress={onSkip}
              style={({ pressed }) => [
                styles.closeButton,
                { backgroundColor: theme.primarySoft, borderColor: theme.border },
                pressed && styles.closePressed,
              ]}
            >
              <Text style={[styles.closeText, { color: theme.text }]}>×</Text>
            </Pressable>
          </View>

          <ScrollView
            alwaysBounceVertical={false}
            bounces={false}
            contentContainerStyle={styles.content}
            directionalLockEnabled
            nestedScrollEnabled
            overScrollMode="never"
            showsVerticalScrollIndicator={false}
          >
            {'category' in current ? (
              <TutorialCategoryIcon kind={current.category} size={82} backgroundColor={theme.primarySoft} />
            ) : 'image' in current ? (
              <Image resizeMode="contain" source={current.image} style={styles.welcomeImage} />
            ) : (
              <View style={[styles.iconCircle, { backgroundColor: theme.primarySoft }]}><Text style={styles.icon}>{current.icon}</Text></View>
            )}
            <Text adjustsFontSizeToFit minimumFontScale={0.8} numberOfLines={2} style={[styles.title, { color: theme.text }]}>{current.title}</Text>
            <Text style={[styles.instructions, { color: theme.background === '#F4FBF8' || theme.background === '#F7FBF2' ? '#505D5D' : '#C3CECC' }]}>{current.instructions}</Text>
            {'tip' in current && current.tip ? (
              <View style={[styles.tip, { backgroundColor: theme.rewardSoft }]}> 
                <Text style={styles.tipIcon}>💡</Text>
                <Text style={[styles.tipText, { color: theme.background === '#F4FBF8' || theme.background === '#F7FBF2' ? '#505D5D' : '#C3CECC' }]}>{current.tip}</Text>
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.dots}>{STEPS.map((_, index) => <View key={index} style={[styles.dot, { backgroundColor: index === safeStep ? theme.primary : theme.border }, index === safeStep && styles.activeDot]} />)}</View>
          <View style={styles.actions}>
            <Pressable disabled={safeStep === 0} onPress={goBack} style={({ pressed }) => [styles.secondaryButton, { borderColor: theme.border }, safeStep === 0 && styles.disabled, pressed && styles.pressed]}>
              <Text style={[styles.secondaryText, { color: theme.text }]}>Back</Text>
            </Pressable>
            <Pressable onPress={goForward} style={({ pressed }) => [styles.primaryButton, { backgroundColor: theme.primary }, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>{last ? 'Start using Kudos' : 'Next'}</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  tutorialCategoryContainer:{alignItems:'center',justifyContent:'center',marginBottom:16,overflow:'hidden',position:'relative'},
  tutorialCategoryImage:{position:'absolute'},

  overlay: { alignItems: 'center', flex: 1, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  card: { borderRadius: 26, borderWidth: 1, maxHeight: '94%', maxWidth: 520, overflow: 'hidden', paddingHorizontal: 18, paddingVertical: 18, shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.2, shadowRadius: 30, elevation: 12, width: '100%' },
  header: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1.3 }, counter: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  closeButton:{alignItems:'center',borderRadius:999,borderWidth:1,height:38,justifyContent:'center',width:38},
  closeText:{fontSize:27,fontWeight:'500',lineHeight:29,marginTop:-2},
  closePressed:{opacity:0.68,transform:[{scale:0.96}]},
  content: { alignItems: 'center', paddingBottom: 4, paddingHorizontal: 2, paddingTop: 12 },
  iconCircle: { alignItems: 'center', borderRadius: 30, height: 82, justifyContent: 'center', marginBottom: 16, width: 82 }, icon: { fontSize: 38 }, welcomeImage:{borderRadius:21,height:94,marginBottom:16,width:94},
  title: { flexShrink: 1, fontSize: 23, fontWeight: '900', letterSpacing: -0.35, lineHeight: 27, textAlign: 'center' },
  instructions: { fontSize: 17, fontWeight:'600', lineHeight: 24, marginTop: 13, textAlign: 'center' },
  tip: { alignItems: 'flex-start', borderRadius: 18, flexDirection: 'row', gap: 10, marginTop: 18, padding: 14, width: '100%' }, tipIcon: { fontSize: 18 }, tipText: { flex: 1, fontSize: 16, fontWeight: '700', lineHeight: 22 },
  dots: { alignItems: 'center', flexDirection: 'row', gap: 6, justifyContent: 'center', marginBottom: 18, marginTop: 8 }, dot: { borderRadius: 99, height: 7, width: 7 }, activeDot: { width: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, secondaryButton: { alignItems: 'center', borderRadius: 16, borderWidth: 1, justifyContent: 'center', minHeight: 48, minWidth: 88, paddingHorizontal: 16 }, primaryButton: { alignItems: 'center', borderRadius: 16, flex: 1, justifyContent: 'center', minHeight: 48, minWidth: 180, paddingHorizontal: 14 },
  secondaryText: { fontSize: 14, fontWeight: '900' }, primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' }, disabled: { opacity: 0.35 }, pressed: { opacity: 0.72 },
});
