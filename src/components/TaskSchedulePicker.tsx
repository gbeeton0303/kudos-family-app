import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { toDateKey } from '../data/familyData';
import type { AppTheme } from '../theme';
import type { TaskFrequency } from '../types';

type TaskSchedulePickerProps = {
  frequency: TaskFrequency;
  selectedDays: number[];
  selectedDates: string[];
  onDaysChange: (days: number[]) => void;
  onDatesChange: (dates: string[]) => void;
  theme: AppTheme;
};

const WEEKDAYS = [
  { label: 'Sun', value: 0 },
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
];

const CALENDAR_WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function TaskSchedulePicker({ frequency, selectedDays, selectedDates, onDaysChange, onDatesChange, theme }: TaskSchedulePickerProps) {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), 1, 12);
  });

  if (frequency === 'weekly') {
    return (
      <View style={[styles.scheduleCard, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}> 
        <Text style={[styles.scheduleTitle, { color: theme.text }]}>Choose Days Of The Week</Text>
        <Text style={[styles.scheduleHint, { color: theme.textMuted }]}>This task appears on the selected days and can be completed only once during that calendar week.</Text>
        <View style={styles.weekdayRow}>
          {WEEKDAYS.map((day) => {
            const selected = selectedDays.includes(day.value);
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={day.value}
                onPress={() => onDaysChange(selected ? selectedDays.filter((value) => value !== day.value) : [...selectedDays, day.value].sort())}
                style={({ pressed }) => [
                  styles.weekdayButton,
                  {
                    backgroundColor: selected ? theme.secondary : theme.surface,
                    borderColor: selected ? theme.secondary : theme.border,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.weekdayText, { color: selected ? '#FFFFFF' : theme.text }]}>{day.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  if (frequency !== 'custom') return null;

  return (
    <View style={[styles.scheduleCard, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}> 
      <Text style={[styles.scheduleTitle, { color: theme.text }]}>Choose Specific Dates</Text>
      <Text style={[styles.scheduleHint, { color: theme.textMuted }]}>Tap one or more calendar dates. The task will appear only on those selected dates.</Text>
      <CustomCalendar
        month={visibleMonth}
        onMonthChange={setVisibleMonth}
        onSelectedDatesChange={onDatesChange}
        selectedDates={selectedDates}
        theme={theme}
      />
    </View>
  );
}

function CustomCalendar({ month, selectedDates, onSelectedDatesChange, onMonthChange, theme }: {
  month: Date;
  selectedDates: string[];
  onSelectedDatesChange: (dates: string[]) => void;
  onMonthChange: (month: Date) => void;
  theme: AppTheme;
}) {
  const cells = useMemo(() => {
    const year = month.getFullYear();
    const monthIndex = month.getMonth();
    const firstWeekday = new Date(year, monthIndex, 1, 12).getDay();
    const daysInMonth = new Date(year, monthIndex + 1, 0, 12).getDate();
    const values: Array<Date | null> = Array.from({ length: firstWeekday }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) values.push(new Date(year, monthIndex, day, 12));
    while (values.length % 7 !== 0) values.push(null);
    return values;
  }, [month]);

  const changeMonth = (offset: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + offset, 1, 12));
  const selectedSet = new Set(selectedDates);

  return (
    <View style={[styles.calendar, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
      <View style={styles.monthHeader}>
        <Pressable accessibilityLabel="Previous month" onPress={() => changeMonth(-1)} style={[styles.monthButton, { backgroundColor: theme.primarySoft }]}>
          <Text style={[styles.monthButtonText, { color: theme.primary }]}>‹</Text>
        </Pressable>
        <View style={styles.monthCopy}>
          <Text style={[styles.monthTitle, { color: theme.text }]}>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
          <Text style={[styles.selectedCount, { color: theme.textMuted }]}>{selectedDates.length} date{selectedDates.length === 1 ? '' : 's'} selected</Text>
        </View>
        <Pressable accessibilityLabel="Next month" onPress={() => changeMonth(1)} style={[styles.monthButton, { backgroundColor: theme.primarySoft }]}>
          <Text style={[styles.monthButtonText, { color: theme.primary }]}>›</Text>
        </Pressable>
      </View>
      <View style={styles.calendarGrid}>
        {CALENDAR_WEEKDAYS.map((label, index) => <Text key={`${label}-${index}`} style={[styles.calendarWeekday, { color: theme.textMuted }]}>{label}</Text>)}
        {cells.map((date, index) => {
          if (!date) return <View key={`blank-${index}`} style={styles.dayCell} />;
          const key = toDateKey(date);
          const selected = selectedSet.has(key);
          const today = key === toDateKey();
          return (
            <Pressable
              accessibilityLabel={date.toLocaleDateString()}
              accessibilityState={{ selected }}
              key={key}
              onPress={() => onSelectedDatesChange(selected ? selectedDates.filter((item) => item !== key) : [...selectedDates, key].sort())}
              style={({ pressed }) => [
                styles.dayCell,
                selected && { backgroundColor: theme.secondary },
                !selected && today && { borderColor: theme.secondary, borderWidth: 1.5 },
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.dayText, { color: selected ? '#FFFFFF' : theme.text }]}>{date.getDate()}</Text>
            </Pressable>
          );
        })}
      </View>
      {selectedDates.length > 0 ? (
        <View style={styles.selectedDateRow}>
          {selectedDates.slice(0, 5).map((date) => (
            <View key={date} style={[styles.selectedDateChip, { backgroundColor: theme.secondarySoft }]}> 
              <Text style={[styles.selectedDateText, { color: theme.secondary }]}>{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</Text>
            </View>
          ))}
          {selectedDates.length > 5 ? <Text style={[styles.moreDatesText, { color: theme.textMuted }]}>+{selectedDates.length - 5} more</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scheduleCard: { borderRadius: 18, borderWidth: 1, gap: 9, marginBottom: 22, padding: 14 },
  scheduleTitle: { fontSize: 14, fontWeight: '900' },
  scheduleHint: { fontSize: 12, lineHeight: 14 },
  weekdayRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 3 },
  weekdayButton: { alignItems: 'center', borderRadius: 12, borderWidth: 1, flexGrow: 1, minWidth: 48, paddingHorizontal: 7, paddingVertical: 11 },
  weekdayText: { fontSize: 12, fontWeight: '900' },
  calendar: { borderRadius: 18, borderWidth: 1, marginTop: 4, padding: 12 },
  monthHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  monthButton: { alignItems: 'center', borderRadius: 999, height: 34, justifyContent: 'center', width: 34 },
  monthButtonText: { fontSize: 24, fontWeight: '900', lineHeight: 25 },
  monthCopy: { alignItems: 'center', flex: 1 },
  monthTitle: { fontSize: 14, fontWeight: '900' },
  selectedCount: { fontSize: 11, marginTop: 2 },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarWeekday: { fontSize: 11, fontWeight: '900', marginBottom: 6, textAlign: 'center', width: '14.2857%' },
  dayCell: { alignItems: 'center', borderColor: 'transparent', borderRadius: 11, height: 39, justifyContent: 'center', width: '14.2857%' },
  dayText: { fontSize: 12, fontWeight: '800' },
  selectedDateRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 10 },
  selectedDateChip: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5 },
  selectedDateText: { fontSize: 11, fontWeight: '900' },
  moreDatesText: { fontSize: 11, fontWeight: '800' },
  pressed: { opacity: 0.7 },
});
