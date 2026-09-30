import type {
  CurrencyType,
  FamilyState,
  NewRewardInput,
  NewTaskInput,
  ProfileAvatar,
  ProfileColorKey,
  ProfilePattern,
  StorageType,
  TaskCompletionRequestStatus,
} from '../types';
import type { CloudSyncStatus, FailedSyncChange } from '../cloud/types';

export type NewProfileInput = {
  name: string;
  avatar: ProfileAvatar;
  colorKey: ProfileColorKey;
  pattern: ProfilePattern;
  currencyType: CurrencyType;
  storageType: StorageType;
};

export type FamilyDataController = FamilyState & {
  isHydrated: boolean;
  syncStatus?: CloudSyncStatus;
  syncError?: string | null;
  pendingMutationCount?: number;
  failedSyncChanges?: FailedSyncChange[];
  refresh?: () => Promise<unknown>;
  retryPendingChanges?: () => Promise<void>;
  retryFailedSyncChange?: (id: string) => Promise<void>;
  retryAllFailedSyncChanges?: () => Promise<void>;
  discardFailedSyncChange?: (id: string) => Promise<void>;
  resetCloudSync?: () => Promise<boolean>;
  addProfile: (input: NewProfileInput) => string;
  updateProfile: (profileId: string, input: NewProfileInput) => void;
  updateOwnProfilePreferences: (profileId: string, input: NewProfileInput) => void;
  deleteProfile: (profileId: string) => void;
  addTask: (input: NewTaskInput) => string;
  updateTask: (taskId: string, input: NewTaskInput) => void;
  deleteTask: (taskId: string) => void;
  setTaskAssigned: (taskId: string, profileId: string, assigned: boolean) => void;
  completeTask: (taskId: string, profileId: string, occurredAt?: string, allowRepeatDaily?: boolean) => Promise<boolean>;
  undoLatestTaskCompletion: (profileId: string) => void;
  undoTaskCompletion: (taskId: string, profileId: string) => void;
  requestTaskCompletion: (taskId: string, profileId: string, requestedAt?: string) => string;
  resolveTaskRequest: (requestId: string, status: Exclude<TaskCompletionRequestStatus, 'pending'>, reviewedAt?: string) => void;
  addReward: (input: NewRewardInput) => string;
  updateReward: (rewardId: string, input: NewRewardInput) => void;
  deleteReward: (rewardId: string) => void;
  setRewardAssigned: (rewardId: string, profileId: string, assigned: boolean) => void;
  redeemReward: (rewardId: string, profileId: string, occurredAt?: string, deliverToChild?: boolean, allowEarly?: boolean) => string;
  openRewardDelivery: (deliveryId: string, openedAt?: string) => void;
  resetAllData: () => void;
};
