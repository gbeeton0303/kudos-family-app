import { useRef, useState } from 'react';
import { Image, NativeScrollEvent, NativeSyntheticEvent, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CurrencyIcon } from '../components/CurrencyIcon';
import { CategoryIcon } from '../components/CategoryIcon';
import { ItemIconView } from '../components/ItemIconView';
import { useClassroomMode } from '../context/ClassroomModeContext';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { ProfilePatternOverlay } from '../components/ProfilePatternOverlay';
import { CURRENCY_META, currencyWord } from '../data/currency';
import { eventToDate, getNextRewardProgress, getProfileBalance, getTaskEvents, taskAppearsOnDate, toDateKey } from '../data/familyData';
import { getProfileAccent, getProfileSoftColor } from '../data/profileStyles';
import type { AppTheme } from '../theme';
import type { ChildProfile, ChildReward, ChildTask, FeatureKey, ItemIcon } from '../types';

type DashboardScreenProps = {
  theme: AppTheme;
  profiles: ChildProfile[];
  tasks: ChildTask[];
  rewards: ChildReward[];
  pendingApprovalCount: number;
  onAddProfile: () => void;
  onSelectProfile: (profileId: string) => void;
  onOpenFeature: (feature: FeatureKey) => void;
  onOpenApprovals: () => void;
  familyAccountName?: string;
  accountFirstName?: string;
};


function getFamilyInitial(accountName?: string) {
  const cleaned = (accountName ?? '')
    .trim()
    .replace(/[’']s\b/gi, '')
    .replace(/[^a-zA-Z0-9\s-]/g, ' ');
  const words = cleaned.split(/\s+/).filter(Boolean);
  const meaningful = words.filter((word, index) => {
    const lower = word.toLowerCase();
    if (index === 0 && lower === 'the') return false;
    if (index === words.length - 1 && lower === 'family') return false;
    return true;
  });
  return (meaningful[0]?.[0] ?? words[0]?.[0] ?? 'F').toUpperCase();
}

export function DashboardScreen({ theme, profiles, tasks, rewards, pendingApprovalCount, onAddProfile, onSelectProfile, onOpenFeature, onOpenApprovals, familyAccountName, accountFirstName }: DashboardScreenProps) {
  const { teacherMode, terms } = useClassroomMode();
  const darkProgressTheme = theme.background === '#163A3D' || theme.background === '#183832';
  const progressBackdrop = darkProgressTheme ? theme.surfaceMuted : teacherMode ? '#C8DDC5' : '#B9D8D1';
  const currentHour = new Date().getHours();
  const greetingPeriod = currentHour >= 5 && currentHour < 12
    ? 'Good morning'
    : currentHour >= 12 && currentHour < 17
      ? 'Good afternoon'
      : 'Good evening';
  const greetingText = `${greetingPeriod}, ${accountFirstName || terms.adult}!`;

  const progress = profiles.map((profile) => ({ profile, ...getNextRewardProgress(profile, tasks, rewards) }));
  const readyCount = progress.filter((item) => item.reward && item.balance >= item.reward.cost).length;
  const cleanFamilyName = (familyAccountName ?? '').trim().replace(/^the\s+/i, '').replace(/\s+family$/i, '').trim();
  const familySpaceTitle = teacherMode ? `${terms.group} space` : cleanFamilyName ? `${cleanFamilyName} Family Space` : 'Family Space';
  const [progressPage, setProgressPage] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const carouselRef = useRef<ScrollView>(null);
  const todayKey = toDateKey();
  const dailyTaskProgress = profiles.map((profile) => {
    const assignedToday = tasks.filter((task) => task.frequency !== 'unlimited' && task.assignedProfileIds.includes(profile.id) && taskAppearsOnDate(task, new Date()));
    const completed = assignedToday.filter((task) => getTaskEvents(task, profile.id).some((event) => toDateKey(eventToDate(event)) === todayKey)).length;
    return { profile, completed, total: assignedToday.length, percent: assignedToday.length ? Math.round((completed / assignedToday.length) * 100) : 0 };
  });
  const allTasksComplete = dailyTaskProgress.filter((item) => item.total > 0 && item.completed >= item.total).length;
  const goToProgressPage = (page: number) => {
    setProgressPage(page);
    carouselRef.current?.scrollTo({ x: page * carouselWidth, animated: true });
  };
  const handleProgressScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (!carouselWidth) return;
    setProgressPage(Math.round(event.nativeEvent.contentOffset.x / carouselWidth));
  };

  return (
    <View>
      <View style={styles.topBar}>
        <View style={styles.brandRow}>
          {teacherMode ? (
            <View style={[styles.logoMark, { backgroundColor: theme.primary }]}>
              <Text style={styles.teacherApple}>🍎</Text>
            </View>
          ) : (
            <Image resizeMode="contain" source={require('../../assets/branding/kudos-star-laurel.png')} style={styles.brandLogoImage} />
          )}
          <View>
            <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={[styles.brandName, { color: teacherMode ? theme.text : theme.primaryStrong }]}>{teacherMode ? 'Kudos Classroom' : 'Kudos Family'}</Text>
            <Text style={[styles.brandTagline, { color: theme.textMuted }]}>{teacherMode ? 'Class goals, celebrated' : 'Little wins, celebrated'}</Text>
          </View>
        </View>
      </View>

      {pendingApprovalCount > 0 ? (
        <Pressable onPress={onOpenApprovals} style={({ pressed }) => [styles.approvalBanner, { backgroundColor: theme.rewardSoft, borderColor: theme.reward }, pressed && styles.pressed]}>
          <Text style={styles.approvalEmoji}>🔔</Text>
          <View style={styles.approvalCopy}><Text style={[styles.approvalTitle, { color: theme.text }]}>{pendingApprovalCount} task approval{pendingApprovalCount === 1 ? '' : 's'} waiting</Text><Text style={[styles.approvalText, { color: theme.textMuted }]}>{teacherMode ? 'Review class task submissions and approve or deny them.' : 'Review Child Mode submissions and approve or deny them.'}</Text></View>
          <Text style={[styles.approvalArrow, { color: theme.reward }]}>›</Text>
        </Pressable>
      ) : null}

      <View style={[styles.hero, { backgroundColor: progressBackdrop, borderColor: theme.border, shadowColor: theme.shadow }]}> 
        <View style={[styles.heroGlowOne, { backgroundColor: theme.primary }]} /><View style={[styles.heroGlowTwo, { backgroundColor: theme.reward }]} />
        <View onLayout={(event) => setCarouselWidth(event.nativeEvent.layout.width)}>
          <ScrollView
            horizontal
            onMomentumScrollEnd={handleProgressScroll}
            pagingEnabled
            ref={carouselRef}
            showsHorizontalScrollIndicator={false}
          >
            <View style={[styles.progressPage, carouselWidth ? { width: carouselWidth } : null]}>
              <View style={styles.heroCopy}><Text style={[styles.greeting, { color: theme.primaryStrong }]}>{greetingText}</Text><Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={2} style={[styles.heroTitle, { color: theme.text }]}>Rewards Progress</Text><Text style={[styles.heroDescription, { color: theme.text }]}>{`Each bar shows how close a ${terms.profileLower} is to their next assigned reward.`}</Text></View>
              <View style={[styles.progressCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
                <View style={styles.progressHeadingRow}><View><Text style={[styles.progressEyebrow, { color: theme.textMuted }]}>{teacherMode ? 'CLASSROOM GOALS' : 'FAMILY GOALS'}</Text><Text style={[styles.progressHeading, { color: theme.text }]}>{`Progress by ${terms.profileLower}`}</Text></View><View style={[styles.todayBadge, { backgroundColor: readyCount ? theme.successSoft : theme.primarySoft }]}><Text style={[styles.todayBadgeText, { color: readyCount ? theme.success : theme.primary }]}>{readyCount} reward{readyCount === 1 ? '' : 's'} ready</Text></View></View>
                <View style={styles.childProgressList}>
                  {progress.length === 0 ? <Text style={[styles.emptyProgress, { color: theme.textMuted }]}>Create a profile to begin building personalized reward goals.</Text> : progress.map(({ profile, balance, reward, percent }) => {
                    const accent = getProfileAccent(profile.colorKey);
                    const currency = CURRENCY_META[profile.currencyType];
                    return (
                      <Pressable key={profile.id} onPress={() => onSelectProfile(profile.id)} style={({ pressed }) => [styles.childProgressRow, pressed && styles.pressed]}>
                        <ProfileAvatar avatar={profile.avatar} color={getProfileSoftColor(profile.colorKey)} size={44} theme={theme} />
                        <View style={styles.childProgressCopy}>
                          <View style={styles.childProgressLabelRow}><Text numberOfLines={1} style={[styles.childName, { color: accent }]}>{profile.name}</Text><Text numberOfLines={1} style={[styles.childTaskCount, { color: theme.textMuted }]}>{reward ? `${balance} / ${reward.cost} ${currency.label}` : 'none assigned'}</Text></View>
                          <View style={[styles.progressTrack, { backgroundColor: theme.border }]}><View style={[styles.progressFill, { backgroundColor: accent, width: `${percent}%` as `${number}%` }]} /></View>
                        </View>
                        <Text style={[styles.childPercent, { color: accent }]}>{percent}%</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>

            <View style={[styles.progressPage, carouselWidth ? { width: carouselWidth } : null]}>
              <View style={styles.heroCopy}><Text style={[styles.greeting, { color: theme.primaryStrong }]}>{greetingText}</Text><Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={2} style={[styles.heroTitle, { color: theme.text }]}>Daily Task Progress</Text><Text style={[styles.heroDescription, { color: theme.text }]}>{`See how each ${terms.profileLower} is progressing through today's scheduled tasks.`}</Text></View>
              <View style={[styles.progressCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
                <View style={styles.progressHeadingRow}><View><Text style={[styles.progressEyebrow, { color: theme.textMuted }]}>TODAY'S TASKS</Text><Text style={[styles.progressHeading, { color: theme.text }]}>{`Completion by ${terms.profileLower}`}</Text></View><View style={[styles.todayBadge, { backgroundColor: allTasksComplete ? theme.successSoft : theme.secondarySoft }]}><Text style={[styles.todayBadgeText, { color: allTasksComplete ? theme.success : theme.secondary }]}>{allTasksComplete} finished</Text></View></View>
                <View style={styles.childProgressList}>
                  {dailyTaskProgress.length === 0 ? <Text style={[styles.emptyProgress, { color: theme.textMuted }]}>Create a profile and assign tasks to see today's progress.</Text> : dailyTaskProgress.map(({ profile, completed, total, percent }) => {
                    const accent = getProfileAccent(profile.colorKey);
                    const finished = total > 0 && completed >= total;
                    return (
                      <Pressable key={profile.id} onPress={() => onSelectProfile(profile.id)} style={({ pressed }) => [styles.childProgressRow, pressed && styles.pressed]}>
                        <ProfileAvatar avatar={profile.avatar} color={getProfileSoftColor(profile.colorKey)} size={44} theme={theme} />
                        <View style={styles.childProgressCopy}>
                          <View style={styles.childProgressLabelRow}><Text numberOfLines={1} style={[styles.childName, { color: accent }]}>{profile.name}</Text><Text numberOfLines={1} style={[styles.childTaskCount, { color: theme.textMuted }]}>{total ? `${completed} of ${total} completed` : 'none assigned'}</Text></View>
                          <View style={[styles.progressTrack, { backgroundColor: theme.border }]}><View style={[styles.progressFill, { backgroundColor: finished ? theme.success : accent, width: `${percent}%` as `${number}%` }]} /></View>
                        </View>
                        <Text numberOfLines={1} style={[styles.childPercent, { color: finished ? theme.success : accent }]}>{percent}%</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </View>
          </ScrollView>
          <View style={styles.carouselControls}>
            <Pressable accessibilityLabel="Show reward progress" onPress={() => goToProgressPage(0)} style={[styles.carouselDot, { backgroundColor: progressPage === 0 ? theme.primary : `${theme.primary}55` }]} />
            <Pressable accessibilityLabel="Show daily task progress" onPress={() => goToProgressPage(1)} style={[styles.carouselDot, { backgroundColor: progressPage === 1 ? theme.primary : `${theme.primary}55` }]} />
          </View>
          <Text style={[styles.swipeHint, { color: theme.textMuted }]}>Swipe or tap a dot to switch views</Text>
        </View>
      </View>

      <View style={styles.sectionRow}><View><Text style={[styles.sectionTitle, { color: theme.text }]}>{familySpaceTitle}</Text><Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>{`${terms.profiles}, tasks, and rewards in one place`}</Text></View></View>

      <View style={[styles.profilesCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}> 
        <View style={styles.profilesTopRow}><View style={styles.widgetTitleRow}><View style={[styles.widgetIcon, { backgroundColor: theme.primarySoft }]}><Text style={[styles.widgetIconText, { color: theme.primary }]}>👤</Text></View><View style={styles.widgetCopy}><Text style={[styles.widgetTitle, { color: theme.text }]}>{teacherMode ? 'Classes' : 'Profiles'}</Text><Text style={[styles.widgetDescription, { color: theme.textMuted }]}>{teacherMode ? 'Tap a class to manage its classroom plan.' : 'Tap a child to manage their personal plan.'}</Text></View></View><Pressable onPress={onAddProfile} style={({ pressed }) => [styles.addProfileButton, { backgroundColor: theme.secondary }, pressed && styles.pressed]}><Text style={styles.addProfilePlus}>＋</Text><Text style={styles.addProfileText}>{teacherMode ? 'Add class' : 'Add Profile'}</Text></Pressable></View>
        <View style={styles.profileGrid}>
          {profiles.map((profile) => {
            const balance = getProfileBalance(profile, tasks, rewards);
            const currency = CURRENCY_META[profile.currencyType];
            return <Pressable accessibilityLabel={`Open ${profile.name}'s profile`} key={profile.id} onPress={() => onSelectProfile(profile.id)} style={({ pressed }) => [styles.profileItem, { backgroundColor: getProfileSoftColor(profile.colorKey), borderColor: theme.border }, pressed && styles.pressed]}><ProfilePatternOverlay color={getProfileAccent(profile.colorKey)} pattern={profile.pattern} /><ProfileAvatar avatar={profile.avatar} color={theme.surface} size={82} theme={theme} /><Text numberOfLines={1} style={[styles.profileName, { color: getProfileAccent(profile.colorKey) }]}>{profile.name}</Text><View style={styles.profileCurrencyRow}><CurrencyIcon color={currency.color} size={14} type={profile.currencyType} /><Text style={[styles.profileStars, { color: currency.color }]}>{balance} {currencyWord(profile.currencyType, balance)}</Text></View></Pressable>;
          })}
          {profiles.length === 0 ? <Pressable onPress={onAddProfile} style={[styles.emptyProfiles, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}><Text style={styles.emptyProfilesIcon}>＋</Text><Text style={[styles.emptyProfilesTitle, { color: theme.text }]}>{teacherMode ? 'Create the first class' : 'Create the first profile'}</Text><Text style={[styles.emptyProfilesText, { color: theme.textMuted }]}>{teacherMode ? 'Add a class to begin.' : 'Add a child to begin.'}</Text></Pressable> : null}
        </View>
      </View>

      <View style={styles.compactGrid}>
        <View style={styles.compactGridItem}><CompactFeatureCard accentSoft={theme.rewardSoft} description="Create and assign reusable rewards." kind="reward" onPress={() => onOpenFeature('rewards')} theme={theme} title="Rewards" /></View>
        <View style={styles.compactGridItem}><CompactFeatureCard accentSoft={theme.secondarySoft} description="Create and assign reusable tasks." kind="task" onPress={() => onOpenFeature('tasks')} theme={theme} title="Tasks" /></View>
      </View>
      <View style={[styles.encouragement, { backgroundColor: theme.secondarySoft }]}><Text style={styles.encouragementEmoji}>🌱</Text><View style={styles.encouragementCopy}><Text style={[styles.encouragementTitle, { color: theme.text }]}>Positive Reinforcement</Text><Text style={[styles.encouragementText, { color: theme.textMuted }]}>Positive reinforcement helps children turn effort into confidence, good choices into lasting habits, and small wins into lifelong growth.</Text></View></View>
    </View>
  );
}

type CompactFeatureCardProps = { title: string; description: string; kind: 'task' | 'reward'; accentSoft: string; theme: AppTheme; onPress: () => void };
function CompactFeatureCard({ title, description, kind, accentSoft, theme, onPress }: CompactFeatureCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.compactCard,
        { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.compactIconCenter}>
        <CategoryIcon backgroundColor={accentSoft} kind={kind} size={92} theme={theme} />
      </View>
      <Text numberOfLines={1} style={[styles.compactTitle, { color: theme.text }]}>{title}</Text>
      <Text numberOfLines={2} style={[styles.compactDescription, { color: theme.textMuted }]}>{description}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 }, brandRow: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 11, minWidth: 0, paddingRight: 10 }, logoMark: { alignItems: 'center', borderRadius: 14, height: 43, justifyContent: 'center', width: 43 }, teacherApple:{fontSize:24,lineHeight:28},
  brandLogoImage:{borderRadius:14,height:43,width:43}, logoStar: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' }, brandName: { flexShrink: 1, fontSize: 18, fontWeight: '900' }, brandTagline: { fontSize: 12, marginTop: 1 }, parentAvatar: { alignItems: 'center', borderRadius: 16, height: 43, justifyContent: 'center', width: 43 }, parentInitial: { fontSize: 15, fontWeight: '900' },
  approvalBanner: { alignItems: 'center', borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 12, marginBottom: 14, padding: 15 }, approvalEmoji: { fontSize: 24 }, approvalCopy: { flex: 1 }, approvalTitle: { fontSize: 14, fontWeight: '900' }, approvalText: { fontSize: 12, lineHeight: 15, marginTop: 3 }, approvalArrow: { fontSize: 27 },
  hero: { borderRadius: 29, borderWidth:1, gap: 18, marginBottom: 30, overflow: 'hidden', paddingHorizontal: 18, paddingVertical: 20, shadowOffset: { width: 0, height: 12 }, shadowOpacity: Platform.OS === 'ios' ? 0.14 : 0, shadowRadius: 28, elevation: 4 }, heroGlowOne: { borderRadius: 999, height: 190, opacity: 0.2, position: 'absolute', right: -50, top: -80, width: 190 }, heroGlowTwo: { borderRadius: 999, bottom: -85, height: 180, left: -65, opacity: 0.1, position: 'absolute', width: 180 }, heroCopy: { gap: 8, minHeight: 112 }, greeting: { fontSize: 14, fontWeight: '800', opacity: 0.72 }, heroTitle: { flexShrink: 1, fontSize: 28, fontWeight: '900', letterSpacing: -0.8, lineHeight: 33 }, heroDescription: { fontSize: 14, lineHeight: 19 },
  progressPage: { gap: 20, minWidth: 280 }, carouselControls: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 14 }, carouselDot: { borderRadius: 999, height: 9, width: 9 }, swipeHint: { fontSize: 12, marginTop: 7, textAlign: 'center' }, progressCard: { borderRadius: 22, borderWidth:1, paddingHorizontal: 14, paddingVertical: 16 }, progressHeadingRow: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginBottom: 16 }, progressEyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1 }, progressHeading: { flexShrink: 1, fontSize: 18, fontWeight: '900', marginTop: 3 }, todayBadge: { borderRadius: 999, flexShrink: 0, paddingHorizontal: 9, paddingVertical: 7 }, todayBadgeText: { fontSize: 12, fontWeight: '900' }, childProgressList: { gap: 14 }, childProgressRow: { alignItems: 'center', flexDirection: 'row', gap: 8 }, childProgressCopy: { flex: 1, gap: 7, minWidth:0 }, childProgressLabelRow: { alignItems: 'center', flexDirection: 'row', gap: 5, justifyContent: 'space-between' }, childName: { flex:1, flexShrink: 1, fontSize: 14, fontWeight: '900', minWidth:0 }, childTaskCount: { flexShrink: 1, fontSize: 11, fontWeight: '700', maxWidth:'58%', textAlign: 'right' }, progressTrack: { borderRadius: 999, height: 7, overflow: 'hidden' }, progressFill: { borderRadius: 999, height: '100%' }, childPercent: { flexShrink:0,fontSize: 13, fontWeight: '900', minWidth: 42, textAlign: 'right' }, emptyProgress: { fontSize: 13, lineHeight: 17 },
  sectionRow: { alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 }, sectionTitle: { fontSize: 22, fontWeight: '900' }, sectionSubtitle: { fontSize: 14, marginTop: 3 }, liveChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 }, liveChipText: { fontSize: 12, fontWeight: '900' },
  profilesCard: { borderRadius: 25, borderWidth: 1, marginBottom: 13, padding: 18, shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.06, shadowRadius: 22, elevation: 2 }, profilesTopRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' }, widgetTitleRow: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 12 }, widgetIcon: { alignItems: 'center', borderRadius: 16, height: 50, justifyContent: 'center', width: 50 }, widgetIconText: { fontSize: 23, fontWeight: '900' }, widgetCopy: { flex: 1 }, widgetTitle: { fontSize: 20, fontWeight: '900' }, widgetDescription: { fontSize: 13, lineHeight: 16, marginTop: 3 }, addProfileButton: { alignItems: 'center', borderRadius: 15, flexDirection: 'row', gap: 5, minHeight: 42, paddingHorizontal: 13, paddingVertical: 10 }, addProfilePlus: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' }, addProfileText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' }, profileGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 18 }, profileItem: { alignItems: 'center', borderRadius: 21, borderWidth: 1, flexBasis: '47%', flexGrow: 1, gap: 7, justifyContent: 'center', minHeight: 154, minWidth: 138, overflow: 'hidden', paddingHorizontal: 12, paddingVertical: 15 }, profileName: { fontSize: 15, fontWeight: '900', maxWidth: '100%' }, profileCurrencyRow: { alignItems: 'center', flexDirection: 'row', gap: 4 }, profileStars: { fontSize: 12, fontWeight: '900' }, emptyProfiles: { alignItems: 'center', borderRadius: 19, borderStyle: 'dashed', borderWidth: 1.5, flex: 1, minHeight: 135, minWidth: 210, padding: 20 }, emptyProfilesIcon: { fontSize: 31 }, emptyProfilesTitle: { fontSize: 14, fontWeight: '900', marginTop: 5 }, emptyProfilesText: { fontSize: 12, marginTop: 4 },
  compactGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 13 }, compactGridItem: { flex: 1, flexBasis: 160, minWidth: 0 }, compactCard: { alignItems: 'center', borderRadius: 25, borderWidth: 1, justifyContent: 'center', minHeight: 232, paddingHorizontal: 18, paddingVertical: 20, shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.06, shadowRadius: 22, elevation: 2 }, compactIconCenter:{alignItems:'center',justifyContent:'center',marginBottom:14,width:'100%'},compactTopRow: { alignItems: 'center', justifyContent: 'center', marginBottom: 16, width: '100%' }, compactIcon: { alignItems: 'center', borderRadius: 15, height: 47, justifyContent: 'center', width: 47 }, compactIconText: { fontSize: 23, fontWeight: '900' },  compactTitle: { fontSize: 21, fontWeight: '900', marginBottom: 6, textAlign: 'center', width: '100%' }, compactDescription: { fontSize: 13, lineHeight: 18, textAlign: 'center', width: '100%' }, iconPreviewRow: { alignItems: 'center', flexDirection: 'row', marginTop: 13 }, iconOverlap: { marginLeft: -7 }, noItems: { fontSize: 12, marginTop: 15 },
  encouragement: { alignItems: 'center', borderRadius: 22, flexDirection: 'row', gap: 14, marginTop: 16, padding: 18 }, encouragementEmoji: { fontSize: 28 }, encouragementCopy: { flex: 1 }, encouragementTitle: { fontSize: 15, fontWeight: '900' }, encouragementText: { fontSize: 13, lineHeight: 17, marginTop: 3 }, pressed: { opacity: 0.75 },
});
