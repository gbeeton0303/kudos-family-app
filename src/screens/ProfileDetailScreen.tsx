import { CurrencyIcon } from '../components/CurrencyIcon';
import { useMemo, useState } from 'react';
import { Alert, Image, type ImageSourcePropType, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { AddItemModal } from '../components/AddItemModal';
import { useClassroomMode } from '../context/ClassroomModeContext';
import { CurrencyStorage } from '../components/CurrencyStorage';
import { ItemIconView } from '../components/ItemIconView';
import { CategoryIcon } from '../components/CategoryIcon';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { ProfilePatternOverlay } from '../components/ProfilePatternOverlay';
import { CURRENCY_META, currencyWord } from '../data/currency';
import { getProfileAccent, getProfileSoftColor } from '../data/profileStyles';
import {
  canCompleteTask,
  formatTaskFrequency,
  formatTaskSchedule,
  getNextRewardProgress,
  getTaskPeriodKey,
  getProfileBalance,
  getRewardEvents,
  getTodayProgress,
  hasTaskCompletionForPeriod,
  isRewardAssignedToProfile,
  isTaskAssignedToProfile,
} from '../data/familyData';
import type { AppTheme } from '../theme';
import type { AppMode, ChildProfile, ChildReward, ChildTask, NewRewardInput, NewTaskInput, RewardDelivery, TaskCompletionRequest } from '../types';

type ProfileDetailScreenProps = {
  mode: AppMode;
  profile: ChildProfile;
  tasks: ChildTask[];
  rewards: ChildReward[];
  completionRequests: TaskCompletionRequest[];
  rewardDeliveries: RewardDelivery[];
  theme: AppTheme;
  onBack: () => void;
  onDeleteProfile: () => void;
  onEditProfile?: () => void;
  onAddTask: (input: NewTaskInput) => void;
  onUpdateTask: (taskId: string, input: NewTaskInput) => void;
  onAddReward: (input: NewRewardInput) => void;
  onUpdateReward: (rewardId: string, input: NewRewardInput) => void;
  onCompleteTask: (taskId: string, profileId: string, date?: Date, allowRepeatDaily?: boolean) => void;
  onUndoLatestTaskCompletion: (profileId: string) => void;
  onUndoTaskCompletion: (taskId: string, profileId: string) => void;
  onRequestTaskCompletion: (taskId: string, profileId: string) => void;
  onSetTaskAssigned: (taskId: string, profileId: string, assigned: boolean) => void;
  onSetRewardAssigned: (rewardId: string, profileId: string, assigned: boolean) => void;
  onRedeemReward: (rewardId: string, profileId: string, allowEarly?: boolean, deliverToChild?: boolean) => void;
  onOpenRewardDelivery: (deliveryId: string) => void;
  onOpenLibrary?: (library: 'tasks' | 'rewards') => void;
};

export function ProfileDetailScreen({
  mode,
  profile,
  tasks,
  rewards,
  completionRequests,
  rewardDeliveries,
  theme,
  onBack,
  onDeleteProfile,
  onEditProfile,
  onAddTask,
  onUpdateTask,
  onAddReward,
  onUpdateReward,
  onCompleteTask,
  onUndoLatestTaskCompletion,
  onUndoTaskCompletion,
  onRequestTaskCompletion,
  onSetTaskAssigned,
  onSetRewardAssigned,
  onRedeemReward,
  onOpenRewardDelivery,
  onOpenLibrary,
}: ProfileDetailScreenProps) {
  const { teacherMode, terms } = useClassroomMode();
  const isParent = mode === 'parent';
  const { width: windowWidth } = useWindowDimensions();
  // The app's centered content is capped at 960 points with 20 points of
  // horizontal padding on each side. Match that usable width so an iPad shows
  // exactly one full progress card instead of a narrow card plus part of the
  // next page.
  const progressPageWidth = Math.max(1, Math.min(windowWidth - 40, 920));
  const [activeTab, setActiveTab] = useState<'tasks' | 'rewards'>('tasks');
  const [progressPage, setProgressPage] = useState(0);
  const [addMode, setAddMode] = useState<'task' | 'reward' | null>(null);
  const [taskToEdit, setTaskToEdit] = useState<ChildTask | null>(null);
  const [removingTasks, setRemovingTasks] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());
  const [rewardToEdit, setRewardToEdit] = useState<ChildReward | null>(null);
  const [submitTaskCandidate, setSubmitTaskCandidate] = useState<ChildTask | null>(null);
  const [rewardPrompt, setRewardPrompt] = useState<{ kind: 'redeem' | 'early' | 'remove'; reward: ChildReward } | null>(null);
  const [trackedRewardId, setTrackedRewardId] = useState<string | null>(null);
  const [rewardTrackerOpen, setRewardTrackerOpen] = useState(false);
  const profileTasks = useMemo(() => tasks.filter((task) => isTaskAssignedToProfile(task, profile.id)), [profile.id, tasks]);
  const profileRewards = useMemo(() => rewards.filter((reward) => isRewardAssignedToProfile(reward, profile.id)), [profile.id, rewards]);
  const assignedTaskCount = profileTasks.length;
  const pendingTaskIds = useMemo(() => new Set(
    completionRequests
      .filter((request) => {
        if (request.profileId !== profile.id || request.status !== 'pending') return false;
        const task = profileTasks.find((item) => item.id === request.taskId);
        if (!task) return false;
        const currentPeriod = getTaskPeriodKey(task.frequency, new Date());
        const requestPeriod = request.periodKey ?? getTaskPeriodKey(task.frequency, new Date(request.requestedAt));
        return task.frequency === 'unlimited' || requestPeriod === currentPeriod;
      })
      .map((request) => request.taskId)
  ), [completionRequests, profile.id, profileTasks]);
  const approvedTaskIds = useMemo(() => new Set(
    completionRequests.filter((request) => {
      if (request.profileId !== profile.id || request.status !== 'approved') return false;
      const task = profileTasks.find((item) => item.id === request.taskId);
      if (!task || task.frequency === 'unlimited') return false;
      return getTaskPeriodKey(task.frequency, new Date(request.requestedAt)) === getTaskPeriodKey(task.frequency, new Date());
    }).map((request) => request.taskId)
  ), [completionRequests, profile.id, profileTasks]);
  const hasAnyTaskCompletion = useMemo(() => profileTasks.some((task) => (task.completionEvents[profile.id] ?? []).length > 0), [profile.id, profileTasks]);
  const waitingRewards = useMemo(() => rewardDeliveries.filter((delivery) => delivery.profileId === profile.id && delivery.status === 'waiting').sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()), [profile.id, rewardDeliveries]);
  const balance = getProfileBalance(profile, tasks, rewards);
  const todayProgress = getTodayProgress(profile.id, tasks);
  const defaultRewardProgress = getNextRewardProgress(profile, tasks, rewards);
  const currency = CURRENCY_META[profile.currencyType];
  const trackedReward = profileRewards.find((reward) => reward.id === trackedRewardId) ?? defaultRewardProgress.reward ?? profileRewards[0];
  const nextReward = trackedReward;
  const goalAmount = nextReward?.cost ?? Math.max(25, balance || 25);
  const rewardProgress = {
    reward: nextReward,
    percent: nextReward ? Math.min(100, Math.round((balance / Math.max(1, nextReward.cost)) * 100)) : 0,
  };
  const accent = getProfileAccent(profile.colorKey);
  const accentSoft = getProfileSoftColor(profile.colorKey);


  const confirmDeleteProfile = () => Alert.alert(
    `Delete ${profile.name}'s profile?`,
    'This permanently removes the profile and its task, reward, completion, request, and redemption history.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete profile', style: 'destructive', onPress: onDeleteProfile }],
  );

  const toggleTaskRemoval = (taskId: string) => setSelectedTaskIds((current) => {
    const next = new Set(current);
    if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
    return next;
  });
  const cancelTaskRemoval = () => { setRemovingTasks(false); setSelectedTaskIds(new Set()); };
  const confirmTaskRemoval = () => {
    selectedTaskIds.forEach((taskId) => onSetTaskAssigned(taskId, profile.id, false));
    cancelTaskRemoval();
  };

  const confirmRemoveReward = (reward: ChildReward) => {
    setRewardPrompt({ kind: 'remove', reward });
  };


  const confirmRedeem = (reward: ChildReward, allowEarly = balance < reward.cost) => {
    setRewardPrompt({ kind: allowEarly ? 'early' : 'redeem', reward });
  };

  const confirmRewardPrompt = () => {
    if (!rewardPrompt) return;
    const { kind, reward } = rewardPrompt;
    setRewardPrompt(null);
    if (kind === 'remove') {
      onSetRewardAssigned(reward.id, profile.id, false);
      return;
    }
    if (kind === 'early') {
      onRedeemReward(reward.id, profile.id, true, true);
      return;
    }
    onRedeemReward(reward.id, profile.id, false, true);
  };

  const redeemRewardNow = () => {
    if (!rewardPrompt || (rewardPrompt.kind !== 'redeem' && rewardPrompt.kind !== 'early')) return;
    const { reward, kind } = rewardPrompt;
    setRewardPrompt(null);
    onRedeemReward(reward.id, profile.id, kind === 'early', false);
  };


  const submitChildTask = (task: ChildTask) => {
    setSubmitTaskCandidate(task);
  };

  const confirmRepeatDailyTask = (task: ChildTask) => {
    Alert.alert(
      'Complete This Task Again?',
      "This task has already been completed for the assigned time period. Are you sure you'd like to complete again?",
      [
        { text: 'No', style: 'cancel' },
        { text: 'Yes', onPress: () => onCompleteTask(task.id, profile.id, new Date(), true) },
      ],
    );
  };

  const confirmSubmitChildTask = () => {
    if (!submitTaskCandidate) return;
    const task = submitTaskCandidate;
    setSubmitTaskCandidate(null);
    onRequestTaskCompletion(task.id, profile.id);
  };


  return (
    <View>
      <View style={styles.topBar}>
        {isParent ? <Pressable accessibilityLabel="Back to dashboard" onPress={onBack} style={[styles.circleButton, { backgroundColor: theme.surface }]}><Text style={[styles.backIcon, { color: theme.text }]}>‹</Text></Pressable> : <View style={styles.circleSpacer} />}
        <View style={styles.modeTitleWrap}><Text style={[styles.topBarTitle, { color: accent }]}>{teacherMode ? `${profile.name} class profile` : `${profile.name}'s profile`}</Text><Text style={[styles.modeLabel, { color: isParent ? theme.primary : theme.secondary }]}>{isParent ? (teacherMode ? 'TEACHER CONTROLS' : 'PARENT CONTROLS') : 'CHILD VIEW'}</Text></View>
        {onEditProfile ? <Pressable accessibilityRole="button" onPress={onEditProfile} style={[styles.editProfileButton, { backgroundColor: theme.primarySoft, borderColor: theme.primary }]}><Text style={[styles.editProfileButtonText, { color: theme.primary }]}>✎ Edit</Text></Pressable> : <View style={styles.circleSpacer} />}
      </View>

      <View style={[styles.hero, { backgroundColor: accentSoft, borderColor: accent, shadowColor: theme.shadow }]}> 
        <ProfilePatternOverlay color={accent} pattern={profile.pattern} />
        <ProfileAvatar avatar={profile.avatar} color={theme.surface} size={82} theme={theme} />
        <View style={styles.heroCopy}>
          <Text style={[styles.eyebrow, { color: accent }]}>★  MY KUDOS  ★</Text>
          <Text style={[styles.name, { color: accent }]}>{profile.name}</Text>
          <View style={styles.heroStats}>
            <View style={[styles.statPill, { backgroundColor: theme.surface }]}><Text style={styles.statEmoji}>✓</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.statPillText, { color: theme.textMuted }]}>{assignedTaskCount} Tasks</Text></View>
            <View style={[styles.statPill, { backgroundColor: theme.surface }]}><Text style={styles.statEmoji}>★</Text><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.82} style={[styles.statPillText, { color: theme.textMuted }]}>{profileRewards.length} Rewards</Text></View>
          </View>
        </View>
      </View>

      {!isParent && waitingRewards.length > 0 ? (
        <View style={[styles.giftCenter, { backgroundColor: theme.rewardSoft, borderColor: theme.reward }]}>
          <View style={styles.giftHeading}>
            <Image
              resizeMode="contain"
              source={require('../../assets/branding/child-reward-waiting-trophy.png')}
              style={styles.giftWaitingIcon}
            />
            <View style={styles.giftHeadingCopy}>
              <Text style={[styles.giftTitle, { color: theme.text }]}>{waitingRewards.length === 1 ? 'A reward is waiting for you!' : `${waitingRewards.length} rewards are waiting!`}</Text>
              <Text style={[styles.giftSubtitle, { color: theme.textMuted }]}>Your Parent Sent A Special Reward. Open It For A Celebration!</Text>
            </View>
          </View>
          {waitingRewards.map((delivery) => (
            <View key={delivery.id} style={[styles.giftRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <ItemIconView backgroundColor={theme.rewardSoft} icon={delivery.rewardIcon} size={52} theme={theme} />
              <View style={styles.giftCopy}>
                <Text style={[styles.giftRewardTitle, { color: theme.text }]}>{delivery.rewardTitle}</Text>
                <Text style={[styles.giftMeta, { color: currency.color }]}>Gift sent · {delivery.cost} {currencyWord(profile.currencyType, delivery.cost)}</Text>
              </View>
              <Pressable onPress={() => onOpenRewardDelivery(delivery.id)} style={({ pressed }) => [styles.openGiftButton, { backgroundColor: theme.reward }, pressed && styles.pressed]}>
                <Text style={styles.openGiftText}>Open & redeem 🎉</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <CurrencyStorage
        balance={balance}
        goalAmount={goalAmount}
        goalLabel={nextReward?.title}
        onGoalPress={profileRewards.length > 1 ? () => setRewardTrackerOpen(true) : undefined}
        profile={profile}
        theme={theme}
      />

      <View style={styles.progressPagerWrap}>
        <ScrollView
          alwaysBounceHorizontal={false}
          bounces={false}
          decelerationRate="fast"
          horizontal
          onMomentumScrollEnd={(event) => {
            const nextPage = Math.round(event.nativeEvent.contentOffset.x / Math.max(1, progressPageWidth));
            setProgressPage(Math.max(0, Math.min(1, nextPage)));
          }}
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          snapToInterval={progressPageWidth}
          style={{ width: progressPageWidth }}
        >
          <View style={[styles.progressCard, { backgroundColor: theme.surface, borderColor: theme.border, width: progressPageWidth }]}>
            <View style={styles.progressHeader}>
              <View style={styles.progressCopy}><View style={styles.progressEyebrowRow}><Text style={[styles.progressSparkle, { color: accent }]}>✨</Text><Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={[styles.progressEyebrow, { color: accent }]}>PROGRESS TO NEXT REWARD</Text><Text style={[styles.progressSparkle, { color: accent }]}>✨</Text></View><View style={styles.progressDetailRow}><Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={[styles.progressTitle, { color: theme.text }]}>{nextReward ? `${balance} of ${nextReward.cost} ${currencyWord(profile.currencyType, nextReward.cost)}` : 'Add a reward to track progress'}</Text><Text numberOfLines={1} style={[styles.progressPercent, { color: accent }]}>{rewardProgress.percent}%</Text></View></View>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: theme.border }]}><View style={[styles.progressFill, { backgroundColor: accent, width: `${rewardProgress.percent}%` as `${number}%` }]} /></View>
          </View>
          <View style={[styles.progressCard, { backgroundColor: theme.surface, borderColor: theme.border, width: progressPageWidth }]}>
            <View style={styles.progressHeader}>
              <View style={styles.progressCopy}><View style={styles.progressEyebrowRow}><Text style={[styles.progressSparkle, { color: accent }]}>✨</Text><Text adjustsFontSizeToFit minimumFontScale={0.82} numberOfLines={1} style={[styles.progressEyebrow, { color: accent }]}>TODAY'S PROGRESS</Text><Text style={[styles.progressSparkle, { color: accent }]}>✨</Text></View><View style={styles.progressDetailRow}><Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={[styles.progressTitle, { color: theme.text }]}>{todayProgress.completed} of {todayProgress.total} approved</Text><Text numberOfLines={1} style={[styles.progressPercent, { color: accent }]}>{todayProgress.percent}%</Text></View></View>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: theme.border }]}><View style={[styles.progressFill, { backgroundColor: accent, width: `${todayProgress.percent}%` as `${number}%` }]} /></View>
          </View>
        </ScrollView>
        <View style={styles.progressPagerFooter}>
          <View style={styles.progressDots}>
            <View style={[styles.progressDot, { backgroundColor: progressPage === 0 ? accent : theme.border }]} />
            <View style={[styles.progressDot, { backgroundColor: progressPage === 1 ? accent : theme.border }]} />
          </View>
          <Text style={[styles.progressSwipeHint, { color: theme.textMuted }]}>Swipe to see progress</Text>
        </View>
      </View>

      <View style={[styles.tabs, { backgroundColor: theme.surfaceMuted }]}> 
        {(['tasks', 'rewards'] as const).map((tab) => {
          const selected = activeTab === tab;
          return <Pressable key={tab} onPress={() => setActiveTab(tab)} style={[styles.tab, selected && { backgroundColor: theme.surface, shadowColor: theme.shadow }]}><CategoryIcon backgroundColor="transparent" kind={tab === 'tasks' ? 'task' : 'reward'} size={24} theme={theme} /><Text style={[styles.tabText, { color: selected ? theme.text : theme.textMuted }]}>{tab === 'tasks' ? 'Tasks' : 'Rewards'}</Text></Pressable>;
        })}
      </View>

      {activeTab === 'tasks' ? (
        <View>
          <View style={styles.taskSectionHeading}>
            <Text style={[styles.sectionHeading, { color: theme.text }]}>Assigned Tasks</Text>
            {isParent ? <View style={styles.taskToolbar}>
              <View>{removingTasks ? <View style={styles.bulkRemoveActions}><Pressable onPress={cancelTaskRemoval} style={[styles.bulkCancelButton, { borderColor: theme.border }]}><Text style={[styles.bulkCancelText, { color: theme.textMuted }]}>Cancel</Text></Pressable><Pressable disabled={!selectedTaskIds.size} onPress={confirmTaskRemoval} style={[styles.bulkConfirmButton, { backgroundColor: selectedTaskIds.size ? theme.danger : theme.surfaceMuted }]}><Text style={[styles.bulkConfirmText, { color: selectedTaskIds.size ? '#FFFFFF' : theme.textMuted }]}>Confirm{selectedTaskIds.size ? ` (${selectedTaskIds.size})` : ''}</Text></Pressable></View> : <Pressable onPress={() => setRemovingTasks(true)} style={[styles.bulkRemoveButton, { backgroundColor: theme.dangerSoft }]}><Text style={[styles.bulkRemoveText, { color: theme.danger }]}>Remove</Text></Pressable>}</View>
              <View style={styles.taskHeaderActions}><Pressable disabled={!hasAnyTaskCompletion} onPress={() => onUndoLatestTaskCompletion(profile.id)} style={({ pressed }) => [styles.undoTaskButton, { backgroundColor: hasAnyTaskCompletion ? theme.rewardSoft : theme.surfaceMuted, borderColor: hasAnyTaskCompletion ? theme.reward : theme.border }, pressed && styles.pressed]}><Text style={[styles.undoTaskButtonText, { color: hasAnyTaskCompletion ? theme.reward : theme.textMuted }]}>Undo Task</Text></Pressable><Pressable onPress={() => setAddMode('task')} style={({ pressed }) => [styles.taskAddButton, { backgroundColor: theme.secondary }, pressed && styles.pressed]}><Text style={styles.taskActionButtonText}>＋ Task</Text></Pressable></View>
            </View> : <Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>After completing a task, press the value number to submit to your parent.</Text>}
            {isParent && removingTasks ? <Text style={[styles.selectionHint, { color: theme.textMuted }]}>Select tasks below, then tap Confirm.</Text> : null}
          </View>
          <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
            {profileTasks.length === 0 ? <EmptyState icon="✓" title="No tasks assigned" text={isParent ? `Add one here or assign one from the ${terms.workspaceLower} Task Library.` : `Your ${terms.adultLower} has not assigned any tasks yet.`} theme={theme} /> : profileTasks.map((task, index) => {
              const completed = hasTaskCompletionForPeriod(task, profile.id) || approvedTaskIds.has(task.id);
              const unlimited = task.frequency === 'unlimited';
              const pending = pendingTaskIds.has(task.id);
              const available = canCompleteTask(task, profile.id);
              const canRepeatDaily = isParent && task.frequency === 'daily' && completed && !pending;
              const disabled = pending || (completed && !canRepeatDaily) || (!unlimited && !available && !canRepeatDaily);
              const actionLabel = pending ? 'Pending' : completed ? 'Approved' : !available ? 'Not today' : 'Complete';
              return (
                <View key={task.id} style={[styles.taskRow, index !== profileTasks.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}> 
                  {isParent && removingTasks ? <Pressable accessibilityLabel={`${selectedTaskIds.has(task.id) ? 'Deselect' : 'Select'} ${task.title}`} onPress={() => toggleTaskRemoval(task.id)} style={[styles.taskSelect, { backgroundColor: selectedTaskIds.has(task.id) ? theme.danger : theme.surface, borderColor: selectedTaskIds.has(task.id) ? theme.danger : theme.border }]}><Text style={[styles.taskSelectText, { color: selectedTaskIds.has(task.id) ? '#FFFFFF' : theme.textMuted }]}>{selectedTaskIds.has(task.id) ? '✓' : ''}</Text></Pressable> : null}
                  <ItemIconView backgroundColor={theme.secondarySoft} icon={task.icon} size={42} theme={theme} />
                  <View style={styles.taskCopy}>
                    <View style={styles.taskTitleRow}><Text numberOfLines={1} style={[styles.taskTitle, { color: theme.text }, completed && !unlimited && styles.completedTitle]}>{task.title}</Text><View style={[styles.frequencyBadge, { backgroundColor: unlimited ? theme.rewardSoft : theme.secondarySoft }]}><Text style={[styles.frequencyBadgeText, { color: unlimited ? theme.reward : theme.secondary }]}>{formatTaskFrequency(task.frequency)}</Text></View></View>
                    {task.description || (task.frequency !== 'unlimited' && task.frequency !== 'daily') ? <Text numberOfLines={1} style={[styles.taskDescription, { color: theme.textMuted }]}>{task.frequency === 'unlimited' || task.frequency === 'daily' ? task.description : `${formatTaskSchedule(task)}${task.description ? ` · ${task.description}` : ''}`}</Text> : null}
                    {pending || unlimited ? <Text style={[styles.taskMeta, { color: pending ? theme.reward : theme.textMuted }]}>{pending ? `Waiting for ${terms.adultLower} approval` : 'Can be completed again after approval'}</Text> : null}
                    {isParent && !removingTasks ? <View style={styles.taskManageRow}><Pressable accessibilityLabel={`Edit ${task.title}`} onPress={() => { setTaskToEdit(task); setAddMode('task'); }} style={({ pressed }) => [styles.rowEditButton, { backgroundColor: theme.primarySoft }, pressed && styles.pressed]}><Text style={[styles.rowEditButtonText,{color:theme.primary}]}>Edit</Text></Pressable></View> : null}
                  </View>
                  {!removingTasks ? <Pressable accessibilityLabel={canRepeatDaily ? `Complete ${task.title} again` : undefined} disabled={disabled} onPress={() => isParent ? (canRepeatDaily ? confirmRepeatDailyTask(task) : onCompleteTask(task.id, profile.id)) : submitChildTask(task)} style={({ pressed }) => [styles.actionButton, { backgroundColor: pending ? theme.rewardSoft : completed ? theme.successSoft : theme.rewardSoft }, pressed && styles.pressed]}>{!pending && !completed && available ? <View style={styles.actionCurrencyRow}><Text style={[styles.actionButtonText, { color: currency.color }]}>+{task.amount}</Text><CurrencyIcon color={currency.color} size={18} type={profile.currencyType} /></View> : <Text style={[styles.actionButtonText, { color: pending ? theme.reward : completed ? theme.success : currency.color }]}>{actionLabel}</Text>}</Pressable> : null}
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <View>
          <View style={styles.sectionHeadingRow}>
            <View style={styles.sectionHeadingCopy}><Text style={[styles.sectionHeading, { color: theme.text }]}>Reward Goals</Text><Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>{isParent ? `Redeem rewards or manage ${profile.name}'s reward list.` : `See what you can unlock with your ${currency.label}.`}</Text></View>
            {isParent ? <Pressable onPress={() => setAddMode('reward')} style={({ pressed }) => [styles.addButton, { backgroundColor: theme.reward }, pressed && styles.pressed]}><Text style={styles.addButtonText}>＋ Add Reward</Text></Pressable> : null}
          </View>
          <View style={styles.rewardList}>
            {profileRewards.length === 0 ? <View style={[styles.listCard, { backgroundColor: theme.surface, borderColor: theme.border }]}><EmptyState imageSource={require('../../assets/branding/reward-trophy.png')} title="No rewards assigned" text={isParent ? `Create one here or assign one from the ${terms.workspaceLower} Reward Library.` : `Your ${terms.adultLower} has not assigned a reward yet.`} theme={theme} /></View> : [...profileRewards].sort((a, b) => a.cost - b.cost).map((reward) => {
              const percent = Math.min(100, Math.round((balance / reward.cost) * 100));
              const ready = balance >= reward.cost;
              const redeemedCount = getRewardEvents(reward, profile.id).length;
              return (
                <Pressable disabled={!isParent} key={reward.id} onPress={() => isParent ? confirmRedeem(reward, !ready) : undefined} style={({ pressed }) => [styles.rewardCard, { backgroundColor: theme.surface, borderColor: ready ? theme.success : theme.border, shadowColor: theme.shadow }, pressed && isParent && styles.pressed]}> 
                  <View style={styles.rewardTopRow}>
                    <ItemIconView backgroundColor={theme.rewardSoft} icon={reward.icon} size={54} theme={theme} />
                    <View style={styles.rewardCopy}><Text style={[styles.rewardTitle, { color: theme.text }]}>{reward.title}</Text>{isParent ? <Pressable accessibilityLabel={`Edit ${reward.title}`} onPress={(event) => { event.stopPropagation(); setRewardToEdit(reward); setAddMode('reward'); }} style={[styles.rewardEditButton, { backgroundColor: theme.rewardSoft }]}><Text style={[styles.rewardEditButtonText, { color: theme.reward }]}>Edit</Text></Pressable> : null}<Text style={[styles.rewardMeta, { color: theme.textMuted }]}>{balance} of {reward.cost} {currency.label}{redeemedCount ? ` · redeemed ${redeemedCount}×` : ''}</Text></View>
                    {isParent ? <Pressable onPress={(event) => { event.stopPropagation(); confirmRedeem(reward, !ready); }} style={[styles.redeemButton, { backgroundColor: ready ? theme.success : theme.rewardSoft }]}><Text style={[styles.redeemButtonText, { color: ready ? '#FFFFFF' : theme.reward }]}>{ready ? (teacherMode ? 'Redeem' : 'Ready!') : 'Redeem Early'}</Text></Pressable> : <View style={[styles.readOnlyRewardBadge, { backgroundColor: ready ? theme.successSoft : theme.rewardSoft }]}><Text style={[styles.readOnlyRewardText, { color: ready ? theme.success : theme.reward }]}>{ready ? 'Ready! 🎉' : `${percent}%`}</Text></View>}
                    {isParent ? <Pressable accessibilityLabel={`Remove ${reward.title} from profile`} onPress={(event) => { event.stopPropagation(); confirmRemoveReward(reward); }} style={({ pressed }) => [styles.rowDeleteButton, { backgroundColor: theme.dangerSoft }, pressed && styles.pressed]}><Text style={[styles.rowDeleteText, { color: theme.danger }]}>×</Text></Pressable> : null}
                  </View>
                  <View style={[styles.rewardTrack, { backgroundColor: theme.border }]}><View style={[styles.rewardFill, { backgroundColor: ready ? theme.success : theme.reward, width: `${percent}%` as `${number}%` }]} /></View>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {isParent ? <View style={[styles.dangerZone, { backgroundColor: theme.dangerSoft, borderColor: theme.danger }]}><View style={styles.dangerCopy}><Text style={[styles.dangerTitle, { color: theme.danger }]}>{teacherMode ? 'Class controls' : 'Profile controls'}</Text><Text style={[styles.dangerText, { color: theme.textMuted }]}>{`Deleting this ${terms.profileLower} profile removes assignments, requests, completions, redemptions, and saved balance.`}</Text></View><Pressable onPress={confirmDeleteProfile} style={({ pressed }) => [styles.dangerButton, { borderColor: theme.danger }, pressed && styles.pressed]}><Text style={[styles.dangerButtonText, { color: theme.danger }]}>{teacherMode ? 'Delete class' : 'Delete profile'}</Text></Pressable></View> : null}

      <Modal animationType="fade" onRequestClose={() => setRewardTrackerOpen(false)} transparent visible={rewardTrackerOpen}>
        <View style={styles.rewardTrackerOverlay}>
          <Pressable accessibilityLabel="Close reward tracker" onPress={() => setRewardTrackerOpen(false)} style={StyleSheet.absoluteFill} />
          <View style={[styles.rewardTrackerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.rewardTrackerHeader}>
              <View>
                <Text style={[styles.rewardTrackerEyebrow, { color: accent }]}>TRACK A REWARD</Text>
                <Text style={[styles.rewardTrackerTitle, { color: theme.text }]}>Choose a goal</Text>
              </View>
              <Pressable accessibilityLabel="Close" hitSlop={8} onPress={() => setRewardTrackerOpen(false)} style={[styles.rewardTrackerClose, { backgroundColor: theme.surfaceMuted }]}>
                <Text style={[styles.rewardTrackerCloseText, { color: theme.text }]}>×</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.rewardTrackerList} showsVerticalScrollIndicator={false}>
              {profileRewards.map((reward) => {
                const selected = reward.id === nextReward?.id;
                return (
                  <Pressable
                    key={reward.id}
                    onPress={() => {
                      setTrackedRewardId(reward.id);
                      setRewardTrackerOpen(false);
                    }}
                    style={[
                      styles.rewardTrackerRow,
                      {
                        backgroundColor: selected ? accentSoft : theme.background,
                        borderColor: selected ? accent : theme.border,
                      },
                    ]}
                  >
                    <ItemIconView
                      accessibilityLabel={`${reward.title} reward`}
                      icon={reward.icon ?? { type: 'emoji', value: '🏆' }}
                      size={42}
                      theme={theme}
                    />
                    <View style={styles.rewardTrackerCopy}>
                      <Text numberOfLines={2} style={[styles.rewardTrackerName, { color: selected ? accent : theme.text }]}>{reward.title}</Text>
                      <Text style={[styles.rewardTrackerCost, { color: theme.textMuted }]}>{reward.cost} {currencyWord(profile.currencyType, reward.cost)}</Text>
                    </View>
                    <View style={[styles.rewardTrackerRadio, { borderColor: selected ? accent : theme.border }]}>
                      {selected ? <View style={[styles.rewardTrackerRadioDot, { backgroundColor: accent }]} /> : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal animationType="fade" onRequestClose={() => setRewardPrompt(null)} transparent visible={Boolean(rewardPrompt)}>
        <Pressable onPress={() => setRewardPrompt(null)} style={styles.rewardPromptBackdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.rewardPromptCard}>
            <Pressable accessibilityLabel="Close reward popup" hitSlop={12} onPress={() => setRewardPrompt(null)} style={styles.rewardPromptClose}>
              <Text style={styles.rewardPromptCloseText}>×</Text>
            </Pressable>
            {rewardPrompt?.kind === 'remove' ? <Text style={styles.rewardPromptEmoji}>🗑️</Text> : <Image resizeMode="contain" source={require('../../assets/branding/redeem-reward-fireworks.png')} style={styles.rewardPromptTrophy} />}
            <Text style={styles.rewardPromptTitle}>
              {rewardPrompt?.kind === 'remove'
                ? 'Remove this reward?'
                : rewardPrompt?.kind === 'early'
                  ? 'Redeem reward early?'
                  : teacherMode ? 'Redeem this reward?' : `Send reward to ${profile.name}?`}
            </Text>
            <Text style={styles.rewardPromptBody}>
              {rewardPrompt?.kind === 'remove'
                ? `“${rewardPrompt.reward.title}” will stay in the ${terms.workspaceLower} Reward Library but will be removed from ${profile.name}'s profile.`
                : rewardPrompt?.kind === 'early'
                  ? `“${rewardPrompt.reward.title}” — Redeeming early will bring current earnings to zero.`
                  : rewardPrompt
                    ? `${rewardPrompt.reward.cost} ${currencyWord(profile.currencyType, rewardPrompt.reward.cost)} will be subtracted from ${profile.name}'s balance.`
                    : ''}
            </Text>
            <View style={styles.rewardPromptActions}>
              <Pressable onPress={() => setRewardPrompt(null)} style={styles.rewardPromptCancel}><Text style={styles.rewardPromptCancelText}>Cancel</Text></Pressable>
              {(rewardPrompt?.kind === 'redeem' || rewardPrompt?.kind === 'early') && !teacherMode ? <Pressable onPress={redeemRewardNow} style={styles.rewardPromptRedeemNow}><Text style={styles.rewardPromptRedeemNowText}>Redeem Now</Text></Pressable> : null}
              <Pressable
                onPress={confirmRewardPrompt}
                style={[
                  styles.rewardPromptConfirm,
                  rewardPrompt?.kind === 'remove' && styles.rewardPromptRemove,
                  !teacherMode && (rewardPrompt?.kind === 'redeem' || rewardPrompt?.kind === 'early') && styles.rewardPromptSend,
                ]}
              >
                <Text
                  style={[
                    styles.rewardPromptConfirmText,
                    !teacherMode && (rewardPrompt?.kind === 'redeem' || rewardPrompt?.kind === 'early') && styles.rewardPromptSendText,
                  ]}
                >
                  {rewardPrompt?.kind === 'remove'
                    ? 'Remove'
                    : rewardPrompt?.kind === 'early'
                      ? 'Send\nReward'
                      : teacherMode
                        ? 'Redeem'
                        : 'Send'}
                </Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>


      <Modal animationType="fade" onRequestClose={() => setSubmitTaskCandidate(null)} transparent visible={Boolean(submitTaskCandidate)}>
        <Pressable onPress={() => setSubmitTaskCandidate(null)} style={styles.submitBackdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={[styles.submitCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
            <Pressable accessibilityLabel="Close" hitSlop={12} onPress={() => setSubmitTaskCandidate(null)} style={[styles.submitClose, { backgroundColor: theme.surfaceMuted }]}>
              <Text style={[styles.submitCloseText, { color: theme.text }]}>×</Text>
            </Pressable>
            <Image resizeMode="contain" source={require('../../assets/branding/child-send-parent.png')} style={styles.submitBadgeIcon} />
            <Text style={[styles.submitTitle, { color: theme.text }]}>Send to your parent?</Text>
            <Text style={[styles.submitText, { color: theme.textMuted }]}>{submitTaskCandidate ? `Send “${submitTaskCandidate.title}” to your parent for approval? Your earnings will appear after they approve it.` : ''}</Text>
            <View style={styles.submitActions}>
              <Pressable onPress={() => setSubmitTaskCandidate(null)} style={[styles.submitCancel, { backgroundColor: theme.surfaceMuted }]}><Text style={[styles.submitCancelText, { color: theme.text }]}>Cancel</Text></Pressable>
              <Pressable onPress={confirmSubmitChildTask} style={[styles.submitSend, { backgroundColor: theme.secondary }]}><Text style={styles.submitSendText}>Send</Text></Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {isParent ? <AddItemModal mode={addMode} onAddReward={onAddReward} onAddTask={onAddTask} onUpdateReward={onUpdateReward} onUpdateTask={onUpdateTask} rewardToEdit={rewardToEdit} taskToEdit={taskToEdit} onClose={() => { const library = !taskToEdit && !rewardToEdit && addMode === 'task' ? 'tasks' : !taskToEdit && !rewardToEdit && addMode === 'reward' ? 'rewards' : null; setAddMode(null); setTaskToEdit(null); setRewardToEdit(null); if (library) onOpenLibrary?.(library); }} profile={profile} theme={theme} /> : null}
    </View>
  );
}

function EmptyState({ icon, imageSource, title, text, theme }: { icon?: string; imageSource?: ImageSourcePropType; title: string; text: string; theme: AppTheme }) {
  return <View style={styles.emptyState}><View style={[styles.emptyIcon, { backgroundColor: theme.primarySoft }]}>{imageSource ? <Image resizeMode="contain" source={imageSource} style={styles.emptyIconImage} /> : <Text style={[styles.emptyIconText, { color: theme.primary }]}>{icon}</Text>}</View><Text style={[styles.emptyTitle, { color: theme.text }]}>{title}</Text><Text style={[styles.emptyText, { color: theme.textMuted }]}>{text}</Text></View>;
}

const styles = StyleSheet.create({
  rewardTrackerOverlay:{...StyleSheet.absoluteFillObject,alignItems:'center',backgroundColor:'rgba(12,18,32,0.48)',justifyContent:'center',padding:22},
  rewardTrackerCard:{borderRadius:24,borderWidth:1,maxHeight:'68%',maxWidth:480,padding:18,shadowColor:'#000',shadowOffset:{width:0,height:14},shadowOpacity:0.18,shadowRadius:28,width:'100%'},
  rewardTrackerHeader:{alignItems:'center',flexDirection:'row',justifyContent:'space-between',marginBottom:12},
  rewardTrackerEyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.2},
  rewardTrackerTitle:{fontSize:22,fontWeight:'900',marginTop:2},
  rewardTrackerClose:{alignItems:'center',borderRadius:999,height:34,justifyContent:'center',width:34},
  rewardTrackerCloseText:{fontSize:24,fontWeight:'700',lineHeight:26},
  rewardTrackerList:{flexGrow:0},
  rewardTrackerRow:{alignItems:'center',borderRadius:17,borderWidth:1,flexDirection:'row',gap:11,marginBottom:9,minHeight:70,paddingHorizontal:11,paddingVertical:9},
  rewardTrackerCopy:{flex:1},
  rewardTrackerName:{fontSize:14,fontWeight:'900'},
  rewardTrackerCost:{fontSize:12,fontWeight:'800',marginTop:3},
  rewardTrackerRadio:{alignItems:'center',borderRadius:999,borderWidth:2,height:22,justifyContent:'center',width:22},
  rewardTrackerRadioDot:{borderRadius:999,height:10,width:10},

  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 }, circleButton: { alignItems: 'center', borderRadius: 999, height: 42, justifyContent: 'center', width: 42 }, circleSpacer: { height: 42, width: 42 }, backIcon: { fontSize: 32, lineHeight: 34, marginLeft: -2, marginTop: -3 }, modeTitleWrap: { alignItems: 'center' }, topBarTitle: { fontSize: 15, fontWeight: '900' }, modeLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 1, marginTop: 2 }, deleteProfileIcon: { fontSize: 18, fontWeight: '900' },
  editProfileButton: { alignItems:'center', borderRadius:999, borderWidth:1, justifyContent:'center', minHeight:30, minWidth:58, paddingHorizontal:9, paddingVertical:5 }, editProfileButtonText: { fontSize:11, fontWeight:'900' },
  hero: { alignItems: 'center', borderRadius: 34, borderWidth: 2, flexDirection: 'row', gap: 20, marginBottom: 16, overflow: 'hidden', paddingHorizontal: 22, paddingVertical: 25, shadowOffset: { width: 0, height: 14 }, shadowOpacity: Platform.OS === 'ios' ? 0.15 : 0, shadowRadius: 28, elevation: 3 }, heroGlow: { borderRadius: 999, height: 180, opacity: 0.2, position: 'absolute', right: -70, top: -75, width: 180 }, heroCopy: { flex: 1, minWidth: 0 }, eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1.15 }, name: { fontSize: 35, fontWeight: '900', letterSpacing: -0.9, marginTop: 3 }, heroStats: { flexDirection: 'row', gap: 6, marginTop: 10, width: '100%' }, statPill: { alignItems: 'center', borderRadius: 20, flex: 1, flexDirection: 'row', gap: 4, justifyContent: 'center', minHeight: 38, minWidth: 0, paddingHorizontal: 7, paddingVertical: 7 }, statIconWrap: { alignItems: 'center', height: 20, justifyContent: 'center', overflow: 'visible', width: 18 }, statEmoji: { fontSize: 13, lineHeight: 16 }, statPillText: { flexShrink: 1, fontSize: 11, fontWeight: '900', textAlign: 'center' },
  progressPagerWrap:{alignItems:'center',marginBottom:18,overflow:'hidden',width:'100%'},
  progressPagerFooter:{alignItems:'center',height:18,justifyContent:'flex-end',paddingTop:1},
  progressDots:{alignItems:'center',flexDirection:'row',gap:5,height:7,justifyContent:'center'},
  progressDot:{borderRadius:999,height:4,width:4},
  progressSwipeHint:{fontSize:9,fontWeight:'700',lineHeight:10},
  progressCopy:{flex:1},
  progressCard: { borderRadius: 27, borderWidth: 1, marginBottom: 15, padding: 17 }, progressHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, progressEyebrowRow:{alignItems:'center',flexDirection:'row',gap:5,justifyContent:'flex-start'},progressSparkle:{flexShrink:0,fontSize:12},progressEyebrow: { flexShrink:1,fontSize: 12, fontWeight: '900', letterSpacing: 0.7 },progressDetailRow:{alignItems:'center',flexDirection:'row',gap:8,justifyContent:'space-between',marginTop:3}, progressTitle: { flex:1,fontSize: 17, fontWeight: '900',minWidth:0 }, progressPercent: { flexShrink:0,fontSize: 18, fontWeight: '900',minWidth:45,textAlign:'right' }, progressTrack: { borderRadius: 999, height: 10, marginTop: 13, overflow: 'hidden' }, progressFill: { borderRadius: 999, height: '100%' }, progressHint: { fontSize: 12, lineHeight: 15, marginTop: 8 },
  tabs: { borderRadius: 22, flexDirection: 'row', marginBottom: 22, padding: 4 }, tab: { alignItems: 'center', borderRadius: 14, flex: 1, paddingVertical: 11, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 9, elevation: 1 }, tabText: { fontSize: 13, fontWeight: '900' },
  sectionHeadingRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginBottom: 12 }, sectionHeadingCopy: { flex: 1 }, assignedTitleRow:{alignItems:'center',flexDirection:'row',flexWrap:'wrap',gap:8}, sectionHeading: { fontSize: 20, fontWeight: '900' }, sectionSubtitle: { fontSize: 12, lineHeight: 15, marginTop: 3 },taskSectionHeading:{gap:7,marginBottom:12},taskToolbar:{alignItems:'center',flexDirection:'row',justifyContent:'space-between'},selectionHint:{fontSize:11,lineHeight:14},bulkRemoveActions:{alignItems:'center',flexDirection:'row',gap:5},bulkRemoveButton:{borderRadius:999,paddingHorizontal:9,paddingVertical:5},bulkRemoveText:{fontSize:10,fontWeight:'900'},bulkCancelButton:{borderRadius:999,borderWidth:1,paddingHorizontal:8,paddingVertical:4},bulkCancelText:{fontSize:10,fontWeight:'900'},bulkConfirmButton:{borderRadius:999,minWidth:62,paddingHorizontal:9,paddingVertical:5},bulkConfirmText:{fontSize:10,fontWeight:'900',textAlign:'center'}, taskHeaderActions:{alignItems:'center',flexDirection:'row',gap:5,justifyContent:'flex-end'}, undoTaskButton:{alignItems:'center',borderRadius:999,borderWidth:1,justifyContent:'center',minWidth:70,paddingHorizontal:8,paddingVertical:7}, undoTaskButtonText:{fontSize:11,fontWeight:'900',lineHeight:14,textAlign:'center'}, taskAddButton:{alignItems:'center',borderRadius:999,justifyContent:'center',minWidth:55,paddingHorizontal:8,paddingVertical:8}, taskActionButtonText:{color:'#FFFFFF',fontSize:11,fontWeight:'900',lineHeight:14,textAlign:'center'}, addButton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 10 }, addButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  taskSelect:{alignItems:'center',borderRadius:7,borderWidth:1.5,height:22,justifyContent:'center',width:22},taskSelectText:{fontSize:13,fontWeight:'900'},
  listCard: { borderRadius: 28, borderWidth: 1, overflow: 'hidden', paddingHorizontal: 11 }, taskRow: { alignItems: 'center', flexDirection: 'row', gap: 7, minHeight: 78, paddingVertical: 8 }, taskCopy: { flex: 1, gap: 2 }, taskTitleRow: { alignItems: 'center', flexDirection: 'row', gap: 5 }, taskTitle: { flexShrink: 1, fontSize: 14, fontWeight: '900' },childPointBadge:{alignItems:'center',borderRadius:999,flexDirection:'row',gap:2,paddingHorizontal:5,paddingVertical:2},childPointText:{fontSize:9,fontWeight:'900'}, completedTitle: { opacity: 0.58, textDecorationLine: 'line-through' }, taskDescription: { fontSize: 11, lineHeight: 13 }, taskMeta: { fontSize: 10, lineHeight: 12 }, frequencyBadge: { borderRadius: 999, flexShrink: 0, paddingHorizontal: 6, paddingVertical: 3 }, frequencyBadgeText: { fontSize: 9, fontWeight: '900' }, actionButton: { alignItems: 'center', borderRadius: 999, flexShrink: 0, minWidth: 55, paddingHorizontal: 8, paddingVertical: 8 }, actionCurrencyRow: { alignItems: 'center', flexDirection: 'row', gap: 4, justifyContent: 'center' }, actionButtonText: { fontSize: 11, fontWeight: '900', textAlign: 'center' },taskManageRow:{alignItems:'center',flexDirection:'row',gap:5,marginTop:2},rowEditButton:{alignItems:'center',alignSelf:'flex-start',borderRadius:999,paddingHorizontal:7,paddingVertical:3},rowEditButtonText:{fontSize:10,fontWeight:'900'},rowRemoveButton:{alignItems:'center',borderRadius:999,minWidth:56,paddingHorizontal:7,paddingVertical:3},rowRemoveButtonText:{fontSize:9,fontWeight:'900'}, rowDeleteButton: { alignItems: 'center', borderRadius: 999, height: 22, justifyContent: 'center', width: 22 }, rowDeleteText: { fontSize: 16, fontWeight: '700', lineHeight: 17, marginTop: -2 },
  giftCenter: { borderRadius: 23, borderWidth: 1.5, gap: 10, marginBottom: 15, padding: 15 }, giftHeading: { alignItems: 'center', flexDirection: 'row', gap: 11 }, giftWaitingIcon: { flexShrink: 0, height: 54, width: 54 }, giftEmoji: { fontSize: 31 }, giftHeadingCopy: { flex: 1 }, giftTitle: { fontSize: 15, fontWeight: '900' }, giftSubtitle: { fontSize: 12, lineHeight: 15, marginTop: 3 }, giftRow: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 10 }, giftCopy: { flex: 1 }, giftRewardTitle: { fontSize: 14, fontWeight: '900' }, giftMeta: { fontSize: 12, fontWeight: '800', marginTop: 3 }, openGiftButton: { borderRadius: 14, paddingHorizontal: 11, paddingVertical: 10 }, openGiftText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  rewardList: { gap: 10 }, rewardCard: { borderRadius: 27, borderWidth: 1, padding: 16, shadowOffset: { width: 0, height: 7 }, shadowOpacity: Platform.OS === 'ios' ? 0.04 : 0, shadowRadius: 15, elevation: 1 }, rewardTopRow: { alignItems: 'center', flexDirection: 'row', gap: 8 }, rewardCopy: { alignItems: 'flex-start', flex: 1, gap: 4 }, rewardTitle: { fontSize: 14, fontWeight: '900' }, rewardEditButton: { borderRadius: 999, minWidth: 40, paddingHorizontal: 9, paddingVertical: 5 }, rewardEditButtonText: { fontSize: 10, fontWeight: '900' }, rewardMeta: { fontSize: 12 }, redeemButton: { borderRadius: 999, minWidth: 58, paddingHorizontal: 10, paddingVertical: 9 }, redeemButtonText: { fontSize: 12, fontWeight: '900', textAlign: 'center' }, readOnlyRewardBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 9 }, readOnlyRewardText: { fontSize: 12, fontWeight: '900' }, rewardTrack: { borderRadius: 999, height: 8, marginTop: 13, overflow: 'hidden' }, rewardFill: { borderRadius: 999, height: '100%' },
  dangerZone: { alignItems: 'center', borderRadius: 21, borderWidth: 1, flexDirection: 'row', gap: 12, marginTop: 24, padding: 15 }, dangerCopy: { flex: 1, gap: 3 }, dangerTitle: { fontSize: 14, fontWeight: '900' }, dangerText: { fontSize: 12, lineHeight: 14 }, dangerButton: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 9 }, dangerButtonText: { fontSize: 12, fontWeight: '900' },
  rewardPromptTrophy:{alignSelf:'center',height:92,marginBottom:6,width:92},
  rewardPromptRedeemNow:{alignItems:'center',backgroundColor:'#E8F5F1',borderRadius:16,flex:1,justifyContent:'center',minHeight:52,paddingHorizontal:6,paddingVertical:10},
  rewardPromptRedeemNowText:{color:'#0B756F',fontSize:12,fontWeight:'900',lineHeight:15,textAlign:'center'},
  earnedBackdrop:{...StyleSheet.absoluteFillObject,alignItems:'center',backgroundColor:'rgba(7,28,29,0.52)',justifyContent:'center',padding:20},
  earnedCard:{alignItems:'center',borderRadius:26,borderWidth:1,maxWidth:390,padding:22,shadowOffset:{width:0,height:14},shadowOpacity:0.18,shadowRadius:28,width:'100%'},
  earnedTrophy:{height:112,width:112}, earnedTitle:{fontSize:22,fontWeight:'900',marginTop:8,textAlign:'center'}, earnedBody:{fontSize:14,lineHeight:20,marginTop:7,textAlign:'center'},
  earnedButton:{alignItems:'center',borderRadius:15,marginTop:16,paddingHorizontal:24,paddingVertical:12}, earnedButtonText:{color:'#FFFFFF',fontSize:13,fontWeight:'900'},
    rewardPromptBackdrop:{alignItems:'center',backgroundColor:'rgba(18,18,30,0.34)',flex:1,justifyContent:'center',padding:22},
  rewardPromptCard:{alignItems:'center',backgroundColor:'#FFFFFF',borderColor:'#E8E6F3',borderRadius:26,borderWidth:1,maxWidth:390,paddingBottom:22,paddingHorizontal:22,paddingTop:24,position:'relative',shadowColor:'#1A1830',shadowOffset:{width:0,height:14},shadowOpacity:0.18,shadowRadius:28,width:'100%'},
  rewardPromptClose:{alignItems:'center',backgroundColor:'#F2F0F8',borderRadius:999,height:32,justifyContent:'center',position:'absolute',right:12,top:12,width:32},
  rewardPromptCloseText:{color:'#26243A',fontSize:22,fontWeight:'800',lineHeight:23},
  rewardPromptEmoji:{fontSize:29,marginBottom:5},
  rewardPromptTitle:{color:'#242238',fontSize:20,fontWeight:'900',textAlign:'center'},
  rewardPromptBody:{color:'#6E6B80',fontSize:13,lineHeight:18,marginTop:8,textAlign:'center'},
  rewardPromptActions:{alignItems:'stretch',flexDirection:'row',gap:8,marginTop:19,width:'100%'},
  rewardPromptCancel:{alignItems:'center',backgroundColor:'#F2F0F8',borderRadius:16,flex:1,justifyContent:'center',minHeight:52,paddingHorizontal:6,paddingVertical:10},
  rewardPromptCancelText:{color:'#353247',fontSize:12,fontWeight:'900',lineHeight:15,textAlign:'center'},
  rewardPromptConfirm:{alignItems:'center',backgroundColor:'#7A5CF0',borderRadius:16,flex:1,justifyContent:'center',minHeight:52,paddingHorizontal:6,paddingVertical:10},
  rewardPromptRemove:{backgroundColor:'#E85770'},
  rewardPromptSend:{backgroundColor:'#F4D06F'},
  rewardPromptSendText:{color:'#5A4100'},
  rewardPromptConfirmText:{color:'#FFFFFF',fontSize:12,fontWeight:'900',lineHeight:15,textAlign:'center'},
  submitBackdrop:{alignItems:'center',backgroundColor:'rgba(18,18,30,0.42)',flex:1,justifyContent:'center',padding:24}, submitCard:{alignItems:'center',borderRadius:26,borderWidth:1,maxWidth:390,paddingHorizontal:22,paddingBottom:22,paddingTop:26,position:'relative',shadowOffset:{width:0,height:12},shadowOpacity:0.2,shadowRadius:28,width:'100%'}, submitClose:{alignItems:'center',borderRadius:999,height:32,justifyContent:'center',position:'absolute',right:12,top:12,width:32}, submitCloseText:{fontSize:22,fontWeight:'800',lineHeight:23}, submitBadgeIcon:{height:78,marginBottom:5,width:78}, submitTitle:{fontSize:20,fontWeight:'900'}, submitText:{fontSize:13,lineHeight:18,marginTop:7,textAlign:'center'}, submitActions:{flexDirection:'row',gap:9,marginTop:18,width:'100%'}, submitCancel:{alignItems:'center',borderRadius:16,flex:1,paddingVertical:12}, submitCancelText:{fontSize:13,fontWeight:'900'}, submitSend:{alignItems:'center',borderRadius:16,flex:1,paddingVertical:12}, submitSendText:{color:'#FFFFFF',fontSize:13,fontWeight:'900'},
  emptyState: { alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 32 }, emptyIcon: { alignItems: 'center', borderRadius: 18, height: 58, justifyContent: 'center', width: 58 }, emptyIconImage: { height: 52, width: 52 }, emptyIconText: { fontSize: 26, fontWeight: '900' }, emptyTitle: { fontSize: 15, fontWeight: '900' }, emptyText: { fontSize: 13, lineHeight: 17, textAlign: 'center' }, pressed: { opacity: 0.72 },
});
