import type { Session, User } from '@supabase/supabase-js';
import type { LegalAcceptance } from '../legal';

export type WorkspaceType = 'family' | 'classroom';
export type WorkspaceRole = 'parent' | 'teacher' | 'child';
export type CloudSyncStatus = 'loading' | 'syncing' | 'synced' | 'offline' | 'error';

export type WorkspaceAccess = {
  workspaceId: string;
  workspaceName: string;
  workspaceType: WorkspaceType;
  role: WorkspaceRole;
  linkedProfileId: string | null;
};

export type AuthContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isRecoveringPassword: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string, legalAcceptance: LegalAcceptance, adultInviteCode?: string) => Promise<{ needsEmailConfirmation: boolean }>;
  createChildAccount: (inviteCode: string) => Promise<void>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  cancelPasswordRecovery: () => Promise<void>;
};

export type FailedSyncChange = {
  id: string;
  mutation: import('./repository').CloudMutation;
  error: string;
  failedAt: string;
  attempts: number;
};
