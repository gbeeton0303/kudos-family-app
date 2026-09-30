import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CurrencyIcon } from '../components/CurrencyIcon';
import { ItemIconView } from '../components/ItemIconView';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { ScreenHeader } from '../components/ScreenHeader';
import { useClassroomMode } from '../context/ClassroomModeContext';
import { CURRENCY_META } from '../data/currency';
import { eventToDate, getTaskEvents, isTaskAssignedToProfile, taskAppearsOnDate, toDateKey } from '../data/familyData';
import { getProfileAccent } from '../data/profileStyles';
import type { AppTheme } from '../theme';
import type { ChildProfile, ChildTask } from '../types';

type HistoryScreenProps = {
  theme: AppTheme;
  profiles: ChildProfile[];
  tasks: ChildTask[];
  onSelectProfile: (profileId: string) => void;
};

type DayItem = { date: Date; inMonth: boolean };
const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function atNoon(date: Date) {
  const result = new Date(date);
  result.setHours(12, 0, 0, 0);
  return result;
}

function monthGrid(month: Date): DayItem[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return { date, inMonth: date.getMonth() === month.getMonth() };
  });
}

function completedExactlyOn(task: ChildTask, profileId: string, date: Date) {
  const key = toDateKey(date);
  return getTaskEvents(task, profileId).some((event) => toDateKey(eventToDate(event)) === key);
}

export function HistoryScreen({ theme, profiles, tasks, onSelectProfile }: HistoryScreenProps) {
  const { terms } = useClassroomMode();
  const todayKey = toDateKey();
  const [visibleMonth, setVisibleMonth] = useState(() => atNoon(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => atNoon(new Date()));
  const days = useMemo(() => monthGrid(visibleMonth), [visibleMonth]);

  const rowsByProfile = useMemo(() => {
    const selectedIsFuture = toDateKey(selectedDate) > todayKey;
    return profiles.map((profile) => {
    const rows = tasks.flatMap((task) => {
      const completed = completedExactlyOn(task, profile.id, selectedDate);
      const scheduled = isTaskAssignedToProfile(task, profile.id) && taskAppearsOnDate(task, selectedDate) && (!selectedIsFuture || task.frequency !== 'unlimited');
      return scheduled || completed ? [{ task, scheduled, completed }] : [];
    });
    return { profile, rows };
    }).filter((group) => group.rows.length > 0);
  }, [profiles, selectedDate, tasks, todayKey]);

  const countsForDate = (date: Date) => {
    let scheduled = 0;
    let completed = 0;
    profiles.forEach((profile) => tasks.forEach((task) => {
      const dateIsFuture = toDateKey(date) > todayKey;
      if (isTaskAssignedToProfile(task, profile.id) && taskAppearsOnDate(task, date) && (!dateIsFuture || task.frequency !== 'unlimited')) scheduled += 1;
      if (completedExactlyOn(task, profile.id, date)) completed += 1;
    }));
    return { scheduled, completed };
  };

  const shiftMonth = (amount: number) => {
    setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + amount, 1, 12));
  };

  const jumpToday = () => {
    const today = atNoon(new Date());
    setVisibleMonth(today);
    setSelectedDate(today);
  };

  const selectedCounts = countsForDate(selectedDate);

  return (
    <View>
      <ScreenHeader
        eyebrow={`${terms.group} schedule & history`}
        title="Calendar History"
        subtitle={`Choose any past, present, or future day to see scheduled and completed tasks grouped by ${terms.profileLower}.`}
        theme={theme}
      />

      <View style={[styles.calendarCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <View style={styles.monthHeader}>
          <Pressable accessibilityLabel="Previous month" onPress={() => shiftMonth(-1)} style={({ pressed }) => [styles.arrowButton, { backgroundColor: theme.surfaceMuted }, pressed && styles.pressed]}><Text style={[styles.arrow, { color: theme.text }]}>‹</Text></Pressable>
          <View style={styles.monthCopy}>
            <Text style={[styles.monthTitle, { color: theme.text }]}>{visibleMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
            <Pressable onPress={jumpToday}><Text style={[styles.todayLink, { color: theme.primary }]}>Jump to today</Text></Pressable>
          </View>
          <Pressable accessibilityLabel="Next month" onPress={() => shiftMonth(1)} style={({ pressed }) => [styles.arrowButton, { backgroundColor: theme.surfaceMuted }, pressed && styles.pressed]}><Text style={[styles.arrow, { color: theme.text }]}>›</Text></Pressable>
        </View>

        <View style={styles.weekLabels}>{DAY_LABELS.map((label) => <Text key={label} style={[styles.weekLabel, { color: theme.textMuted }]}>{label}</Text>)}</View>
        <View style={styles.grid}>
          {days.map(({ date, inMonth }) => {
            const key = toDateKey(date);
            const selected = key === toDateKey(selectedDate);
            const today = key === todayKey;
            const counts = countsForDate(date);
            return (
              <Pressable key={key} onPress={() => { setSelectedDate(date); if (!inMonth) setVisibleMonth(date); }} style={({ pressed }) => [styles.dayCell, selected && { backgroundColor: theme.primary }, pressed && styles.pressed]}>
                <Text style={[styles.dayNumber, { color: selected ? '#FFFFFF' : inMonth ? theme.text : theme.textMuted }, today && !selected && { color: theme.primary }]}>{date.getDate()}</Text>
                <View style={styles.dots}>
                  {counts.completed > 0 ? <View style={[styles.dot, { backgroundColor: selected ? '#FFFFFF' : theme.success }]} /> : null}
                  {counts.scheduled > counts.completed ? <View style={[styles.dot, { backgroundColor: selected ? '#FFFFFFAA' : theme.primary }]} /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.legend}>
          <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: theme.success }]} /><Text style={[styles.legendText, { color: theme.textMuted }]}>Completed</Text></View>
          <View style={styles.legendItem}><View style={[styles.dot, { backgroundColor: theme.primary }]} /><Text style={[styles.legendText, { color: theme.textMuted }]}>Scheduled</Text></View>
        </View>
      </View>

      <View style={styles.selectedHeader}>
        <View>
          <Text style={[styles.selectedTitle, { color: theme.text }]}>{selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</Text>
          <Text style={[styles.selectedMeta, { color: theme.textMuted }]}>{selectedCounts.completed} completed · {selectedCounts.scheduled} scheduled</Text>
        </View>
      </View>

      {rowsByProfile.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={styles.emptyEmoji}>🗓️</Text>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No Tasks For This Day</Text>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>Choose another date or schedule tasks from the Tasks library.</Text>
        </View>
      ) : rowsByProfile.map(({ profile, rows }) => {
        const accent = getProfileAccent(profile.colorKey);
        const currency = CURRENCY_META[profile.currencyType];
        return (
          <View key={profile.id} style={[styles.profileCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Pressable onPress={() => onSelectProfile(profile.id)} style={({ pressed }) => [styles.profileHeader, { backgroundColor: `${accent}18` }, pressed && styles.pressed]}>
              <ProfileAvatar avatar={profile.avatar} size={42} theme={theme} />
              <View style={styles.profileCopy}><Text style={[styles.profileName, { color: accent }]}>{profile.name}</Text><Text style={[styles.profileMeta, { color: theme.textMuted }]}>{rows.length} task{rows.length === 1 ? '' : 's'}</Text></View>
            </Pressable>
            {rows.map(({ task, completed, scheduled }, index) => (
              <View key={task.id} style={[styles.taskRow, index < rows.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
                <View style={[styles.statusCircle, { backgroundColor: completed ? theme.success : theme.primarySoft }]}><Text style={[styles.statusIcon, { color: completed ? '#FFFFFF' : theme.primary }]}>{completed ? '✓' : '○'}</Text></View>
                <ItemIconView backgroundColor={theme.secondarySoft} icon={task.icon} size={42} theme={theme} />
                <View style={styles.taskCopy}>
                  <Text style={[styles.taskTitle, { color: theme.text }]}>{task.title}</Text>
                  <Text style={[styles.taskStatus, { color: completed ? theme.success : theme.textMuted }]}>{completed ? 'Completed' : scheduled ? 'Scheduled' : 'Activity recorded'}</Text>
                </View>
                <View style={styles.amountRow}><Text style={[styles.amount, { color: currency.color }]}>+{task.amount}</Text><CurrencyIcon color={currency.color} size={16} type={profile.currencyType} /></View>
              </View>
            ))}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  calendarCard: { borderRadius: 24, borderWidth: 1, marginBottom: 22, padding: 14 },
  monthHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  monthCopy: { alignItems: 'center', gap: 3 },
  monthTitle: { fontSize: 18, fontWeight: '900' },
  todayLink: { fontSize: 12, fontWeight: '900' },
  arrowButton: { alignItems: 'center', borderRadius: 14, height: 38, justifyContent: 'center', width: 38 },
  arrow: { fontSize: 29, fontWeight: '500', lineHeight: 31 },
  weekLabels: { flexDirection: 'row', marginBottom: 5 },
  weekLabel: { flex: 1, fontSize: 10, fontWeight: '900', textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  dayCell: { alignItems: 'center', borderRadius: 12, height: 45, justifyContent: 'center', width: '14.2857%' },
  dayNumber: { fontSize: 14, fontWeight: '900' },
  dots: { flexDirection: 'row', gap: 3, height: 5, marginTop: 3 },
  dot: { borderRadius: 99, height: 5, width: 5 },
  legend: { flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 10 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  legendText: { fontSize: 11, fontWeight: '700' },
  selectedHeader: { marginBottom: 12 },
  selectedTitle: { fontSize: 18, fontWeight: '900' },
  selectedMeta: { fontSize: 12, marginTop: 3 },
  profileCard: { borderRadius: 22, borderWidth: 1, marginBottom: 13, overflow: 'hidden', paddingHorizontal: 14 },
  profileHeader: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: 11, marginHorizontal: -5, marginTop: 9, padding: 10 },
  profileCopy: { flex: 1 },
  profileName: { fontSize: 15, fontWeight: '900' },
  profileMeta: { fontSize: 12, marginTop: 2 },
  taskRow: { alignItems: 'center', flexDirection: 'row', gap: 10, minHeight: 76, paddingVertical: 11 },
  statusCircle: { alignItems: 'center', borderRadius: 99, height: 28, justifyContent: 'center', width: 28 },
  statusIcon: { fontSize: 15, fontWeight: '900' },
  taskCopy: { flex: 1 },
  taskTitle: { fontSize: 14, fontWeight: '900' },
  taskStatus: { fontSize: 12, fontWeight: '700', marginTop: 3 },
  amountRow: { alignItems: 'center', flexDirection: 'row', gap: 4 }, amount: { fontSize: 12, fontWeight: '900' },
  emptyCard: { alignItems: 'center', borderRadius: 22, borderWidth: 1, gap: 5, padding: 30 },
  emptyEmoji: { fontSize: 32 },
  emptyTitle: { fontSize: 15, fontWeight: '900' },
  emptyText: { fontSize: 12, lineHeight: 16, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
