export type SectionKey = 'dashboard' | 'history' | 'choreChart' | 'settings';
export type FeatureKey = 'rewards' | 'tasks';
export type AppMode = 'parent' | 'child';

export type AvatarKey =
  | 'avatar-01'
  | 'avatar-02'
  | 'avatar-03'
  | 'avatar-04'
  | 'avatar-05'
  | 'avatar-06'
  | 'avatar-07'
  | 'avatar-08'
  | 'avatar-09'
  | 'avatar-10'
  | 'avatar-11'
  | 'avatar-12';

export type ProfileColorKey = 'blue' | 'pink' | 'red' | 'green' | 'gold' | 'yellow' | 'purple' | 'teal';
export type ProfilePattern = 'solid' | 'striped' | 'polka';
export type CurrencyType = 'stars' | 'marbles' | 'points' | 'coins' | 'dollars';
export type StorageType = 'glassJar' | 'piggyBank' | 'treasureChest';
export type TaskFrequency = 'unlimited' | 'daily' | 'weekly' | 'monthly' | 'custom';

export type ProfileAvatar =
  | { type: 'preset'; key: AvatarKey }
  | { type: 'photo'; uri: string };

export type ItemIcon =
  | { type: 'preset'; value: string }
  | { type: 'photo'; uri: string };

export type ChildProfile = {
  id: string;
  name: string;
  avatar: ProfileAvatar;
  colorKey: ProfileColorKey;
  pattern: ProfilePattern;
  currencyType: CurrencyType;
  storageType: StorageType;
  startingBalance: number;
  balanceResetEvents?: string[];
  createdAt: string;
};

/** A reusable task that can be assigned independently to multiple profiles. */
export type ChildTask = {
  id: string;
  title: string;
  amount: number;
  frequency: TaskFrequency;
  description?: string;
  icon: ItemIcon;
  assignedProfileIds: string[];
  completionEvents: Record<string, string[]>;
  /** Amount actually awarded for each completion event, grouped by profile. */
  completionAmounts?: Record<string, number[]>;
  /** Server-authoritative completion period keys, grouped by profile. */
  completionPeriods?: Record<string, string[]>;
  createdAt: string;
  /** Hidden from assignment screens while retained for balances and history. */
  archivedAt?: string;
  /** Sunday = 0 through Saturday = 6. Used by weekly tasks. */
  scheduleDays?: number[];
  /** Local YYYY-MM-DD dates. Used by custom tasks. */
  scheduleDates?: string[];
  scheduleLabel?: string;
};

/** A reusable reward that can be assigned independently to multiple profiles. */
export type ChildReward = {
  id: string;
  title: string;
  cost: number;
  icon: ItemIcon;
  assignedProfileIds: string[];
  redemptionEvents: Record<string, string[]>;
  redemptionCosts?: Record<string, number[]>;
  createdAt: string;
  /** Hidden from assignment screens while retained for balance history. */
  archivedAt?: string;
};

export type TaskCompletionRequestStatus = 'pending' | 'approved' | 'denied';
export type RewardDeliveryStatus = 'waiting' | 'opened';

export type TaskCompletionRequest = {
  id: string;
  taskId: string;
  profileId: string;
  requestedAt: string;
  status: TaskCompletionRequestStatus;
  periodKey?: string;
  reviewedAt?: string;
};


export type RewardDelivery = {
  id: string;
  rewardId: string;
  rewardTitle: string;
  rewardIcon: ItemIcon;
  profileId: string;
  cost: number;
  balanceBefore: number;
  balanceAfter: number;
  sentAt: string;
  status: RewardDeliveryStatus;
  openedAt?: string;
};

export type FamilyState = {
  profiles: ChildProfile[];
  tasks: ChildTask[];
  rewards: ChildReward[];
  completionRequests: TaskCompletionRequest[];
  rewardDeliveries: RewardDelivery[];
};

export type NewTaskInput = {
  title: string;
  amount: number;
  frequency: TaskFrequency;
  description?: string;
  icon: ItemIcon;
  profileIds?: string[];
  scheduleDays?: number[];
  scheduleDates?: string[];
};

export type NewRewardInput = {
  title: string;
  cost: number;
  icon: ItemIcon;
  profileIds?: string[];
};

export type TaskAward = {
  taskId: string;
  taskTitle: string;
  profileId: string;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  occurredAt: string;
};

export type RewardRedemption = {
  rewardId: string;
  rewardTitle: string;
  rewardIcon: ItemIcon;
  profileId: string;
  cost: number;
  balanceBefore: number;
  balanceAfter: number;
  occurredAt: string;
  presentation?: 'parentSent' | 'childOpened';
};
