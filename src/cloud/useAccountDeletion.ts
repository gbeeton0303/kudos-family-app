import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { deleteEntireKudosAccount, deleteKudosAccount, previewEntireAccountDeletion } from './accountActions';
import type { WorkspaceAccess } from './types';

export function useAccountDeletion(access: WorkspaceAccess, onSignOut: () => void, onWorkspaceRefresh: () => Promise<void>, onClose?: () => void) {
  const [deleting, setDeleting] = useState(false);
  const running = useRef(false);
  const execute = async (operation: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setDeleting(true);
    try { await operation(); }
    catch (error) { Alert.alert('Could Not Delete Account', error instanceof Error ? error.message : String(error)); }
    finally { running.current = false; setDeleting(false); }
  };
  const confirmWorkspaceDeletion = () => {
    if (running.current) return;
    const child = access.role === 'child';
    Alert.alert(child ? 'Delete your account?' : `Delete ${access.workspaceType} workspace?`, child
      ? 'This permanently deletes your child account, linked profile, and associated data.'
      : `This permanently deletes “${access.workspaceName}” and its profiles, tasks, rewards, history, and linked accounts with no other workspace. Your other workspaces will not be affected.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Continue', style: 'destructive', onPress: () => Alert.alert('Are you absolutely sure?', 'Deleted data cannot be recovered.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete Permanently', style: 'destructive', onPress: () => void execute(async () => {
          const result = await deleteKudosAccount(access);
          if (!result?.deleted) throw new Error('Kudos Cloud did not confirm deletion.');
          onClose?.();
          if (result.accountRetained) await onWorkspaceRefresh(); else onSignOut();
        }) },
      ]) },
    ]);
  };
  const confirmEntireAccountDeletion = () => {
    if (access.role === 'child') return;
    void execute(async () => {
      const preview = await previewEntireAccountDeletion();
      const names = preview.ownedWorkspaces.map((item) => `• ${item.name} (${item.type})`).join('\n');
      Alert.alert('Delete My Entire Account?', `This permanently deletes your login and ALL workspaces you created, including their profiles, tasks, rewards, and history.${names ? `\n\nWorkspaces to delete:\n${names}` : '\n\nYou have no owned workspaces.'}\n\nYou will leave ${preview.joinedWorkspaceIds.length} joined workspace(s). Those workspaces and other adults’ accounts will remain. This cannot be undone.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', style: 'destructive', onPress: () => Alert.alert('Delete everything permanently?', 'Your personal account and the owned workspaces listed above cannot be recovered. This does not refund an App Store purchase.', [
          { text: 'Keep My Account', style: 'cancel' },
          { text: 'Delete My Entire Account', style: 'destructive', onPress: () => void execute(async () => {
            await deleteEntireKudosAccount(preview);
            onClose?.();
            onSignOut();
          }) },
        ]) },
      ]);
    });
  };
  return { deleting, confirmWorkspaceDeletion, confirmEntireAccountDeletion };
}
