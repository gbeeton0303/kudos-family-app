import { CurrencyIcon } from '../components/CurrencyIcon';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ItemIconView } from '../components/ItemIconView';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { ScreenHeader } from '../components/ScreenHeader';
import { useClassroomMode } from '../context/ClassroomModeContext';
import { CURRENCY_META } from '../data/currency';
import {
  formatTaskFrequency,
  hasTaskCompletionForPeriod,
  taskAppearsOnDate,
  toDateKey,
} from '../data/familyData';
import { getProfileAccent } from '../data/profileStyles';
import type { AppTheme } from '../theme';
import type { ChildProfile, ChildTask } from '../types';

type CalendarScreenProps = {
  theme: AppTheme;
  profiles: ChildProfile[];
  tasks: ChildTask[];
  onCompleteTask: (taskId: string, profileId: string, date?: Date) => void;
  onSelectProfile: (profileId: string) => void;
};

const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function startOfWeek(date: Date) {
  const start = new Date(date);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  return start;
}

export function CalendarScreen({ theme, profiles, tasks, onCompleteTask, onSelectProfile }: CalendarScreenProps) {
  const { teacherMode, terms } = useClassroomMode();
  const week = useMemo(() => {
    const start = startOfWeek(new Date());
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, []);
  const [selectedDateKey, setSelectedDateKey] = useState(toDateKey());
  const selectedDate = week.find((date) => toDateKey(date) === selectedDateKey) ?? week[0];
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));

  const assignmentsForDate = (date: Date) => tasks
    .filter((task) => taskAppearsOnDate(task, date))
    .flatMap((task) => task.assignedProfileIds.map((profileId) => ({ task, profileId })))
    .filter(({ profileId }) => profileById.has(profileId));

  const selectedAssignments = assignmentsForDate(selectedDate);
  const totalWeekAssignments = week.reduce((total, date) => total + assignmentsForDate(date).length, 0);

  return (
    <View>
      <ScreenHeader
        eyebrow="Weekly plan"
        title={`${terms.group} calendar`}
        subtitle={`See when reusable tasks appear for each ${terms.profileLower}. Unlimited and daily tasks appear every day, weekly tasks follow selected weekdays, and custom tasks appear on selected dates.`}
        theme={theme}
      />

      <View style={[styles.weekCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.weekHeadingRow}>
          <View>
            <Text style={[styles.monthLabel, { color: theme.primary }]}>{selectedDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }).toUpperCase()}</Text>
            <Text style={[styles.weekHeading, { color: theme.text }]}>This Week</Text>
          </View>
          <View style={[styles.taskCountBadge, { backgroundColor: theme.primarySoft }]}><Text style={[styles.taskCountText, { color: theme.primary }]}>{totalWeekAssignments} assignments</Text></View>
        </View>

        <View style={styles.dayStrip}>
          {week.map((date) => {
            const key = toDateKey(date);
            const selected = key === selectedDateKey;
            const count = assignmentsForDate(date).length;
            return (
              <Pressable
                key={key}
                onPress={() => setSelectedDateKey(key)}
                style={({ pressed }) => [
                  styles.dayButton,
                  { backgroundColor: selected ? theme.primary : theme.surfaceMuted, borderColor: selected ? theme.primary : theme.border },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.dayName, { color: selected ? '#FFFFFF' : theme.textMuted }]}>{DAY_LABELS[date.getDay()]}</Text>
                <Text style={[styles.dayDate, { color: selected ? '#FFFFFF' : theme.text }]}>{date.getDate()}</Text>
                <View style={[styles.dayDot, { backgroundColor: selected ? '#FFFFFF' : count > 0 ? theme.primary : 'transparent' }]} />
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={styles.scheduleHeadingRow}>
        <View>
          <Text style={[styles.scheduleTitle, { color: theme.text }]}>{selectedDate.toLocaleDateString(undefined, { weekday: 'long' })}</Text>
          <Text style={[styles.scheduleSubtitle, { color: theme.textMuted }]}>{selectedAssignments.length} {teacherMode ? 'class' : 'profile'} assignment{selectedAssignments.length === 1 ? '' : 's'}</Text>
        </View>
        <View style={[styles.dateBadge, { backgroundColor: theme.secondarySoft }]}><Text style={[styles.dateBadgeText, { color: theme.secondary }]}>{selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text></View>
      </View>

      <View style={[styles.scheduleCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {selectedAssignments.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyEmoji}>🗓️</Text>
            <Text style={[styles.emptyTitle, { color: theme.text }]}>No Tasks Assigned</Text>
            <Text style={[styles.emptyText, { color: theme.textMuted }]}>{`Open the Tasks widget to create a task and assign it to one or more ${teacherMode ? 'classes' : 'profiles'}.`}</Text>
          </View>
        ) : selectedAssignments.map(({ task, profileId }, index) => {
          const profile = profileById.get(profileId);
          if (!profile) return null;
          const complete = hasTaskCompletionForPeriod(task, profile.id, selectedDate);
          const unlimited = task.frequency === 'unlimited';
          const currency = CURRENCY_META[profile.currencyType];
          return (
            <View key={`${task.id}-${profile.id}`} style={[styles.taskRow, index !== selectedAssignments.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <Pressable
                accessibilityLabel={unlimited ? `Award ${task.amount} for ${task.title} to ${profile.name}` : complete ? `${task.title} already completed` : `Complete ${task.title} for ${profile.name}`}
                disabled={!unlimited && complete}
                onPress={() => onCompleteTask(task.id, profile.id, selectedDate)}
                style={[
                  styles.checkCircle,
                  { backgroundColor: complete ? theme.success : unlimited ? theme.rewardSoft : theme.surfaceMuted, borderColor: complete ? theme.success : unlimited ? theme.reward : theme.border },
                ]}
              >
                <Text style={[styles.checkText, { color: complete ? '#FFFFFF' : unlimited ? theme.reward : theme.textMuted }]}>{complete ? '✓' : unlimited ? '+' : ''}</Text>
              </Pressable>
              <ItemIconView backgroundColor={theme.secondarySoft} icon={task.icon} size={42} theme={theme} />
              <Pressable onPress={() => onSelectProfile(profile.id)} style={styles.profileTap}>
                <ProfileAvatar avatar={profile.avatar} size={34} theme={theme} />
              </Pressable>
              <View style={styles.taskCopy}>
                <View style={styles.titleRow}>
                  <Text style={[styles.taskTitle, { color: theme.text }, complete && styles.completedTitle]}>{task.title}</Text>
                  <View style={[styles.frequencyBadge, { backgroundColor: unlimited ? theme.rewardSoft : theme.secondarySoft }]}>
                    <Text style={[styles.frequencyText, { color: unlimited ? theme.reward : theme.secondary }]}>{formatTaskFrequency(task.frequency)}</Text>
                  </View>
                </View>
                <Text style={[styles.taskMeta, { color: theme.textMuted }]}><Text style={{ color: getProfileAccent(profile.colorKey), fontWeight: '900' }}>{profile.name}</Text>{task.description ? ` · ${task.description}` : ''}</Text>
              </View>
              <View style={[styles.starBadge, { backgroundColor: theme.rewardSoft }]}><Text style={[styles.starBadgeText, { color: currency.color }]}>+{task.amount}</Text><CurrencyIcon color={currency.color} size={16} type={profile.currencyType} /></View>
            </View>
          );
        })}
      </View>

      <View style={[styles.calendarHint, { backgroundColor: theme.primarySoft }]}>
        <Text style={styles.calendarHintEmoji}>✨</Text>
        <View style={styles.calendarHintCopy}>
          <Text style={[styles.calendarHintTitle, { color: theme.text }]}>Every Completion Is Connected</Text>
          <Text style={[styles.calendarHintText, { color: theme.textMuted }]}>{`Awarding a task here updates the ${terms.profileLower} balance, history, progress, and animated storage celebration.`}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  weekCard: { borderRadius: 24, borderWidth: 1, marginBottom: 24, padding: 17 },
  weekHeadingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 17 },
  monthLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 1.1 },
  weekHeading: { fontSize: 20, fontWeight: '900', marginTop: 3 },
  taskCountBadge: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  taskCountText: { fontSize: 12, fontWeight: '900' },
  dayStrip: { flexDirection: 'row', gap: 5 },
  dayButton: { alignItems: 'center', borderRadius: 15, borderWidth: 1, flex: 1, gap: 3, minWidth: 0, paddingHorizontal: 2, paddingVertical: 10 },
  dayName: { fontSize: 10, fontWeight: '900' },
  dayDate: { fontSize: 15, fontWeight: '900' },
  dayDot: { borderRadius: 999, height: 4, marginTop: 1, width: 4 },
  scheduleHeadingRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  scheduleTitle: { fontSize: 20, fontWeight: '900' },
  scheduleSubtitle: { fontSize: 13, marginTop: 3 },
  dateBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7 },
  dateBadgeText: { fontSize: 12, fontWeight: '900' },
  scheduleCard: { borderRadius: 24, borderWidth: 1, overflow: 'hidden', paddingHorizontal: 15 },
  taskRow: { alignItems: 'center', flexDirection: 'row', gap: 9, minHeight: 96, paddingVertical: 12 },
  checkCircle: { alignItems: 'center', borderRadius: 999, borderWidth: 1.5, height: 32, justifyContent: 'center', width: 32 },
  checkText: { fontSize: 15, fontWeight: '900' },
  profileTap: { borderRadius: 15 },
  taskCopy: { flex: 1, gap: 4 },
  titleRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  taskTitle: { fontSize: 14, fontWeight: '900' },
  completedTitle: { opacity: 0.55, textDecorationLine: 'line-through' },
  taskMeta: { fontSize: 11, lineHeight: 13 },
  frequencyBadge: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 3 },
  frequencyText: { fontSize: 10, fontWeight: '900' },
  starBadge: { alignItems: 'center', flexDirection: 'row', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 6 },
  starBadgeText: { fontSize: 12, fontWeight: '900' },
  emptyState: { alignItems: 'center', gap: 5, padding: 34 },
  emptyEmoji: { fontSize: 32 },
  emptyTitle: { fontSize: 15, fontWeight: '900' },
  emptyText: { fontSize: 13, lineHeight: 17, textAlign: 'center' },
  calendarHint: { alignItems: 'center', borderRadius: 21, flexDirection: 'row', gap: 13, marginTop: 15, padding: 17 },
  calendarHintEmoji: { fontSize: 26 },
  calendarHintCopy: { flex: 1, gap: 4 },
  calendarHintTitle: { fontSize: 14, fontWeight: '900' },
  calendarHintText: { fontSize: 13, lineHeight: 17 },
  pressed: { opacity: 0.72 },
});
