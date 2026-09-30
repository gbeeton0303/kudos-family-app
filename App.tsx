import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, useColorScheme, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AddProfileModal } from './src/components/AddProfileModal';
import { AdultInviteStatusScreen } from './src/screens/AdultInviteStatusScreen';
import { ChildAccountStatusScreen } from './src/screens/ChildAccountStatusScreen';
import { AppearanceModal, type AppearancePreference } from './src/components/AppearanceModal';
import { BottomNavigation } from './src/components/BottomNavigation';
import { CloudAccountModal } from './src/components/CloudAccountModal';
import { CloudSyncBanner } from './src/components/CloudSyncBanner';
import { FailedSyncChangesModal } from './src/components/FailedSyncChangesModal';
import { LocalMigrationModal } from './src/components/LocalMigrationModal';
import { InformationModal } from './src/components/InformationModal';
import { ModeHeader } from './src/components/ModeHeader';
import { ParentNotificationsModal } from './src/components/ParentNotificationsModal';
import { ParentTutorialModal } from './src/components/ParentTutorialModal';
import { RewardLibraryModal } from './src/components/RewardLibraryModal';
import { RewardRedemptionModal } from './src/components/RewardRedemptionModal';
import { TaskCelebrationModal } from './src/components/TaskCelebrationModal';
import { TaskLibraryModal } from './src/components/TaskLibraryModal';
import { WorkspaceSwitchModal } from './src/components/WorkspaceSwitchModal';
import { AuthProvider, useAuth } from './src/cloud/AuthContext';
import { getLocalMigrationCandidate, migrateLocalState, skipLocalMigration } from './src/cloud/localMigration';
import { registerDeviceForPush, unregisterDeviceForPush } from './src/cloud/push';
import { isSupabaseConfigured } from './src/cloud/supabase';
import type { WorkspaceAccess, WorkspaceType } from './src/cloud/types';
import { useWorkspaceAccess } from './src/cloud/useWorkspaceAccess';
import { createWorkspace } from './src/cloud/workspaces';
import { ClassroomModeProvider } from './src/context/ClassroomModeContext';
import { getNextRewardProgress, getProfileBalance } from './src/data/familyData';
import { getProfileAccent } from './src/data/profileStyles';
import type { FamilyDataController } from './src/hooks/familyController';
import { useCloudFamilyData } from './src/hooks/useCloudFamilyData';
import { useLocalFamilyData } from './src/hooks/useFamilyData';
import { AuthScreen, PasswordRecoveryScreen } from './src/screens/AuthScreen';
import { ChildProfilePickerScreen } from './src/screens/ChildProfilePickerScreen';
import { CloudLoadingScreen } from './src/screens/CloudLoadingScreen';
import { CloudSetupScreen } from './src/screens/CloudSetupScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { HistoryScreen } from './src/screens/HistoryScreen';
import { ChoreChartScreen } from './src/screens/ChoreChartScreen';
import { ProfileDetailScreen } from './src/screens/ProfileDetailScreen';
import { PurchaseAccessScreen, WorkspaceAccessPausedScreen } from './src/screens/PurchaseAccessScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { WorkspaceOnboardingScreen } from './src/screens/WorkspaceOnboardingScreen';
import type { EvaluatedEntitlement } from './src/purchases/entitlementPolicy';
import { useWorkspaceEntitlement } from './src/purchases/useWorkspaceEntitlement';
import { useApplePurchaseReconciliation } from './src/purchases/useFamilySharingReconciliation';
import { darkTheme, lightTheme, teacherDarkTheme, teacherLightTheme } from './src/theme';
import type { AppMode, FamilyState, FeatureKey, RewardRedemption, SectionKey, TaskAward } from './src/types';

const TEACHER_MODE_STORAGE_KEY = '@brightsteps/teacher-mode-v1';
const APPEARANCE_STORAGE_KEY = '@brightsteps/appearance-v1';
const PARENT_TUTORIAL_STORAGE_PREFIX = '@brightsteps/parent-tutorial-v1';
const NOTIFICATIONS_STORAGE_KEY = '@kudos/notifications-enabled-v1';

type AppContentProps = {
  family: FamilyDataController;
  cloudAccess?: WorkspaceAccess | null;
  cloudEmail?: string;
  cloudDisplayName?: string;
  onOpenLifetimeUpgrade?: () => void;
  onCloudSignOut?: () => void;
  onWorkspaceRefresh?: () => Promise<void>;
  onWorkspaceTypeChange?: (type: WorkspaceType) => Promise<void>;
  workspaceAccessList?: WorkspaceAccess[];
  showTrialUpgrade?: boolean;
};

function AppContent({ family, cloudAccess = null, cloudEmail, cloudDisplayName, onOpenLifetimeUpgrade, onCloudSignOut, onWorkspaceRefresh, onWorkspaceTypeChange, workspaceAccessList = [], showTrialUpgrade = false }: AppContentProps) {
  const systemColorScheme = useColorScheme();
  const cloudChild = cloudAccess?.role === 'child';
  const classroomWorkspace = cloudAccess?.workspaceType === 'classroom' && !cloudChild;
  const manager = !cloudAccess || cloudAccess.role === 'parent' || cloudAccess.role === 'teacher';
  const [teacherModePreference, setTeacherModePreference] = useState(false);
  const [teacherModeHydrated, setTeacherModeHydrated] = useState(false);
  const teacherMode = cloudAccess ? classroomWorkspace : (!cloudChild && teacherModePreference);
  const [appearance, setAppearance] = useState<AppearancePreference>('system');
  const [appearanceVisible, setAppearanceVisible] = useState(false);
  const resolvedColorScheme = appearance === 'system' ? systemColorScheme : appearance;
  const theme = useMemo(() => {
    if (teacherMode) return resolvedColorScheme === 'dark' ? teacherDarkTheme : teacherLightTheme;
    return resolvedColorScheme === 'dark' ? darkTheme : lightTheme;
  }, [resolvedColorScheme, teacherMode]);
  const [mode, setMode] = useState<AppMode>(cloudChild ? 'child' : 'parent');
  const [activeSection, setActiveSection] = useState<SectionKey>('dashboard');
  const [activeFeature, setActiveFeature] = useState<FeatureKey | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [childProfileId, setChildProfileId] = useState<string | null>(cloudAccess?.linkedProfileId ?? null);
  const [addProfileVisible, setAddProfileVisible] = useState(false);
  const [editProfileId, setEditProfileId] = useState<string | null>(null);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [cloudAccountVisible, setCloudAccountVisible] = useState(false);
  const [failedSyncVisible, setFailedSyncVisible] = useState(false);
  const [celebration, setCelebration] = useState<TaskAward | null>(null);
  const [resolvingRequestId, setResolvingRequestId] = useState<string | null>(null);
  const [redemption, setRedemption] = useState<RewardRedemption | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [notificationsHydrated, setNotificationsHydrated] = useState(false);
  const [informationPage, setInformationPage] = useState<'support' | 'privacy' | null>(null);
  const [hapticsEnabled, setHapticsEnabled] = useState(true);
  const [tutorialVisible, setTutorialVisible] = useState(false);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [tutorialChecked, setTutorialChecked] = useState(false);
  const mainScrollRef = useRef<ScrollView>(null);
  const mainScrollOffset = useRef(0);
  const approvalCelebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // While a modal/banner is covering the screen, the background ScrollView is
  // frozen at its current native offset. We deliberately do NOT call scrollTo
  // when the overlay closes; that corrective scroll was itself visible as an
  // up/down jump on iOS.
  const modalLayerActive = Boolean(
    celebration ||
    redemption ||
    addProfileVisible ||
    editProfileId ||
    activeFeature ||
    notificationsVisible ||
    cloudAccountVisible ||
    failedSyncVisible ||
    appearanceVisible ||
    (tutorialChecked && tutorialVisible)
  );

  useEffect(() => () => {
    if (approvalCelebrationTimer.current) clearTimeout(approvalCelebrationTimer.current);
  }, []);

  const selectedProfile = family.profiles.find((profile) => profile.id === selectedProfileId) ?? null;
  const childProfile = family.profiles.find((profile) => profile.id === childProfileId) ?? null;
  const pendingRequests = family.completionRequests.filter((request) => request.status === 'pending');
  const childWaitingRewardCount = childProfile
    ? family.rewardDeliveries.filter((delivery) => delivery.profileId === childProfile.id && delivery.status === 'waiting').length
    : 0;

  useEffect(() => {
    AsyncStorage.getItem(APPEARANCE_STORAGE_KEY).then((value) => { if (value === 'system' || value === 'light' || value === 'dark') setAppearance(value); }).catch(() => undefined);
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY)
      .then((value) => setNotificationsEnabled(value === 'true'))
      .catch(() => setNotificationsEnabled(false))
      .finally(() => setNotificationsHydrated(true));
  }, []);

  useEffect(() => {
    if (!notificationsHydrated || !cloudAccess) return;
    if (notificationsEnabled) void registerDeviceForPush(cloudAccess.workspaceId).catch(() => setNotificationsEnabled(false));
    else void unregisterDeviceForPush().catch(() => undefined);
    void AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, String(notificationsEnabled));
  }, [cloudAccess?.workspaceId, notificationsEnabled, notificationsHydrated]);

  useEffect(() => {
    AsyncStorage.setItem(APPEARANCE_STORAGE_KEY, appearance).catch(() => undefined);
  }, [appearance]);


  useEffect(() => {
    let mounted = true;
    if (cloudAccess?.role !== 'parent' || cloudAccess.workspaceType === 'classroom') {
      setTutorialChecked(true);
      return () => { mounted = false; };
    }
    const tutorialKey = `${PARENT_TUTORIAL_STORAGE_PREFIX}:${cloudAccess.workspaceId}:${cloudEmail ?? 'parent'}`;
    AsyncStorage.getItem(tutorialKey)
      .then((value) => {
        if (mounted && value !== 'complete') {
          setTutorialStep(0);
          setTutorialVisible(true);
        }
      })
      .catch(() => undefined)
      .finally(() => { if (mounted) setTutorialChecked(true); });
    return () => { mounted = false; };
  }, [cloudAccess?.role, cloudAccess?.workspaceId, cloudAccess?.workspaceType, cloudEmail]);

  const completeTutorial = () => {
    setTutorialVisible(false);
    setTutorialStep(0);
    if (cloudAccess?.workspaceId) {
      const tutorialKey = `${PARENT_TUTORIAL_STORAGE_PREFIX}:${cloudAccess.workspaceId}:${cloudEmail ?? 'parent'}`;
      AsyncStorage.setItem(tutorialKey, 'complete').catch(() => undefined);
    }
  };

  const replayTutorial = () => {
    setTutorialStep(0);
    setTutorialVisible(true);
  };

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(TEACHER_MODE_STORAGE_KEY)
      .then((value) => {
        if (mounted) setTeacherModePreference(value === 'true');
      })
      .catch(() => undefined)
      .finally(() => {
        if (mounted) setTeacherModeHydrated(true);
      });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!teacherModeHydrated || classroomWorkspace || cloudChild) return;
    AsyncStorage.setItem(TEACHER_MODE_STORAGE_KEY, String(teacherModePreference)).catch(() => undefined);
  }, [classroomWorkspace, cloudChild, teacherModeHydrated, teacherModePreference]);

  useEffect(() => {
    if (cloudChild) {
      setMode('child');
      setChildProfileId(cloudAccess?.linkedProfileId ?? null);
      setSelectedProfileId(null);
      setActiveFeature(null);
      return;
    }
    if (teacherMode) {
      setMode('parent');
      setChildProfileId(null);
    }
  }, [cloudAccess?.linkedProfileId, cloudChild, teacherMode]);

  const updateTeacherMode = (enabled: boolean) => {
    if (cloudChild) return;
    if (cloudAccess && onWorkspaceTypeChange) {
      void onWorkspaceTypeChange(enabled ? 'classroom' : 'family');
      return;
    }
    setTeacherModePreference(enabled);
    setActiveFeature(null);
    setNotificationsVisible(false);
    setSelectedProfileId(null);
    setActiveSection('dashboard');
  };

  const completeTaskWithCelebration = async (taskId: string, profileId: string, requestedDate = new Date(), allowRepeatDaily = false) => {
    const task = family.tasks.find((item) => item.id === taskId);
    const profile = family.profiles.find((item) => item.id === profileId);
    if (!task || !profile) return;
    const balanceBefore = getProfileBalance(profile, family.tasks, family.rewards);
    const occurredAt = new Date(requestedDate);
    const today = new Date();
    if (occurredAt.toDateString() === today.toDateString()) occurredAt.setHours(today.getHours(), today.getMinutes(), today.getSeconds(), today.getMilliseconds());
    else occurredAt.setHours(12, 0, 0, 0);
    try {
      const applied = await family.completeTask(taskId, profileId, occurredAt.toISOString(), allowRepeatDaily);
      if (!applied) {
        Alert.alert('Task Already Completed', 'This task already has a completion recorded for the current period. Pull to refresh or use Undo Task if you need to correct it.');
        return;
      }
    } catch (error) {
      Alert.alert('Could Not Complete Task', error instanceof Error ? error.message : String(error));
      return;
    }
    const nextCelebration = { taskId, taskTitle: task.title, profileId, amount: task.amount, balanceBefore, balanceAfter: balanceBefore + task.amount, occurredAt: occurredAt.toISOString() };
    setCelebration(nextCelebration);
  };

  const approveTaskRequest = (requestId: string) => {
    // Only resolve one request at a time. This prevents duplicate mutations and
    // overlapping native modal transitions when a button is tapped repeatedly.
    if (resolvingRequestId) return;

    const request = family.completionRequests.find((item) => item.id === requestId && item.status === 'pending');
    if (!request) return;
    const task = family.tasks.find((item) => item.id === request.taskId);
    const profile = family.profiles.find((item) => item.id === request.profileId);
    const occurredAt = new Date();
    if (!task || !profile) {
      family.resolveTaskRequest(requestId, 'denied');
      return;
    }

    const balanceBefore = getProfileBalance(profile, family.tasks, family.rewards);
    const nextCelebration: TaskAward = {
      taskId: task.id,
      taskTitle: task.title,
      profileId: profile.id,
      amount: task.amount,
      balanceBefore,
      balanceAfter: balanceBefore + task.amount,
      occurredAt: occurredAt.toISOString(),
    };

    setResolvingRequestId(requestId);
    family.resolveTaskRequest(requestId, 'approved', occurredAt.toISOString());

    // Dismiss the approvals sheet before presenting the celebration. Rendering
    // both native Modals during the same frame can freeze or lock touch input on iOS.
    setNotificationsVisible(false);
    if (approvalCelebrationTimer.current) clearTimeout(approvalCelebrationTimer.current);
    approvalCelebrationTimer.current = setTimeout(() => {
      setCelebration(nextCelebration);
      setResolvingRequestId(null);
      approvalCelebrationTimer.current = null;
    }, 420);
  };

  const redeemRewardWithCelebration = (rewardId: string, profileId: string, allowEarly = false, deliverToChild = !teacherMode) => {
    const reward = family.rewards.find((item) => item.id === rewardId);
    const profile = family.profiles.find((item) => item.id === profileId);
    if (!reward || !profile || !reward.assignedProfileIds.includes(profileId)) return;
    const balanceBefore = getProfileBalance(profile, family.tasks, family.rewards);
    if (balanceBefore < reward.cost && !allowEarly) return;
    const occurredAt = new Date().toISOString();
    family.redeemReward(rewardId, profileId, occurredAt, deliverToChild, allowEarly);
    const nextRedemption: RewardRedemption = {
      rewardId, rewardTitle: reward.title, rewardIcon: reward.icon, profileId, cost: reward.cost,
      balanceBefore, balanceAfter: Math.max(0, balanceBefore - reward.cost), occurredAt,
      presentation: deliverToChild ? 'parentSent' : 'childOpened'
    };
    setTimeout(() => setRedemption(nextRedemption), 260);
  };

  const openRewardDeliveryWithCelebration = (deliveryId: string) => {
    const delivery = family.rewardDeliveries.find((item) => item.id === deliveryId && item.status === 'waiting');
    if (!delivery) return;
    family.openRewardDelivery(deliveryId);
    setRedemption({
      rewardId: delivery.rewardId,
      rewardTitle: delivery.rewardTitle,
      rewardIcon: delivery.rewardIcon,
      profileId: delivery.profileId,
      cost: delivery.cost,
      balanceBefore: delivery.balanceBefore,
      balanceAfter: delivery.balanceAfter,
      occurredAt: delivery.sentAt,
      presentation: 'childOpened',
    });
  };

  const changeMode = (nextMode: AppMode) => {
    if (cloudChild || (teacherMode && nextMode === 'child')) return;
    setMode(nextMode);
    setActiveFeature(null);
    setNotificationsVisible(false);
    setSelectedProfileId(null);
    if (nextMode === 'child') setChildProfileId(null);
  };

  const requestTaskCompletionWithCelebration = (taskId: string, profileId: string) => {
    const task = family.tasks.find((item) => item.id === taskId);
    const profile = family.profiles.find((item) => item.id === profileId);
    if (!task || !profile) return;
    const balanceBefore = getProfileBalance(profile, family.tasks, family.rewards);
    const occurredAt = new Date().toISOString();
    const requestId = family.requestTaskCompletion(taskId, profileId, occurredAt);
    if (!requestId) return;
    setCelebration({ taskId, taskTitle: task.title, profileId, amount: task.amount, balanceBefore, balanceAfter: balanceBefore + task.amount, occurredAt });
  };

  const sharedProfileProps = {
    tasks: family.tasks,
    rewards: family.rewards,
    completionRequests: family.completionRequests,
    rewardDeliveries: family.rewardDeliveries,
    theme,
    onAddTask: family.addTask,
    onUpdateTask: family.updateTask,
    onAddReward: family.addReward,
    onUpdateReward: family.updateReward,
    onCompleteTask: completeTaskWithCelebration,
    onUndoLatestTaskCompletion: family.undoLatestTaskCompletion,
    onUndoTaskCompletion: family.undoTaskCompletion,
    onRequestTaskCompletion: requestTaskCompletionWithCelebration,
    onSetTaskAssigned: family.setTaskAssigned,
    onSetRewardAssigned: family.setRewardAssigned,
    onRedeemReward: redeemRewardWithCelebration,
    onOpenRewardDelivery: openRewardDeliveryWithCelebration,
    onOpenLibrary: (library: 'tasks' | 'rewards') => setActiveFeature(library),
  };

  const changePrimarySection = (section: SectionKey) => {
    setSelectedProfileId(null);
    setActiveFeature(null);
    setNotificationsVisible(false);
    setActiveSection(section);
    requestAnimationFrame(() => mainScrollRef.current?.scrollTo({ y: 0, animated: false }));
  };

  const confirmResetCloudSync = () => {
    if (!family.resetCloudSync) return;
    Alert.alert(
      'Reset Cloud Sync?',
      'Kudos will discard changes on this device that have not reached the cloud and reload your family from Kudos Cloud. Your account and cloud data will not be deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset Sync',
          style: 'destructive',
          onPress: () => {
            void family.resetCloudSync?.().then((success) => {
              Alert.alert(
                success ? 'Cloud Sync Reset' : 'Unable to Reset Sync',
                success ? 'Kudos reloaded the latest workspace data from the cloud.' : 'Kudos could not reload the cloud data. Check your connection and try again.',
              );
            });
          },
        },
      ],
    );
  };

  const screen = (() => {
    if (mode === 'child' && !teacherMode) {
      if (!childProfile) {
        if (cloudChild) return <CloudLoadingScreen label="Waiting for this child account to be linked to a profile…" />;
        return <ChildProfilePickerScreen onReturnToParent={() => changeMode('parent')} onSelect={setChildProfileId} profiles={family.profiles} rewardDeliveries={family.rewardDeliveries} theme={theme} />;
      }
      return <ProfileDetailScreen {...sharedProfileProps} mode="child" onBack={() => undefined} onDeleteProfile={() => undefined} onEditProfile={() => setEditProfileId(childProfile.id)} profile={childProfile} />;
    }

    if (selectedProfile) {
      return <ProfileDetailScreen {...sharedProfileProps} mode="parent" onBack={() => setSelectedProfileId(null)} onDeleteProfile={() => { family.deleteProfile(selectedProfile.id); setSelectedProfileId(null); }} onEditProfile={() => setEditProfileId(selectedProfile.id)} profile={selectedProfile} />;
    }
    if (activeSection === 'choreChart') return <ChoreChartScreen familyName={cloudAccess?.workspaceName} profiles={family.profiles} theme={theme} />;
    if (activeSection === 'history') return <HistoryScreen onSelectProfile={setSelectedProfileId} profiles={family.profiles} tasks={family.tasks} theme={theme} />;
    if (activeSection === 'settings') {
      return <SettingsScreen appearanceLabel={appearance === 'system' ? 'System' : appearance === 'light' ? 'Light' : 'Dark'} cloudAccess={cloudAccess} cloudEmail={cloudEmail} hapticsEnabled={hapticsEnabled} notificationsEnabled={notificationsEnabled} onHapticsChange={setHapticsEnabled} onNotificationsChange={setNotificationsEnabled} onOpenAppearance={() => setAppearanceVisible(true)} onOpenCloudAccount={cloudAccess ? () => setCloudAccountVisible(true) : undefined} onOpenFamilyAccount={() => cloudAccess ? setCloudAccountVisible(true) : setAddProfileVisible(true)} onOpenLifetimeUpgrade={onOpenLifetimeUpgrade} onOpenTutorial={replayTutorial} onOpenSupport={() => void Linking.openURL('https://mykudosfamily.com/support').catch(() => Alert.alert('Could Not Open Support', 'Visit mykudosfamily.com/support in your browser.'))} onOpenPrivacy={() => setInformationPage('privacy')} onOpenFailedSyncChanges={() => setFailedSyncVisible(true)} onResetCloudSync={confirmResetCloudSync} failedSyncCount={family.failedSyncChanges?.length ?? 0} onTeacherModeChange={updateTeacherMode} showTrialUpgrade={showTrialUpgrade} teacherModeEnabled={teacherMode} workspaceSwitchingEnabled={Boolean(cloudAccess && !cloudChild)} theme={theme} />;
    }

    return <DashboardScreen accountFirstName={cloudDisplayName?.trim().split(/\s+/)[0]} familyAccountName={cloudAccess?.workspaceName} onAddProfile={() => setAddProfileVisible(true)} onOpenApprovals={() => setNotificationsVisible(true)} onOpenFeature={setActiveFeature} onSelectProfile={setSelectedProfileId} pendingApprovalCount={pendingRequests.length} profiles={family.profiles} rewards={family.rewards} tasks={family.tasks} theme={theme} />;
  })();

  const celebrationProfile = family.profiles.find((profile) => profile.id === celebration?.profileId) ?? null;
  const celebrationGoal = celebrationProfile ? getNextRewardProgress(celebrationProfile, family.tasks, family.rewards).reward : null;
  const redemptionProfile = family.profiles.find((profile) => profile.id === redemption?.profileId) ?? null;

  return (
    <ClassroomModeProvider teacherMode={teacherMode}>
      <View style={[styles.app, { backgroundColor: theme.background }]}> 
        <StatusBar style={resolvedColorScheme === 'dark' ? 'light' : 'dark'} />
        <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
          <ScrollView
            alwaysBounceVertical={false}
            bounces={false}
            decelerationRate="normal"
            directionalLockEnabled
            overScrollMode="never"
            removeClippedSubviews={false}
            ref={mainScrollRef}
            scrollEnabled={!modalLayerActive}
            contentInsetAdjustmentBehavior="never"
            contentContainerStyle={styles.content}
            keyboardDismissMode="none"
            keyboardShouldPersistTaps="always"
            onScroll={(event) => {
              if (!modalLayerActive) mainScrollOffset.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
          >
            <ModeHeader childAccent={childProfile ? getProfileAccent(childProfile.colorKey) : undefined} childName={childProfile?.name} childRewardCount={childWaitingRewardCount} cloudRole={cloudAccess?.role} mode={mode} onChangeMode={changeMode} onOpenNotifications={() => setNotificationsVisible(true)} onSwitchChild={() => cloudChild ? setCloudAccountVisible(true) : setChildProfileId(null)} pendingCount={pendingRequests.length} theme={theme} />
            {cloudAccess && family.syncStatus ? <CloudSyncBanner error={family.syncError} failedCount={family.failedSyncChanges?.length ?? 0} onReview={() => setFailedSyncVisible(true)} onRetry={() => void family.retryPendingChanges?.()} pendingCount={family.pendingMutationCount ?? 0} status={family.syncStatus} theme={theme} /> : null}
            {screen}
          </ScrollView>
        </SafeAreaView>

        {manager && mode === 'parent' ? <BottomNavigation activeSection={selectedProfile ? 'dashboard' : activeSection} onChange={changePrimarySection} theme={theme} /> : null}

        {manager && mode === 'parent' ? <TaskLibraryModal onAddTask={family.addTask} onClose={() => setActiveFeature(null)} onDeleteTask={family.deleteTask} onSetTaskAssigned={family.setTaskAssigned} onUpdateTask={family.updateTask} profiles={family.profiles} tasks={family.tasks} theme={theme} visible={activeFeature === 'tasks'} /> : null}
        {manager && mode === 'parent' ? <RewardLibraryModal onAddReward={family.addReward} onUpdateReward={family.updateReward} onClose={() => setActiveFeature(null)} onDeleteReward={family.deleteReward} onSetRewardAssigned={family.setRewardAssigned} profiles={family.profiles} rewards={family.rewards} theme={theme} visible={activeFeature === 'rewards'} /> : null}
        {manager && mode === 'parent' ? <AddProfileModal onClose={() => setAddProfileVisible(false)} onCreate={family.addProfile} onCreated={(profileId) => { setActiveSection('dashboard'); setSelectedProfileId(profileId); }} theme={theme} visible={addProfileVisible} /> : null}

        {manager && mode === 'parent' ? <AddProfileModal onClose={() => setEditProfileId(null)} onCreate={family.addProfile} onCreated={() => undefined} onUpdate={family.updateProfile} profile={family.profiles.find((item) => item.id === editProfileId) ?? null} theme={theme} visible={Boolean(editProfileId)} /> : null}
        {mode === 'child' && childProfile ? <AddProfileModal appearancePreference={appearance} identityLocked onAppearanceChange={setAppearance} onClose={() => setEditProfileId(null)} onCreate={family.addProfile} onCreated={() => undefined} onUpdate={family.updateOwnProfilePreferences} profile={family.profiles.find((item) => item.id === editProfileId) ?? null} theme={theme} visible={Boolean(editProfileId)} /> : null}
        <ParentNotificationsModal onApprove={approveTaskRequest} onClose={() => { if (!resolvingRequestId) setNotificationsVisible(false); }} onDeny={(requestId) => { if (!resolvingRequestId) family.resolveTaskRequest(requestId, 'denied'); }} profiles={family.profiles} requests={family.completionRequests} resolvingRequestId={resolvingRequestId} tasks={family.tasks} theme={theme} visible={manager && mode === 'parent' && notificationsVisible} />
        <TaskCelebrationModal award={celebration} goalAmount={celebrationGoal?.cost ?? Math.max(25, celebration?.balanceAfter ?? 25)} goalLabel={celebrationGoal?.title} onClose={() => setCelebration(null)} profile={celebrationProfile} theme={theme} />
        <AppearanceModal onChange={setAppearance} onClose={() => setAppearanceVisible(false)} theme={theme} value={appearance} visible={appearanceVisible} />
        <InformationModal kind={informationPage ?? 'privacy'} onClose={() => setInformationPage(null)} theme={theme} visible={Boolean(informationPage)} />
        <ParentTutorialModal onFinish={completeTutorial} onSkip={completeTutorial} onStepChange={setTutorialStep} step={tutorialStep} theme={theme} visible={tutorialChecked && manager && mode === 'parent' && tutorialVisible} />
        <RewardRedemptionModal onClose={() => setRedemption(null)} profile={redemptionProfile} redemption={redemption} theme={theme} />
        <FailedSyncChangesModal changes={family.failedSyncChanges ?? []} onClose={() => setFailedSyncVisible(false)} onDiscard={(id) => void family.discardFailedSyncChange?.(id)} onRetry={(id) => void family.retryFailedSyncChange?.(id)} onRetryAll={() => void family.retryAllFailedSyncChanges?.()} theme={theme} visible={Boolean(cloudAccess && manager && failedSyncVisible)} />
        {cloudAccess && onCloudSignOut && onWorkspaceRefresh ? <CloudAccountModal access={cloudAccess} email={cloudEmail ?? ''} onClose={() => setCloudAccountVisible(false)} onRefresh={() => void family.refresh?.()} onWorkspaceRefresh={onWorkspaceRefresh} onWorkspaceTypeChange={onWorkspaceTypeChange} onSignOut={onCloudSignOut} profiles={family.profiles} syncStatus={family.syncStatus ?? 'synced'} theme={theme} visible={cloudAccountVisible} workspaces={workspaceAccessList} /> : null}
      </View>
    </ClassroomModeProvider>
  );
}

function LocalDemoApp() {
  const family = useLocalFamilyData();
  if (!family.isHydrated) return <CloudLoadingScreen label="Loading local Kudos data…" />;
  return <AppContent family={family} />;
}

function ConnectedWorkspaceApp({ access, accessList, email, displayName, onOpenLifetimeUpgrade, onSignOut, onWorkspaceRefresh, onWorkspaceTypeChange, showTrialUpgrade }: { access: WorkspaceAccess; accessList: WorkspaceAccess[]; email: string; displayName?: string; onOpenLifetimeUpgrade?: () => void; onSignOut: () => void; onWorkspaceRefresh: () => Promise<void>; onWorkspaceTypeChange: (type: WorkspaceType) => Promise<void>; showTrialUpgrade?: boolean }) {
  const family = useCloudFamilyData(access.workspaceId);
  const colorScheme = useColorScheme();
  const migrationTheme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const [migrationState, setMigrationState] = useState<FamilyState | null>(null);
  const [migrationChecked, setMigrationChecked] = useState(access.role === 'child');

  useEffect(() => {
    let mounted = true;
    if (access.role === 'child') {
      setMigrationChecked(true);
      return () => { mounted = false; };
    }
    getLocalMigrationCandidate(access.workspaceId)
      .then((state) => { if (mounted) setMigrationState(state); })
      .catch(() => undefined)
      .finally(() => { if (mounted) setMigrationChecked(true); });
    return () => { mounted = false; };
  }, [access.role, access.workspaceId]);

  if (!family.isHydrated || !migrationChecked) return <CloudLoadingScreen label="Syncing your Kudos workspace…" />;

  const signOutSafely = async () => {
    await unregisterDeviceForPush().catch(() => undefined);
    onSignOut();
  };

  return (
    <>
      <AppContent cloudAccess={access} cloudDisplayName={displayName} cloudEmail={email} family={family} onCloudSignOut={() => void signOutSafely()} onOpenLifetimeUpgrade={onOpenLifetimeUpgrade} onWorkspaceRefresh={onWorkspaceRefresh} onWorkspaceTypeChange={onWorkspaceTypeChange} showTrialUpgrade={showTrialUpgrade} workspaceAccessList={accessList} />
      <LocalMigrationModal
        onImport={async () => {
          if (!migrationState) return;
          await migrateLocalState(access.workspaceId, migrationState);
          setMigrationState(null);
          await family.refresh?.();
        }}
        onSkip={async () => {
          await skipLocalMigration(access.workspaceId);
          setMigrationState(null);
        }}
        state={migrationState}
        theme={migrationTheme}
        visible={Boolean(migrationState)}
      />
    </>
  );
}

function EntitledWorkspaceApp({ access, accessList, email, displayName, onSignOut, onWorkspaceRefresh, onWorkspaceTypeChange, userId }: { access: WorkspaceAccess; accessList: WorkspaceAccess[]; email: string; displayName?: string; onSignOut: () => void; onWorkspaceRefresh: () => Promise<void>; onWorkspaceTypeChange: (type: WorkspaceType) => Promise<void>; userId: string }) {
  const { entitlement, error, isLoading, refresh, setEntitlement } = useWorkspaceEntitlement(userId, access.workspaceId);
  const [purchaseVisible, setPurchaseVisible] = useState(false);
  useApplePurchaseReconciliation({
    enabled: entitlement?.status === 'lifetime'
      && Boolean(entitlement.ownershipType)
      && entitlement.isBillingOwner
      && access.role !== 'child',
    onReconciled: setEntitlement,
    userId,
    workspaceId: access.workspaceId,
  });

  if (isLoading && !entitlement) return <CloudLoadingScreen label="Checking family access…" />;

  if (!entitlement) {
    const unavailable: EvaluatedEntitlement = {
      workspaceId: access.workspaceId,
      status: 'not_started',
      canAccess: false,
      canPurchase: false,
      isBillingOwner: false,
      role: access.role,
      trialStartedAt: null,
      trialExpiresAt: null,
      lifetimeUnlockedAt: null,
      lastVerifiedAt: null,
      ownershipType: null,
      checkedAt: new Date().toISOString(),
      source: 'offline',
      isOfflineGrace: false,
    };
    return <WorkspaceAccessPausedScreen access={access} entitlement={unavailable} error={error} onRefresh={refresh} onSignOut={onSignOut} />;
  }

  if (entitlement.canAccess) {
    const canUpgradeDuringTrial = entitlement.status === 'trial' && entitlement.canPurchase && access.role !== 'child';
    if (purchaseVisible && canUpgradeDuringTrial) {
      return <PurchaseAccessScreen access={access} entitlement={entitlement} error={error} onClose={() => setPurchaseVisible(false)} onRefresh={refresh} onSignOut={onSignOut} onVerified={(verified) => { setEntitlement(verified); setPurchaseVisible(false); }} userId={userId} />;
    }
    return <ConnectedWorkspaceApp access={access} accessList={accessList} displayName={displayName} email={email} onOpenLifetimeUpgrade={canUpgradeDuringTrial ? () => setPurchaseVisible(true) : undefined} onSignOut={onSignOut} onWorkspaceRefresh={onWorkspaceRefresh} onWorkspaceTypeChange={onWorkspaceTypeChange} showTrialUpgrade={canUpgradeDuringTrial} />;
  }

  if (entitlement.canPurchase && access.role !== 'child') {
    return <PurchaseAccessScreen access={access} entitlement={entitlement} error={error} onRefresh={refresh} onSignOut={onSignOut} onVerified={setEntitlement} userId={userId} />;
  }

  return <WorkspaceAccessPausedScreen access={access} entitlement={entitlement} error={error} onRefresh={refresh} onSignOut={onSignOut} />;
}

function CloudAppRouter({ onUseLocalDemo }: { onUseLocalDemo: () => void }) {
  const auth = useAuth();
  const workspaces = useWorkspaceAccess(auth.user);
  const colorScheme = useColorScheme();
  const workspaceModalTheme = colorScheme === 'dark' ? darkTheme : lightTheme;
  const [workspaceToCreate, setWorkspaceToCreate] = useState<WorkspaceType | null>(null);
  const childAccount = auth.user?.is_anonymous === true || auth.user?.user_metadata?.account_type === 'child';

  const changeWorkspaceType = async (type: WorkspaceType) => {
    if (childAccount || workspaces.selected?.workspaceType === type) return;
    const existing = workspaces.accessList.find((item) => item.workspaceType === type && (item.role === 'parent' || item.role === 'teacher'));
    if (existing) {
      await workspaces.selectWorkspace(existing.workspaceId);
      return;
    }
    setWorkspaceToCreate(type);
  };

  const createAndOpenWorkspace = async (name: string) => {
    if (!workspaceToCreate) return;
    await createWorkspace(name, workspaceToCreate);
    await workspaces.refresh();
    setWorkspaceToCreate(null);
  };

  if (!isSupabaseConfigured) return <CloudSetupScreen onUseLocalDemo={onUseLocalDemo} />;
  if (auth.isLoading) return <CloudLoadingScreen />;
  if (auth.isRecoveringPassword) return <PasswordRecoveryScreen />;
  if (!auth.session || !auth.user) return <AuthScreen />;
  if (workspaces.isLoading) return <CloudLoadingScreen label="Loading your workspaces…" />;
  if (childAccount && workspaces.selected?.role !== 'child') return <ChildAccountStatusScreen error={workspaces.error} onRetry={() => void workspaces.refresh()} />;
  if (!workspaces.selected && workspaces.hasPendingAdultInvite) return <AdultInviteStatusScreen error={workspaces.error} onRetry={() => void workspaces.refresh()} onSignOut={() => void auth.signOut()} />;
  if (!workspaces.selected) return <WorkspaceOnboardingScreen onComplete={() => void workspaces.refresh()} onSignOut={() => void auth.signOut()} />;

  return <>
    <EntitledWorkspaceApp key={workspaces.selected.workspaceId} access={workspaces.selected} accessList={workspaces.accessList} displayName={(auth.user.user_metadata?.display_name as string | undefined)} email={auth.user.email ?? ''} onSignOut={() => void auth.signOut()} onWorkspaceRefresh={async () => { await workspaces.refresh(); }} onWorkspaceTypeChange={changeWorkspaceType} userId={auth.user.id} />
    <WorkspaceSwitchModal onCancel={() => setWorkspaceToCreate(null)} onCreate={createAndOpenWorkspace} targetType={workspaceToCreate} theme={workspaceModalTheme} />
  </>;
}

function RootRouter() {
  const [localDemo, setLocalDemo] = useState(false);
  if (localDemo) return <LocalDemoApp />;
  return <CloudAppRouter onUseLocalDemo={() => setLocalDemo(true)} />;
}

export default function App() {
  return <SafeAreaProvider><AuthProvider><RootRouter /></AuthProvider></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  app: { flex: 1 },
  safeArea: { flex: 1 },
  content: { alignSelf: 'center', maxWidth: 960, paddingBottom: 104, paddingHorizontal: 20, paddingTop: 12, width: '100%' },
});
