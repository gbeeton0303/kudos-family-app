import { CurrencyIcon } from './CurrencyIcon';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CURRENCY_META } from '../data/currency';
import { formatTaskFrequency, toDateKey } from '../data/familyData';
import { getProfileAccent } from '../data/profileStyles';
import type { AppTheme } from '../theme';
import type { ChildProfile, ChildReward, ChildTask, ItemIcon, NewRewardInput, NewTaskInput, TaskFrequency } from '../types';
import { IconPicker } from './IconPicker';
import { TaskSchedulePicker } from './TaskSchedulePicker';

const FREQUENCIES: TaskFrequency[] = ['unlimited', 'daily', 'weekly', 'monthly', 'custom'];

type AddItemModalProps = {
  mode: 'task' | 'reward' | null;
  profile: ChildProfile;
  theme: AppTheme;
  onClose: () => void;
  onAddTask: (input: NewTaskInput) => void;
  onAddReward: (input: NewRewardInput) => void;
  taskToEdit?: ChildTask | null;
  rewardToEdit?: ChildReward | null;
  onUpdateTask?: (taskId: string, input: NewTaskInput) => void;
  onUpdateReward?: (rewardId: string, input: NewRewardInput) => void;
};

export function AddItemModal({ mode, profile, theme, onClose, onAddTask, onAddReward, taskToEdit = null, rewardToEdit = null, onUpdateTask, onUpdateReward }: AddItemModalProps) {
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('5');
  const [frequency, setFrequency] = useState<TaskFrequency>('daily');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState<ItemIcon>({ type: 'preset', value: '✓' });
  const [scheduleDays, setScheduleDays] = useState<number[]>([new Date().getDay()]);
  const [scheduleDates, setScheduleDates] = useState<string[]>([toDateKey()]);
  const currency = CURRENCY_META[profile.currencyType];
  const profileAccent = getProfileAccent(profile.colorKey);

  useEffect(() => {
    if (!mode) return;
    setTitle(taskToEdit?.title ?? rewardToEdit?.title ?? '');
    setAmount(taskToEdit ? String(taskToEdit.amount) : rewardToEdit ? String(rewardToEdit.cost) : mode === 'task' ? '5' : '25');
    setFrequency(taskToEdit?.frequency ?? 'daily');
    setDescription(taskToEdit?.description ?? '');
    setIcon(taskToEdit?.icon ?? rewardToEdit?.icon ?? { type: 'preset', value: mode === 'task' ? '✓' : '🎁' });
    setScheduleDays(taskToEdit?.scheduleDays ?? [new Date().getDay()]);
    setScheduleDates(taskToEdit?.scheduleDates ?? [toDateKey()]);
  }, [mode, rewardToEdit, taskToEdit]);

  const save = () => {
    const parsed = Number.parseInt(amount, 10);
    if (!title.trim()) return Alert.alert(`${mode === 'task' ? 'Task' : 'Reward'} name required`, 'Enter a name before saving.');
    if (!Number.isFinite(parsed) || parsed < 1) return Alert.alert('Value Required', 'The value must be at least 1.');
    if (mode === 'task' && frequency === 'weekly' && scheduleDays.length === 0) return Alert.alert('Choose A Day', 'Select at least one day of the week.');
    if (mode === 'task' && frequency === 'custom' && scheduleDates.length === 0) return Alert.alert('Choose A Date', 'Select at least one calendar date.');
    if (mode === 'task') {
      const input = { title, amount: parsed, frequency, description, icon, profileIds: taskToEdit?.assignedProfileIds ?? [profile.id], scheduleDays, scheduleDates };
      if (taskToEdit && onUpdateTask) onUpdateTask(taskToEdit.id, input);
      else onAddTask(input);
    }
    if (mode === 'reward') {
      const input = { title, cost: parsed, icon, profileIds: rewardToEdit?.assignedProfileIds ?? [profile.id] };
      if (rewardToEdit && onUpdateReward) onUpdateReward(rewardToEdit.id, input);
      else onAddReward(input);
    }
    onClose();
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible={mode !== null}>
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}> 
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={[styles.topBar, { borderBottomColor: theme.border }]}> 
            <Pressable onPress={onClose} style={styles.topButton}><Text style={[styles.cancelText, { color: theme.textMuted }]}>Cancel</Text></Pressable>
            <Text style={[styles.topTitle, { color: theme.text }]}>{taskToEdit ? 'Edit task' : rewardToEdit ? 'Edit reward' : `Add ${mode}`}</Text>
            <Pressable onPress={save} style={styles.topButton}><Text style={[styles.saveText, { color: mode === 'task' ? theme.secondary : theme.reward }]}>Save</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <Text style={[styles.eyebrow, { color: mode === 'task' ? theme.secondary : theme.reward }]}>{mode === 'task' ? 'PERSONAL TASK' : 'PERSONAL REWARD'}</Text>
            <Text style={[styles.title, { color: theme.text }]}>{taskToEdit ? 'Edit task for ' : rewardToEdit ? 'Edit reward for ' : mode === 'task' ? 'Add a task for ' : 'Create a reward for '}<Text style={{ color: profileAccent }}>{profile.name}</Text></Text>
            <Text style={[styles.subtitle, { color: theme.textMuted }]}>{mode === 'task' ? `Completing it will add ${currency.label} to ` : 'The cost will use '}<Text style={{ color: profileAccent, fontWeight: '900' }}>{profile.name}</Text>{mode === 'task' ? "'s balance." : `'s selected ${currency.label}.`}</Text>

            <Field label={`${mode === 'task' ? 'Task' : 'Reward'} name`} theme={theme}>
              <TextInput autoCapitalize="sentences" onChangeText={setTitle} placeholder={mode === 'task' ? 'Example: Put laundry away' : 'Example: Choose dessert'} placeholderTextColor={theme.textMuted} style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={title} />
            </Field>

            <Field label={`${mode === 'task' ? 'Task' : 'Reward'} icon`} theme={theme}><IconPicker buttonLabel={mode === 'task' ? 'Choose a task icon' : undefined} kind={mode === 'task' ? 'task' : 'reward'} onChange={setIcon} theme={theme} value={icon} /></Field>

            <Field label={`Value in ${currency.label}`} theme={theme}>
              <View style={[styles.valueInput, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
                <CurrencyIcon color={currency.color} size={26} type={profile.currencyType} />
                <TextInput keyboardType="number-pad" maxLength={5} onChangeText={setAmount} placeholder="5" placeholderTextColor={theme.textMuted} style={[styles.valueTextInput, { color: theme.text }]} value={amount} />
              </View>
            </Field>

            {mode === 'task' ? (
              <>
                <Field label="Frequency" theme={theme}>
                  <View style={styles.frequencyGrid}>
                    {FREQUENCIES.map((option) => {
                      const selected = option === frequency;
                      return <Pressable key={option} onPress={() => setFrequency(option)} style={[styles.frequencyCard, { backgroundColor: selected ? theme.secondarySoft : theme.surface, borderColor: selected ? theme.secondary : theme.border }]}><Text style={[styles.frequencyTitle, { color: selected ? theme.secondary : theme.text }]}>{formatTaskFrequency(option)}</Text><Text style={[styles.frequencyHint, { color: theme.textMuted }]}>{option === 'unlimited' ? 'Every tap' : option === 'daily' ? 'Every day' : option === 'weekly' ? 'Selected weekdays' : 'Specific dates'}</Text></Pressable>;
                    })}
                  </View>
                </Field>
                <TaskSchedulePicker frequency={frequency} onDatesChange={setScheduleDates} onDaysChange={setScheduleDays} selectedDates={scheduleDates} selectedDays={scheduleDays} theme={theme} />
                <Field label="Description (optional)" theme={theme}>
                  <TextInput multiline onChangeText={setDescription} placeholder="Add instructions or encouragement" placeholderTextColor={theme.textMuted} style={[styles.input, styles.descriptionInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} textAlignVertical="top" value={description} />
                </Field>
              </>
            ) : null}

            <Pressable onPress={save} style={({ pressed }) => [styles.primaryButton, { backgroundColor: mode === 'task' ? theme.secondary : theme.reward }, pressed && styles.pressed]}><Text style={styles.primaryButtonText}>{taskToEdit || rewardToEdit ? 'Save changes' : `Add ${mode}`}</Text></Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function Field({ label, theme, children }: { label: string; theme: AppTheme; children: ReactNode }) {
  return <View style={styles.field}><Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, flex: { flex: 1 }, topBar: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 16 }, topButton: { minWidth: 70, paddingVertical: 10 }, cancelText: { fontSize: 15, fontWeight: '700' }, saveText: { fontSize: 15, fontWeight: '900', textAlign: 'right' }, topTitle: { fontSize: 16, fontWeight: '900', textTransform: 'capitalize' },
  content: { alignSelf: 'center', maxWidth: 660, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 48, width: '100%' }, eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1.2 }, title: { flexShrink: 1, fontSize: 26, fontWeight: '900', letterSpacing: -0.6, lineHeight: 32, marginTop: 5 }, subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 24, marginTop: 8 }, field: { gap: 8, marginBottom: 22 }, fieldLabel: { fontSize: 14, fontWeight: '900' }, input: { borderRadius: 16, borderWidth: 1, fontSize: 15, minHeight: 54, paddingHorizontal: 14 }, descriptionInput: { minHeight: 100, paddingTop: 14 }, valueInput: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 58, paddingHorizontal: 14 }, currencyIcon: { fontSize: 21, fontWeight: '900' }, valueTextInput: { flex: 1, fontSize: 20, fontWeight: '900' }, frequencyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, frequencyCard: { borderRadius: 15, borderWidth: 1.5, flexBasis: 145, flexGrow: 1, minHeight: 68, minWidth: 0, padding: 11 }, frequencyTitle: { fontSize: 13, fontWeight: '900' }, frequencyHint: { fontSize: 11, marginTop: 4 }, primaryButton: { alignItems: 'center', borderRadius: 17, marginTop: 22, paddingVertical: 17 }, primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900', textTransform: 'capitalize' }, pressed: { opacity: 0.72 },
});
