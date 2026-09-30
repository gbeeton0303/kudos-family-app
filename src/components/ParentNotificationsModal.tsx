import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useClassroomMode } from '../context/ClassroomModeContext';
import type { AppTheme } from '../theme';
import type { ChildProfile, ChildTask, TaskCompletionRequest } from '../types';
import { CURRENCY_META } from '../data/currency';
import { getProfileAccent } from '../data/profileStyles';
import { ItemIconView } from './ItemIconView';
import { ProfileAvatar } from './ProfileAvatar';

type ParentNotificationsModalProps = {
  visible: boolean;
  requests: TaskCompletionRequest[];
  profiles: ChildProfile[];
  tasks: ChildTask[];
  theme: AppTheme;
  onApprove: (requestId: string) => void;
  onDeny: (requestId: string) => void;
  onClose: () => void;
  resolvingRequestId?: string | null;
};

export function ParentNotificationsModal({ visible, requests, profiles, tasks, theme, onApprove, onDeny, onClose, resolvingRequestId = null }: ParentNotificationsModalProps) {
  const { teacherMode, terms } = useClassroomMode();
  const pending = requests.filter((request) => request.status === 'pending').sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <SafeAreaView style={styles.root}>
        <Pressable onPress={onClose} style={[styles.backdrop, { backgroundColor: theme.overlay }]} />
        <View style={[styles.sheet, { backgroundColor: theme.background, borderColor: theme.border }]}> 
          <View style={styles.header}>
            <View><Text style={[styles.eyebrow, { color: theme.primary }]}>{teacherMode ? 'TEACHER NOTIFICATIONS' : 'PARENT NOTIFICATIONS'}</Text><Text style={[styles.title, { color: theme.text }]}>Task Approvals</Text><Text style={[styles.subtitle, { color: theme.textMuted }]}>{pending.length} task{pending.length === 1 ? '' : 's'} waiting for review</Text></View>
            <Pressable disabled={Boolean(resolvingRequestId)} onPress={onClose} style={[styles.close, { backgroundColor: theme.surfaceMuted }, resolvingRequestId && styles.disabled]}><Text style={[styles.closeText, { color: theme.text }]}>×</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {pending.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={styles.emptyEmoji}>✅</Text><Text style={[styles.emptyTitle, { color: theme.text }]}>You’re All Caught Up</Text><Text style={[styles.emptyText, { color: theme.textMuted }]}>{teacherMode ? 'New class task submissions will appear here.' : 'New Child Mode task submissions will appear here.'}</Text></View>
            ) : pending.map((request) => {
              const profile = profiles.find((item) => item.id === request.profileId);
              const task = tasks.find((item) => item.id === request.taskId);
              if (!profile || !task) return null;
              const currency = CURRENCY_META[profile.currencyType];
              return (
                <View key={request.id} style={[styles.requestCard, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
                  <View style={styles.requestTop}>
                    <ProfileAvatar avatar={profile.avatar} size={44} theme={theme} />
                    <ItemIconView backgroundColor={theme.secondarySoft} icon={task.icon} size={44} theme={theme} />
                    <View style={styles.requestCopy}>
                      <Text style={[styles.requestTitle, { color: theme.text }]}><Text style={{ color: getProfileAccent(profile.colorKey) }}>{profile.name}</Text> completed “{task.title}”</Text>
                      <Text style={[styles.requestMeta, { color: theme.textMuted }]}>{new Date(request.requestedAt).toLocaleString()} · +{task.amount} {currency.label}</Text>
                    </View>
                  </View>
                  <View style={styles.actions}>
                    <Pressable disabled={Boolean(resolvingRequestId)} onPress={() => onDeny(request.id)} style={({ pressed }) => [styles.actionButton, { backgroundColor: theme.dangerSoft }, pressed && styles.pressed, resolvingRequestId && styles.disabled]}><Text style={[styles.actionText, { color: theme.danger }]}>Deny</Text></Pressable>
                    <Pressable disabled={Boolean(resolvingRequestId)} onPress={() => onApprove(request.id)} style={({ pressed }) => [styles.actionButton, { backgroundColor: theme.success }, pressed && styles.pressed, resolvingRequestId && styles.disabled]}><Text style={[styles.approveText]}>{resolvingRequestId === request.id ? 'Approving…' : `Approve +${task.amount}`}</Text></Pressable>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' }, backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: { borderTopLeftRadius: 30, borderTopRightRadius: 30, borderWidth: 1, maxHeight: '88%', minHeight: '55%', paddingTop: 20 },
  header: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 21 },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1 }, title: { fontSize: 25, fontWeight: '900', marginTop: 3 }, subtitle: { fontSize: 13, marginTop: 4 },
  close: { alignItems: 'center', borderRadius: 999, height: 38, justifyContent: 'center', width: 38 }, closeText: { fontSize: 25, marginTop: -2 },
  content: { gap: 11, padding: 20 }, requestCard: { borderRadius: 21, borderWidth: 1, padding: 15 }, requestTop: { alignItems: 'center', flexDirection: 'row', gap: 9 }, requestCopy: { flex: 1 }, requestTitle: { fontSize: 14, fontWeight: '900', lineHeight: 17 }, requestMeta: { fontSize: 12, lineHeight: 14, marginTop: 3 },
  actions: { flexDirection: 'row', gap: 8, marginTop: 13 }, actionButton: { alignItems: 'center', borderRadius: 14, flex: 1, paddingVertical: 11 }, actionText: { fontSize: 12, fontWeight: '900' }, approveText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  disabled: { opacity: 0.55 },
  empty: { alignItems: 'center', borderRadius: 22, borderWidth: 1, padding: 28 }, emptyEmoji: { fontSize: 38 }, emptyTitle: { fontSize: 16, fontWeight: '900', marginTop: 7 }, emptyText: { fontSize: 12, marginTop: 5, textAlign: 'center' }, pressed: { opacity: 0.7 },
});
