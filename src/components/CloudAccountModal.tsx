import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { cancelAdultInvite, createAdultInvite, createProfileInvite, createWorkspace, listAdultAccess, removeAdultAccess, renameWorkspace, replaceProfileInvite, type AdultAccessList } from '../cloud/workspaces';
import { deleteKudosAccount } from '../cloud/accountActions';
import type { WorkspaceAccess, CloudSyncStatus, WorkspaceType } from '../cloud/types';
import { getProfileAccent } from '../data/profileStyles';
import type { ChildProfile } from '../types';
import type { AppTheme } from '../theme';
import { ProfileAvatar } from './ProfileAvatar';

export function CloudAccountModal({ visible, access, workspaces, email, profiles, syncStatus, onClose, onRefresh, onWorkspaceRefresh, onWorkspaceTypeChange, onSignOut, theme }: { visible: boolean; access: WorkspaceAccess; workspaces: WorkspaceAccess[]; email: string; profiles: ChildProfile[]; syncStatus: CloudSyncStatus; onClose: () => void; onRefresh: () => void; onWorkspaceRefresh: () => Promise<void>; onWorkspaceTypeChange?: (type: WorkspaceType) => Promise<void>; onSignOut: () => void; theme: AppTheme }) {
  const [invite, setInvite] = useState<{ code: string; profileId: string; expiresAt: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [adultEmail, setAdultEmail] = useState('');
  const [adultBusy, setAdultBusy] = useState(false);
  const [adultAccess, setAdultAccess] = useState<AdultAccessList>({ adults: [], invitations: [] });
  const [workspaceNames, setWorkspaceNames] = useState<Record<WorkspaceType, string>>({ family: '', classroom: '' });
  const [renamingWorkspace, setRenamingWorkspace] = useState<WorkspaceType | null>(null);
  const manager = access.role === 'parent' || access.role === 'teacher';

  const refreshAdults = async () => {
    if (!manager || access.workspaceType !== 'family') return;
    try { setAdultAccess(await listAdultAccess(access.workspaceId)); }
    catch (error) { Alert.alert('Could Not Load Adult Access', error instanceof Error ? error.message : String(error)); }
  };

  useEffect(() => {
    if (visible) {
      setWorkspaceNames({
        family: workspaces.find((item) => item.workspaceType === 'family')?.workspaceName ?? '',
        classroom: workspaces.find((item) => item.workspaceType === 'classroom')?.workspaceName ?? '',
      });
      void refreshAdults();
    }
  }, [visible, access.workspaceId, access.workspaceName, workspaces]);

  const saveWorkspaceName = async (type: WorkspaceType) => {
    const workspace = workspaces.find((item) => item.workspaceType === type);
    const nextValue = workspaceNames[type].trim();
    if (workspace && nextValue === workspace.workspaceName) return;
    setRenamingWorkspace(type);
    try {
      const nextName = workspace
        ? await renameWorkspace(workspace.workspaceId, nextValue)
        : (await createWorkspace(nextValue, type), nextValue);
      setWorkspaceNames((current) => ({ ...current, [type]: nextName }));
      await onWorkspaceRefresh();
      if (!workspace) onClose();
      Alert.alert(`${type === 'classroom' ? 'Classroom' : 'Family'} ${workspace ? 'Name Updated' : 'Created'}`, `Your ${type} is now named “${nextName}”.`);
    } catch (error) {
      Alert.alert(`Could Not ${workspace ? 'Update' : 'Create'} ${type === 'classroom' ? 'Classroom' : 'Family'}`, error instanceof Error ? error.message : String(error));
    } finally {
      setRenamingWorkspace(null);
    }
  };

  const inviteAdult = async () => {
    if (!adultEmail.trim()) return Alert.alert('Enter An Email Address');
    setAdultBusy(true);
    try {
      await createAdultInvite(access.workspaceId, adultEmail);
      setAdultEmail('');
      await refreshAdults();
      Alert.alert('Invitation Sent', 'The adult invitation code was sent by email and will expire in 48 hours.');
    } catch (error) { Alert.alert('Could Not Invite Adult', error instanceof Error ? error.message : String(error)); }
    finally { setAdultBusy(false); }
  };

  const cancelInvite = (id: string, invitedEmail: string) => Alert.alert('Cancel Invitation?', `The invitation for ${invitedEmail} will stop working.`, [{ text: 'Keep', style: 'cancel' }, { text: 'Cancel Invitation', style: 'destructive', onPress: () => void (async () => { try { await cancelAdultInvite(id); await refreshAdults(); } catch (error) { Alert.alert('Could Not Cancel Invitation', error instanceof Error ? error.message : String(error)); } })() }]);
  const removeAdult = (userId: string, adultAccountEmail: string) => Alert.alert('Remove Adult Access?', `${adultAccountEmail} will no longer be able to manage this family. Their personal login will not be deleted.`, [{ text: 'Keep Access', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => void (async () => { try { await removeAdultAccess(access.workspaceId, userId); await refreshAdults(); } catch (error) { Alert.alert('Could Not Remove Adult', error instanceof Error ? error.message : String(error)); } })() }]);

  const confirmDeleteAccount = () => {
    if (deleting) return;
    const isChild = access.role === 'child';
    const groupLabel = access.workspaceType === 'classroom' ? 'classroom' : 'family';
    const title = isChild ? 'Delete your account?' : `Delete ${groupLabel} workspace?`;
    const message = isChild
      ? 'This permanently deletes your child account, linked profile, and the Kudos data associated with that profile. This cannot be undone.'
      : `This permanently deletes “${access.workspaceName}” and all profiles, tasks, rewards, and history inside this ${groupLabel}. Your other workspace will not be affected. This cannot be undone.`;

    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: isChild ? 'Delete My Account' : `Delete ${groupLabel === 'family' ? 'Family' : 'Classroom'}`,
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Are you absolutely sure?',
            'Deleted Kudos accounts and data cannot be recovered.',
            [
              { text: 'Keep Account', style: 'cancel' },
              {
                text: 'Delete Permanently',
                style: 'destructive',
                onPress: async () => {
                  setDeleting(true);
                  try {
                    const result = await deleteKudosAccount(access);
                    onClose();
                    if (result?.accountRetained) await onWorkspaceRefresh();
                    else onSignOut();
                  } catch (error) {
                    Alert.alert('Could Not Delete Account', error instanceof Error ? error.message : String(error));
                  } finally {
                    setDeleting(false);
                  }
                },
              },
            ],
          );
        },
      },
    ]);
  };

  const makeInvite = async (profile: ChildProfile) => {
    setBusyId(profile.id);
    try {
      const result = await createProfileInvite(profile.id);
      setInvite({ code: result.code, profileId: profile.id, expiresAt: result.expires_at });
    } catch (error) { Alert.alert('Could Not Create Invite', error instanceof Error ? error.message : String(error)); }
    finally { setBusyId(null); }
  };

  const replaceChildDevice = (profile: ChildProfile) => Alert.alert(
    `Replace ${profile.name}’s child device?`,
    'This immediately signs out the previously linked child account and revokes its access. The profile, balance, tasks, rewards, and history will be preserved. Continue only if the old device was lost, replaced, or should no longer have access.',
    [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Replace Device',
        style: 'destructive',
        onPress: () => void (async () => {
          setBusyId(profile.id);
          try {
            const result = await replaceProfileInvite(profile.id);
            setInvite({ code: result.code, profileId: profile.id, expiresAt: result.expires_at });
            Alert.alert('Old Child Access Revoked', 'Use the new code on the replacement device. The child’s profile and history were preserved.');
          } catch (error) {
            Alert.alert('Could Not Replace Child Device', error instanceof Error ? error.message : String(error));
          } finally { setBusyId(null); }
        })(),
      },
    ],
  );

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}> 
        <View style={[styles.top, { borderBottomColor: theme.border }]}><Pressable onPress={onClose}><Text style={[styles.topText, { color: theme.textMuted }]}>Close</Text></Pressable><Text style={[styles.topTitle, { color: theme.text }]}>Account</Text><Pressable onPress={onRefresh}><Text style={[styles.topText, { color: theme.primary }]}>Refresh</Text></Pressable></View>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.accountCard, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={styles.cloud}>☁️</Text><View style={styles.accountCopy}><Text style={[styles.workspace, { color: theme.text }]}>{access.workspaceName}</Text><Text style={[styles.meta, { color: theme.textMuted }]}>{email} · {access.role} · {syncStatus}</Text></View></View>
          {manager ? <><Text style={[styles.heading, { color: theme.text }]}>Your Workspaces</Text>{(['family', 'classroom'] as WorkspaceType[]).map((type) => {
            const workspace = workspaces.find((item) => item.workspaceType === type);
            const label = type === 'classroom' ? 'Classroom' : 'Family';
            const unchanged = Boolean(workspace && workspaceNames[type].trim() === workspace.workspaceName);
            return <View key={type} style={[styles.renameCard, { backgroundColor: theme.surface, borderColor: workspace?.workspaceId === access.workspaceId ? theme.primary : theme.border }]}>
              <View style={styles.workspaceTitleRow}><Text style={[styles.renameTitle, { color: theme.text }]}>{label} Name</Text>{workspace?.workspaceId === access.workspaceId ? <Text style={[styles.activePill, { backgroundColor: theme.primarySoft, color: theme.primary }]}>ACTIVE</Text> : null}</View>
              <Text style={[styles.help, { color: theme.textMuted }]}>{workspace ? `This name is shared with everyone connected to this ${type}.` : `Create a separate ${type} with its own profiles, tasks, rewards, and progress.`}</Text>
              <View style={styles.renameRow}><TextInput autoCapitalize="words" maxLength={80} onChangeText={(value) => setWorkspaceNames((current) => ({ ...current, [type]: value }))} placeholder={`${label} name`} placeholderTextColor={theme.textMuted} style={[styles.renameInput, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]} value={workspaceNames[type]} /><Pressable disabled={renamingWorkspace !== null || unchanged || workspaceNames[type].trim().length < 2} onPress={() => void saveWorkspaceName(type)} style={[styles.renameButton, { backgroundColor: theme.primary }, (renamingWorkspace !== null || unchanged || workspaceNames[type].trim().length < 2) && styles.disabled]}><Text style={styles.renameButtonText}>{renamingWorkspace === type ? 'Saving…' : workspace ? 'Save' : 'Create'}</Text></Pressable></View>
              {workspace && workspace.workspaceId !== access.workspaceId && onWorkspaceTypeChange ? <Pressable disabled={renamingWorkspace !== null} onPress={() => { onClose(); void onWorkspaceTypeChange(type); }} style={styles.switchWorkspace}><Text style={[styles.switchWorkspaceText, { color: theme.primary }]}>Open {label}</Text></Pressable> : null}
            </View>;
          })}</> : null}
          {manager && access.workspaceType === 'family' ? <><Text style={[styles.heading, { color: theme.text }]}>Adult Account Access</Text><Text style={[styles.help, { color: theme.textMuted }]}>Invite another adult with full access to manage and delete this family account.</Text><View style={styles.adultInviteRow}><TextInput autoCapitalize="none" autoCorrect={false} keyboardType="email-address" onChangeText={setAdultEmail} placeholder="Adult email address" placeholderTextColor={theme.textMuted} style={[styles.adultInput, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]} value={adultEmail} /><Pressable disabled={adultBusy} onPress={() => void inviteAdult()} style={[styles.adultInviteButton, { backgroundColor: theme.reward }, adultBusy && styles.disabled]}><Text style={styles.adultInviteText}>{adultBusy ? 'Sending…' : 'Invite'}</Text></Pressable></View>
          <View style={styles.adultList}>{adultAccess.adults.map((adult) => <View key={adult.userId} style={[styles.adultRow, { borderColor: theme.border }]}><View style={styles.accountCopy}><Text style={[styles.profileName, { color: theme.text }]}>{adult.email}{adult.isCurrentUser ? ' (You)' : ''}</Text><Text style={[styles.profileHint, { color: theme.textMuted }]}>Full parent access</Text></View>{!adult.isCurrentUser ? <Pressable onPress={() => removeAdult(adult.userId, adult.email)}><Text style={[styles.removeAdult, { color: theme.danger }]}>Remove</Text></Pressable> : null}</View>)}</View>
          {adultAccess.invitations.map((pending) => <View key={pending.id} style={[styles.adultRow, { borderColor: theme.border }]}><View style={styles.accountCopy}><Text style={[styles.profileName, { color: theme.text }]}>{pending.invited_email}</Text><Text style={[styles.profileHint, { color: theme.textMuted }]}>Pending · expires {new Date(pending.expires_at).toLocaleString()}</Text></View><Pressable onPress={() => cancelInvite(pending.id, pending.invited_email)}><Text style={[styles.removeAdult, { color: theme.danger }]}>Cancel</Text></Pressable></View>)}</> : null}
          {manager ? <><Text style={[styles.heading, { color: theme.text }]}>{access.workspaceType === 'classroom' ? 'Student' : 'Child'} Device Invitations</Text><Text style={[styles.help, { color: theme.textMuted }]}>Create a temporary code for a new {access.workspaceType === 'classroom' ? 'student' : 'child'} login. If a linked device was lost or replaced, revoke it and generate a replacement code without deleting the profile’s history.</Text>
          <View style={styles.list}>{profiles.map((profile) => <View key={profile.id} style={[styles.profileRow, { backgroundColor: theme.surface, borderColor: theme.border }]}><ProfileAvatar avatar={profile.avatar} size={42} theme={theme} /><View style={styles.profileCopy}><Text style={[styles.profileName, { color: getProfileAccent(profile.colorKey) }]}>{profile.name}</Text><Text style={[styles.profileHint, { color: theme.textMuted }]}>Code expires after 7 days</Text></View><View style={styles.childActions}><Pressable disabled={busyId === profile.id} onPress={() => void makeInvite(profile)}><Text style={[styles.generate, { color: theme.primary }]}>{busyId === profile.id ? '…' : 'Create code'}</Text></Pressable><Pressable disabled={busyId === profile.id} onPress={() => replaceChildDevice(profile)}><Text style={[styles.replaceDevice, { color: theme.danger }]}>Replace device</Text></Pressable></View></View>)}</View>
          {invite ? <View style={[styles.inviteCard, { backgroundColor: theme.primarySoft }]}><Text style={[styles.inviteLabel, { color: theme.primary }]}>INVITE CODE</Text><Text selectable style={[styles.code, { color: theme.text }]}>{invite.code}</Text><Text style={[styles.expires, { color: theme.textMuted }]}>Expires {new Date(invite.expiresAt).toLocaleString()}</Text></View> : null}</> : <View style={[styles.inviteCard, { backgroundColor: theme.primarySoft }]}><Text style={[styles.inviteLabel, { color: theme.primary }]}>CHILD ACCOUNT</Text><Text style={[styles.help, { color: theme.textMuted }]}>This account is securely linked to one profile. Parent and teacher management data is hidden by database security policies.</Text></View>}
          <Pressable disabled={deleting} onPress={onSignOut} style={[styles.signOut, { backgroundColor: theme.dangerSoft }, deleting && styles.disabled]}><Text style={[styles.signOutText, { color: theme.danger }]}>Sign out of Kudos Cloud</Text></Pressable>
          <View style={[styles.dangerZone, { borderColor: theme.danger }]}>
            <Text style={[styles.dangerTitle, { color: theme.danger }]}>Delete Account & Data</Text>
            <Text style={[styles.dangerHelp, { color: theme.textMuted }]}>
              {manager
                ? `Permanently delete this ${access.workspaceType} workspace and everything stored inside it. Your other workspace will not be affected.`
                : 'Permanently delete your child account, linked profile, and the data associated with your profile.'}
            </Text>
            <Pressable disabled={deleting} onPress={confirmDeleteAccount} style={[styles.deleteButton, { backgroundColor: theme.danger }, deleting && styles.disabled]}>
              <Text style={styles.deleteButtonText}>{deleting ? 'Deleting…' : manager ? `Delete ${access.workspaceType === 'classroom' ? 'Classroom' : 'Family'} Workspace` : 'Delete My Account'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 }, top: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 18 }, topTitle: { fontSize: 16, fontWeight: '900' }, topText: { fontSize: 14, fontWeight: '800' }, content: { alignSelf: 'center', maxWidth: 650, padding: 20, paddingBottom: 50, width: '100%' }, accountCard: { alignItems: 'center', borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: 13, padding: 17 }, cloud: { fontSize: 30 }, accountCopy: { flex: 1 }, workspace: { fontSize: 17, fontWeight: '900' }, meta: { fontSize: 12, marginTop: 4, textTransform: 'capitalize' }, heading: { fontSize: 18, fontWeight: '900', marginTop: 24 }, help: { fontSize: 13, lineHeight: 17, marginTop: 5 }, list: { gap: 9, marginTop: 14 }, profileRow: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 11, padding: 12 }, profileCopy: { flex: 1 }, profileName: { fontSize: 14, fontWeight: '900' }, profileHint: { fontSize: 12, marginTop: 3 }, generate: { fontSize: 12, fontWeight: '900' }, inviteCard: { alignItems: 'center', borderRadius: 20, marginTop: 16, padding: 18 }, inviteLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 1 }, code: { fontSize: 30, fontWeight: '900', letterSpacing: 5, marginTop: 8 }, expires: { fontSize: 12, marginTop: 7 }, signOut: { alignItems: 'center', borderRadius: 16, marginTop: 28, padding: 15 }, signOutText: { fontSize: 13, fontWeight: '900' },
  adultInviteRow: { alignItems: 'center', flexDirection: 'row', gap: 9, marginTop: 13 }, adultInput: { borderRadius: 14, borderWidth: 1, flex: 1, fontSize: 14, minHeight: 48, paddingHorizontal: 13 }, adultInviteButton: { alignItems: 'center', borderRadius: 14, justifyContent: 'center', minHeight: 48, paddingHorizontal: 17 }, adultInviteText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' }, adultList: { gap: 8, marginTop: 13 }, adultRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 10, minHeight: 54, paddingVertical: 8 }, removeAdult: { fontSize: 12, fontWeight: '900' },
  dangerZone: { borderRadius: 20, borderWidth: 1, marginTop: 18, padding: 16 },
  dangerTitle: { fontSize: 14, fontWeight: '900' },
  dangerHelp: { fontSize: 12, lineHeight: 17, marginTop: 5 },
  deleteButton: { alignItems: 'center', borderRadius: 15, marginTop: 14, padding: 14 },
  deleteButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  childActions: { alignItems: 'flex-end', gap: 8 },
  replaceDevice: { fontSize: 11, fontWeight: '900' },
  renameCard: { borderRadius: 20, borderWidth: 1, marginTop: 16, padding: 16 },
  renameTitle: { fontSize: 16, fontWeight: '900' },
  renameRow: { alignItems: 'center', flexDirection: 'row', gap: 9, marginTop: 13 },
  renameInput: { borderRadius: 14, borderWidth: 1, flex: 1, fontSize: 14, minHeight: 48, paddingHorizontal: 13 },
  renameButton: { alignItems: 'center', borderRadius: 14, justifyContent: 'center', minHeight: 48, minWidth: 76, paddingHorizontal: 14 },
  renameButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  workspaceTitleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  activePill: { borderRadius: 999, fontSize: 10, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5 },
  switchWorkspace: { alignSelf: 'flex-start', marginTop: 12, paddingVertical: 4 },
  switchWorkspaceText: { fontSize: 13, fontWeight: '900' },
  disabled: { opacity: 0.55 }
});
