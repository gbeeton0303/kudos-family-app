import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { FailedSyncChange } from '../cloud/types';
import type { AppTheme } from '../theme';

function mutationTitle(item: FailedSyncChange) {
  const labels: Record<string, string> = {
    add_profile: 'Create Profile', update_profile: 'Update Profile', delete_profile: 'Delete Profile',
    add_task: 'Create Task', delete_task: 'Delete Task', set_task_assignment: 'Change Task Assignment',
    complete_task: 'Complete Task', request_task: 'Submit Task For Approval', resolve_task: 'Review Task Request',
    add_reward: 'Create Reward', delete_reward: 'Delete Reward', set_reward_assignment: 'Change Reward Assignment',
    redeem_reward: 'Redeem Reward', open_delivery: 'Open Reward Delivery',
  };
  return labels[item.mutation.type] ?? 'Cloud Change';
}

function friendlyReason(error: string) {
  if (!error || error === '[object Object]') return 'Cloud request failed. Retry this change to retrieve the current server message.';
  if (/insufficient balance/i.test(error)) return 'The cloud balance was too low for this reward. You can retry after more points are earned, or discard this request.';
  if (/not authorized/i.test(error)) return 'This account no longer has permission to make this change.';
  if (/already completed/i.test(error)) return 'This task was already completed for the same period.';
  return error;
}

export function FailedSyncChangesModal({ visible, changes, theme, onClose, onRetry, onRetryAll, onDiscard }: {
  visible: boolean; changes: FailedSyncChange[]; theme: AppTheme; onClose: () => void;
  onRetry: (id: string) => void; onRetryAll: () => void; onDiscard: (id: string) => void;
}) {
  return <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={visible}>
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <View style={styles.headerCopy}><Text style={[styles.eyebrow, { color: theme.reward }]}>CLOUD SYNC</Text><Text style={[styles.title, { color: theme.text }]}>Failed Sync Changes</Text><Text style={[styles.subtitle, { color: theme.textMuted }]}>{changes.length ? `${changes.length} change${changes.length === 1 ? '' : 's'} need your attention.` : 'There are no failed changes.'}</Text></View>
        <Pressable onPress={onClose} style={[styles.close, { backgroundColor: theme.surfaceMuted }]}><Text style={[styles.closeText, { color: theme.text }]}>×</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {changes.length === 0 ? <View style={[styles.empty, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={styles.emptyIcon}>✓</Text><Text style={[styles.emptyTitle, { color: theme.text }]}>Everything Is Synced</Text><Text style={[styles.emptyText, { color: theme.textMuted }]}>Kudos has no rejected cloud changes.</Text></View> : changes.map((item) => <View key={item.id} style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.cardHeading}><View style={[styles.warningIcon, { backgroundColor: theme.rewardSoft }]}><Text>!</Text></View><View style={styles.cardCopy}><Text style={[styles.cardTitle, { color: theme.text }]}>{mutationTitle(item)}</Text><Text style={[styles.time, { color: theme.textMuted }]}>{new Date(item.failedAt).toLocaleString()} · Attempt {item.attempts}</Text></View></View>
          <Text style={[styles.reason, { color: theme.textMuted }]}>{friendlyReason(item.error)}</Text>
          <View style={styles.actions}><Pressable onPress={() => onDiscard(item.id)} style={[styles.secondary, { borderColor: theme.border }]}><Text style={[styles.secondaryText, { color: theme.danger }]}>Discard</Text></Pressable><Pressable onPress={() => onRetry(item.id)} style={[styles.primary, { backgroundColor: theme.primary }]}><Text style={styles.primaryText}>Retry</Text></Pressable></View>
        </View>)}
      </ScrollView>
      {changes.length > 1 ? <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}><Pressable onPress={onRetryAll} style={[styles.retryAll, { backgroundColor: theme.primary }]}><Text style={styles.primaryText}>Retry All Changes</Text></Pressable></View> : null}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({ screen:{flex:1}, header:{alignItems:'flex-start',borderBottomWidth:StyleSheet.hairlineWidth,flexDirection:'row',gap:12,padding:20},headerCopy:{flex:1,gap:4},eyebrow:{fontSize:12,fontWeight:'900',letterSpacing:1.1},title:{fontSize:25,fontWeight:'900'},subtitle:{fontSize:14,lineHeight:19},close:{alignItems:'center',borderRadius:18,height:36,justifyContent:'center',width:36},closeText:{fontSize:25,lineHeight:27},content:{gap:12,padding:18,paddingBottom:32},card:{borderRadius:20,borderWidth:1,gap:12,padding:16},cardHeading:{alignItems:'center',flexDirection:'row',gap:11},warningIcon:{alignItems:'center',borderRadius:15,height:30,justifyContent:'center',width:30},cardCopy:{flex:1,gap:2},cardTitle:{fontSize:17,fontWeight:'900'},time:{fontSize:12,lineHeight:15},reason:{fontSize:14,lineHeight:20},actions:{flexDirection:'row',gap:10,justifyContent:'flex-end'},secondary:{borderRadius:14,borderWidth:1,minWidth:92,paddingHorizontal:15,paddingVertical:11},secondaryText:{fontSize:14,fontWeight:'900',textAlign:'center'},primary:{borderRadius:14,minWidth:92,paddingHorizontal:15,paddingVertical:12},primaryText:{color:'#FFFFFF',fontSize:14,fontWeight:'900',textAlign:'center'},empty:{alignItems:'center',borderRadius:22,borderWidth:1,gap:6,padding:28},emptyIcon:{fontSize:30},emptyTitle:{fontSize:18,fontWeight:'900'},emptyText:{fontSize:14,textAlign:'center'},footer:{borderTopWidth:StyleSheet.hairlineWidth,padding:16},retryAll:{borderRadius:16,padding:14} });
