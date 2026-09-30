import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppTheme } from '../theme';
import type { CloudSyncStatus } from '../cloud/types';

export function CloudSyncBanner({ status, error, pendingCount, failedCount = 0, theme, onRetry, onReview }: {
  status: CloudSyncStatus;
  error?: string | null;
  pendingCount: number;
  failedCount?: number;
  theme: AppTheme;
  onRetry: () => void;
  onReview?: () => void;
}) {
  const offline = status === 'offline' || status === 'error';
  // Normal cloud writes happen frequently after task approval, profile edits,
  // and rewards. Showing/hiding a multi-line banner in the ScrollView for
  // every write changes the content height above the profile and makes the
  // entire screen appear to jump. Keep the banner for actionable states only.
  if (!offline && failedCount === 0) return null;
  const needsReview = failedCount > 0;
  const title = needsReview ? 'Some Changes Need Review' : offline ? 'Working From The Offline Cache' : 'Syncing With Kudos Cloud';
  const detail = needsReview
    ? `${failedCount} rejected change${failedCount === 1 ? '' : 's'} ${failedCount === 1 ? 'is' : 'are'} saved for review.`
    : offline
      ? ((typeof error === 'string' && error !== '[object Object]' ? error : null) || `${pendingCount} changes will upload when the connection returns.`)
      : `${pendingCount} pending change${pendingCount === 1 ? '' : 's'}`;
  const accent = offline || needsReview ? theme.reward : theme.primary;
  return (
    <Pressable onPress={needsReview && onReview ? onReview : onRetry} style={[styles.banner, { backgroundColor: offline || needsReview ? theme.rewardSoft : theme.primarySoft, borderColor: accent }]}>
      <Text style={styles.icon}>{needsReview ? '⚠️' : offline ? '☁️' : '↻'}</Text>
      <View style={styles.copy}><Text style={[styles.title, { color: accent }]}>{title}</Text><Text numberOfLines={2} style={[styles.text, { color: theme.textMuted }]}>{detail}</Text></View>
      <Text style={[styles.retry, { color: accent }]}>{needsReview ? 'Review' : 'Retry'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({ banner: { alignItems: 'center', borderRadius: 17, borderWidth: 1, flexDirection: 'row', gap: 10, marginBottom: 13, padding: 12 }, icon: { fontSize: 20 }, copy: { flex: 1 }, title: { fontSize: 13, fontWeight: '900' }, text: { fontSize: 12, lineHeight: 14, marginTop: 2 }, retry: { fontSize: 12, fontWeight: '900' } });
