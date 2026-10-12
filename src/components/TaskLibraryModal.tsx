import { useMemo, useRef, useState, type ReactNode } from 'react';
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
import { CategoryIcon } from './CategoryIcon';
import { CurrencyIcon } from './CurrencyIcon';
import { useClassroomMode } from '../context/ClassroomModeContext';
import { CLASSROOM_SAMPLE_TASKS } from '../data/classroomSamples';
import { CURRENCY_META } from '../data/currency';
import { formatTaskFrequency, formatTaskSchedule, toDateKey } from '../data/familyData';
import { getProfileAccent } from '../data/profileStyles';
import { SAMPLE_TASKS } from '../data/sampleTasks';
import type { AppTheme } from '../theme';
import type { ChildProfile, ChildTask, ItemIcon, NewTaskInput, TaskFrequency } from '../types';
import { IconPicker } from './IconPicker';
import { ItemIconView } from './ItemIconView';
import { ProfileAvatar } from './ProfileAvatar';
import { TaskSchedulePicker } from './TaskSchedulePicker';

type TaskLibraryModalProps = {
  visible: boolean;
  profiles: ChildProfile[];
  tasks: ChildTask[];
  onClose: () => void;
  onAddTask: (input: NewTaskInput) => string;
  onDeleteTask: (taskId: string) => void;
  onUpdateTask: (taskId: string, input: NewTaskInput) => void;
  onSetTaskAssigned: (taskId: string, profileId: string, assigned: boolean) => void;
  theme: AppTheme;
};

const FREQUENCIES: TaskFrequency[] = ['unlimited', 'daily', 'weekly', 'monthly', 'custom'];

export function TaskLibraryModal({ visible, profiles, tasks, onClose, onAddTask, onDeleteTask, onUpdateTask, onSetTaskAssigned, theme }: TaskLibraryModalProps) {
  const { teacherMode, terms } = useClassroomMode();
  const sampleTasks = teacherMode ? CLASSROOM_SAMPLE_TASKS : SAMPLE_TASKS;
  const [showComposer, setShowComposer] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('5');
  const [frequency, setFrequency] = useState<TaskFrequency>('daily');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState<ItemIcon>({ type: 'preset', value: '✓' });
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [scheduleDays, setScheduleDays] = useState<number[]>([new Date().getDay()]);
  const [scheduleDates, setScheduleDates] = useState<string[]>([toDateKey()]);
  const [sampleEdit, setSampleEdit] = useState<{ index: number; value: string } | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const taskHeroBackground = theme.background === '#F4FBF8' || theme.background === '#F7FBF2' ? '#B7D4CA' : theme.surfaceMuted;

  const activeTasks = useMemo(() => tasks.filter((task) => !task.archivedAt), [tasks]);
  const taskKeys = useMemo(() => new Set(activeTasks.map((task) => `${task.title.trim().toLowerCase()}::${task.frequency}`)), [activeTasks]);

  const resetComposer = () => {
    setTitle('');
    setAmount('5');
    setFrequency('daily');
    setDescription('');
    setIcon({ type: 'preset', value: '✓' });
    setSelectedProfileIds([]);
    setScheduleDays([new Date().getDay()]);
    setScheduleDates([toDateKey()]);
    setShowComposer(false);
    setEditingTaskId(null);
  };

  const close = () => { resetComposer(); onClose(); };
  const toggleSelectedProfile = (profileId: string) => setSelectedProfileIds((current) => current.includes(profileId) ? current.filter((id) => id !== profileId) : [...current, profileId]);

  const saveCustomTask = () => {
    const parsed = Number.parseInt(amount, 10);
    if (!title.trim()) return Alert.alert('Task Name Required', 'Enter a name for the task before saving.');
    if (!Number.isFinite(parsed) || parsed < 1) return Alert.alert('Task Value Required', 'Task value must be at least 1.');
    if (frequency === 'weekly' && scheduleDays.length === 0) return Alert.alert('Choose A Day', 'Select at least one day of the week.');
    if (frequency === 'custom' && scheduleDates.length === 0) return Alert.alert('Choose A Date', 'Select at least one calendar date.');
    const input = { title, amount: parsed, frequency, description, icon, profileIds: selectedProfileIds, scheduleDays, scheduleDates };
    if (editingTaskId) onUpdateTask(editingTaskId, input);
    else onAddTask(input);
    resetComposer();
  };

  const beginEdit = (task: ChildTask) => {
    setEditingTaskId(task.id);
    setTitle(task.title);
    setAmount(String(task.amount));
    setFrequency(task.frequency);
    setDescription(task.description ?? '');
    setIcon(task.icon);
    setSelectedProfileIds(task.assignedProfileIds);
    setScheduleDays(task.scheduleDays ?? [new Date().getDay()]);
    setScheduleDates(task.scheduleDates ?? [toDateKey()]);
    setShowComposer(true);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  };

  const addSample = (index: number, overrideAmount?: number) => {
    const sample = sampleTasks[index];
    if (!sample) return;
    onAddTask({
      ...sample,
      amount: overrideAmount ?? sample.amount,
      profileIds: [],
      scheduleDays: sample.frequency === 'weekly'
        ? (sample.scheduleDays?.length ? sample.scheduleDays : [new Date().getDay()])
        : sample.scheduleDays,
    });
  };
  const addEditedSample = () => {
    if (!sampleEdit) return;
    const parsed = Number.parseInt(sampleEdit.value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return Alert.alert('Value Required', 'Enter a value of at least 1.');
    addSample(sampleEdit.index, parsed);
    setSampleEdit(null);
  };

  const addAllSamples = () => {
    const missing = sampleTasks.filter((sample) => !taskKeys.has(`${sample.title.toLowerCase()}::${sample.frequency}`));
    missing.forEach((sample) => onAddTask({
      ...sample,
      profileIds: [],
      scheduleDays: sample.frequency === 'weekly'
        ? (sample.scheduleDays?.length ? sample.scheduleDays : [new Date().getDay()])
        : sample.scheduleDays,
    }));
    if (missing.length === 0) Alert.alert('Samples Already Added', 'Every sample task is already in your task library.');
  };

  const confirmDelete = (task: ChildTask) => Alert.alert(
    `Delete “${task.title}”?`,
    'This removes the task from the library and all profiles. Previous completions and earned points will be kept in each child’s history.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => onDeleteTask(task.id) }],
  );

  return (
    <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
            <Pressable onPress={close} style={styles.topAction}><Text style={[styles.cancelText, { color: theme.textMuted }]}>Close</Text></Pressable>
            <Text style={[styles.topTitle, { color: theme.text }]}>Task Library</Text>
            <View style={styles.topAction} />
          </View>

          <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.hero, { backgroundColor: taskHeroBackground }]}>
              <CategoryIcon backgroundColor={taskHeroBackground} kind="task" size={92} theme={theme} />
              <View style={styles.heroCopy}>
                <Text style={[styles.eyebrow, { color: theme.secondary }]}>{teacherMode ? 'CLASSROOM TASKS' : 'FAMILY TASKS'}</Text>
                <Text style={[styles.heroTitle, { color: theme.text }]}>Create Once. Assign Anywhere.</Text>
                <Text style={[styles.heroText, { color: theme.textMuted }]}>{`Choose a custom icon or photo, then assign each reusable task to any ${terms.profileLower}.`}</Text>
              </View>
            </View>

            {showComposer ? (
              <View style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
                <SectionHeader title={editingTaskId ? 'Edit assigned task' : 'Create a custom task'} subtitle="Assignments can be changed here." theme={theme} badge={editingTaskId ? 'EDIT' : 'NEW'} />
                <Field label="Task name" theme={theme}>
                  <TextInput onChangeText={setTitle} placeholder={teacherMode ? "Example: Show active listening" : "Example: Finish homework"} placeholderTextColor={theme.textMuted} style={[styles.input, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]} value={title} />
                </Field>
                <Field label="Task icon" theme={theme}><IconPicker buttonLabel="Choose a task icon" kind="task" onChange={setIcon} theme={theme} value={icon} /></Field>
                <Field label="Task value" theme={theme}>
                  <TextInput keyboardType="number-pad" maxLength={4} onChangeText={setAmount} placeholder="5" placeholderTextColor={theme.textMuted} style={[styles.input, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]} value={amount} />
                  <Text style={[styles.helper, { color: theme.textMuted }]}>{`The value automatically uses each assigned ${terms.profileLower} profile’s stars, marbles, points, or coins.`}</Text>
                </Field>
                <Field label="Frequency" theme={theme}>
                  <View style={styles.frequencyGrid}>
                    {FREQUENCIES.map((option) => {
                      const selected = option === frequency;
                      return (
                        <Pressable key={option} onPress={() => setFrequency(option)} style={[styles.frequencyCard, { backgroundColor: selected ? theme.secondarySoft : theme.surfaceMuted, borderColor: selected ? theme.secondary : theme.border }]}>
                          <Text style={[styles.frequencyTitle, { color: selected ? theme.secondary : theme.text }]}>{formatTaskFrequency(option)}</Text>
                          <Text style={[styles.frequencyCaption, { color: theme.textMuted }]}>{option === 'unlimited' ? 'Every tap awards value' : option === 'daily' ? 'Every day' : option === 'weekly' ? 'Selected weekdays' : 'Specific dates'}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </Field>
                <TaskSchedulePicker frequency={frequency} onDatesChange={setScheduleDates} onDaysChange={setScheduleDays} selectedDates={scheduleDates} selectedDays={scheduleDays} theme={theme} />
                <Field label="Description (optional)" theme={theme}>
                  <TextInput multiline onChangeText={setDescription} placeholder="Add instructions or encouragement" placeholderTextColor={theme.textMuted} style={[styles.input, styles.descriptionInput, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]} textAlignVertical="top" value={description} />
                </Field>
                <Field label={teacherMode ? "Assign to classes now (optional)" : "Assign now (optional)"} theme={theme}>
                  <ProfileChoices profiles={profiles} selectedIds={selectedProfileIds} onToggle={toggleSelectedProfile} theme={theme} />
                </Field>
                <Pressable onPress={saveCustomTask} style={({ pressed }) => [styles.saveButton, { backgroundColor: theme.secondary }, pressed && styles.pressed]}><Text style={styles.saveButtonText}>{editingTaskId ? 'Save Changes' : 'Save Task'}</Text></Pressable>
              </View>
            ) : null}

            <SectionHeader title="Your task library" subtitle={`${activeTasks.length} task${activeTasks.length === 1 ? '' : 's'} available`} theme={theme} action={<Pressable onPress={() => setShowComposer((current) => !current)} style={[styles.libraryAddButton, { borderColor: theme.secondary }]}><Text style={[styles.libraryAddText, { color: theme.secondary }]}>{showComposer ? 'Hide' : '＋ Add'}</Text></Pressable>} />
            <View style={styles.taskList}>
              {activeTasks.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}><CategoryIcon backgroundColor={theme.secondarySoft} kind="task" size={58} theme={theme} /><Text style={[styles.emptyTitle, { color: theme.text }]}>No Tasks Yet</Text><Text style={[styles.emptyText, { color: theme.textMuted }]}>Create a custom task or add samples below.</Text></View>
              ) : activeTasks.map((task) => (
                <View key={task.id} style={[styles.taskCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
                  <View style={styles.taskTopRow}>
                    <ItemIconView backgroundColor={theme.secondarySoft} icon={task.icon} size={46} theme={theme} />
                    <View style={styles.taskCopy}>
                      <Text style={[styles.taskTitle, { color: theme.text }]}>{task.title}</Text>
                      <Text numberOfLines={1} style={[styles.taskMeta, { color: theme.textMuted }]}>{`Value ${task.amount} · ${formatTaskFrequency(task.frequency)}`}</Text>
                      <Pressable accessibilityLabel={`Edit ${task.title}`} onPress={() => beginEdit(task)} style={[styles.quickEditButton,{alignSelf:'flex-start',backgroundColor:theme.primarySoft}]}><Text style={[styles.quickEditText,{color:theme.primary}]}>Edit</Text></Pressable>
                    </View>
                    <Pressable accessibilityLabel={`Delete ${task.title}`} onPress={() => confirmDelete(task)} style={[styles.deleteButton, { backgroundColor: theme.dangerSoft }]}><Text style={[styles.deleteText, { color: theme.danger }]}>×</Text></Pressable>
                  </View>
                  <View style={[styles.assignmentDivider, { backgroundColor: theme.border }]} />
                  <Text style={[styles.assignmentLabel, { color: theme.textMuted }]}>{teacherMode ? 'ASSIGN TO CLASSES' : 'ASSIGN TO PROFILES'}</Text>
                  <AssignmentChips profiles={profiles} assignedIds={task.assignedProfileIds} onToggle={(profileId, assigned) => onSetTaskAssigned(task.id, profileId, assigned)} theme={theme} />
                </View>
              ))}
            </View>

            <SectionHeader title="Sample tasks" subtitle="Add one or bring the full starter collection into your library." theme={theme} action={<Pressable onPress={addAllSamples} style={[styles.smallAction, { backgroundColor: theme.primarySoft }]}><Text style={[styles.smallActionText, { color: theme.primary }]}>Add All</Text></Pressable>} />
            <View style={styles.sampleGrid}>
              {sampleTasks.map((sample, index) => {
                const added = taskKeys.has(`${sample.title.toLowerCase()}::${sample.frequency}`);
                return (
                  <View key={`${sample.title}-${sample.frequency}`} style={[styles.sampleCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <ItemIconView icon={sample.icon} size={42} theme={theme} />
                    <View style={styles.sampleCopy}><Text numberOfLines={2} style={[styles.sampleTitle, { color: theme.text }]}>{sample.title}</Text><View style={styles.sampleValueRow}><Text style={[styles.sampleMeta, { color: theme.textMuted }]}>{formatTaskFrequency(sample.frequency)} · {sample.amount}</Text><Pressable onPress={() => setSampleEdit({ index, value: String(sample.amount) })} style={[styles.quickEditButton,{backgroundColor:theme.primarySoft}]}><Text style={[styles.quickEditText,{color:theme.primary}]}>Edit</Text></Pressable></View></View>
                    <Pressable disabled={added} onPress={() => addSample(index)} style={[styles.sampleAdd, { backgroundColor: added ? theme.surfaceMuted : theme.primary, borderColor: added ? theme.border : theme.primaryStrong, borderWidth:1 }]}><Text style={[styles.sampleAddText, { color: added ? theme.textMuted : '#FFFFFF' }]}>{added ? '✓ Added' : '+ Add'}</Text></Pressable>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        <Modal animationType="fade" onRequestClose={() => setSampleEdit(null)} transparent visible={Boolean(sampleEdit)}>
          <Pressable onPress={() => setSampleEdit(null)} style={styles.quickEditBackdrop}><Pressable onPress={(event) => event.stopPropagation()} style={[styles.quickEditCard,{backgroundColor:theme.surface,borderColor:theme.border}]}>
            <Text style={[styles.quickEditTitle,{color:theme.text}]}>Quick edit task value</Text>
            <TextInput keyboardType="number-pad" onChangeText={(value) => setSampleEdit((current) => current ? {...current,value} : current)} placeholder="Add value" placeholderTextColor={theme.textMuted} style={[styles.quickEditInput,{backgroundColor:theme.surfaceMuted,borderColor:theme.border,color:theme.text}]} value={sampleEdit?.value ?? ''} />
            <View style={styles.quickEditActions}><Pressable onPress={() => setSampleEdit(null)} style={[styles.quickEditCancel,{backgroundColor:theme.surfaceMuted}]}><Text style={[styles.quickEditCancelText,{color:theme.text}]}>Cancel</Text></Pressable><Pressable onPress={addEditedSample} style={[styles.quickEditAdd,{backgroundColor:theme.primary}]}><Text style={styles.quickEditAddText}>Add</Text></Pressable></View>
          </Pressable></Pressable>
        </Modal>
      </SafeAreaView>
    </Modal>
  );
}

function Field({ label, theme, children }: { label: string; theme: AppTheme; children: ReactNode }) {
  return <View style={styles.field}><Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>{children}</View>;
}

function SectionHeader({ title, subtitle, theme, badge, action }: { title: string; subtitle: string; theme: AppTheme; badge?: string; action?: ReactNode }) {
  return <View style={styles.sectionHeader}><View style={styles.sectionHeaderCopy}><Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text><Text style={[styles.sectionSubtitle, { color: theme.textMuted }]}>{subtitle}</Text></View>{badge ? <View style={[styles.newBadge, { backgroundColor: theme.primarySoft }]}><Text style={[styles.newBadgeText, { color: theme.primary }]}>{badge}</Text></View> : action}</View>;
}

function ProfileChoices({ profiles, selectedIds, onToggle, theme }: { profiles: ChildProfile[]; selectedIds: string[]; onToggle: (id: string) => void; theme: AppTheme }) {
  if (profiles.length === 0) return <Text style={[styles.helper, { color: theme.textMuted }]}>Create a profile before assigning tasks.</Text>;
  return <View style={styles.profileChoiceGrid}>{profiles.map((profile) => {
    const selected = selectedIds.includes(profile.id);
    const currency = CURRENCY_META[profile.currencyType];
    return <Pressable key={profile.id} onPress={() => onToggle(profile.id)} style={[styles.profileChoice, { backgroundColor: selected ? theme.primarySoft : theme.surfaceMuted, borderColor: selected ? theme.primary : theme.border }]}><ProfileAvatar avatar={profile.avatar} size={34} theme={theme} /><View style={styles.profileChoiceCopy}><Text style={[styles.profileChoiceName, { color: getProfileAccent(profile.colorKey) }]}>{profile.name}</Text><View style={styles.inlineCurrency}><CurrencyIcon color={currency.color} size={15} type={profile.currencyType} /><Text style={[styles.profileChoiceCurrency, { color: currency.color }]}>{currency.label}</Text></View></View><Text style={[styles.profileChoiceCheck, { color: selected ? theme.primary : theme.textMuted }]}>{selected ? '✓' : '+'}</Text></Pressable>;
  })}</View>;
}

function AssignmentChips({ profiles, assignedIds, onToggle, theme }: { profiles: ChildProfile[]; assignedIds: string[]; onToggle: (id: string, assigned: boolean) => void; theme: AppTheme }) {
  if (profiles.length === 0) return <Text style={[styles.helper, { color: theme.textMuted }]}>Create a profile before assigning tasks.</Text>;
  return <View style={styles.assignmentRow}>{profiles.map((profile) => {
    const assigned = assignedIds.includes(profile.id);
    return <Pressable key={profile.id} onPress={() => onToggle(profile.id, !assigned)} style={[styles.assignmentChip, { backgroundColor: assigned ? theme.primarySoft : theme.surfaceMuted, borderColor: assigned ? theme.primary : theme.border }]}><ProfileAvatar avatar={profile.avatar} size={29} theme={theme} /><Text numberOfLines={1} style={[styles.assignmentName, { color: getProfileAccent(profile.colorKey) }]}>{profile.name}</Text><Text style={[styles.assignmentCheck, { color: assigned ? theme.primary : theme.textMuted }]}>{assigned ? '✓' : '+'}</Text></Pressable>;
  })}</View>;
}

const styles = StyleSheet.create({
  sampleValueRow:{alignItems:'center',flexDirection:'row',flexWrap:'wrap',gap:6}, quickEditButton:{borderRadius:999,paddingHorizontal:7,paddingVertical:3}, quickEditText:{fontSize:10,fontWeight:'900'},
  quickEditBackdrop:{...StyleSheet.absoluteFillObject,alignItems:'center',backgroundColor:'rgba(7,28,29,0.48)',justifyContent:'center',padding:20}, quickEditCard:{borderRadius:22,borderWidth:1,maxWidth:360,padding:20,width:'100%'},
  quickEditTitle:{fontSize:18,fontWeight:'900',marginBottom:12,textAlign:'center'}, quickEditInput:{borderRadius:14,borderWidth:1,fontSize:18,fontWeight:'800',paddingHorizontal:14,paddingVertical:12,textAlign:'center'},
  quickEditActions:{flexDirection:'row',gap:10,marginTop:14}, quickEditCancel:{alignItems:'center',borderRadius:14,flex:1,paddingVertical:12}, quickEditCancelText:{fontSize:13,fontWeight:'900'}, quickEditAdd:{alignItems:'center',borderRadius:14,flex:1,paddingVertical:12}, quickEditAddText:{color:'#FFFFFF',fontSize:13,fontWeight:'900'},
  inlineCurrency: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  root: { flex: 1 }, flex: { flex: 1 },
  topBar: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 16 },
  topAction: { minWidth: 74, paddingVertical: 10 }, cancelText: { fontSize: 15, fontWeight: '800' }, addText: { fontSize: 15, fontWeight: '900', textAlign: 'right' }, topTitle: { fontSize: 16, fontWeight: '900' },
  content: { alignSelf: 'center', maxWidth: 760, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 54, width: '100%' },
  hero: { alignItems: 'center', borderRadius: 25, flexDirection: 'row', gap: 15, marginBottom: 22, padding: 19 }, heroIcon: { alignItems: 'center', borderRadius: 18, height: 58, justifyContent: 'center', width: 58 }, heroIconText: { color: '#FFFFFF', fontSize: 27, fontWeight: '900' }, heroCopy: { flex: 1 }, eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1.15 }, heroTitle: { fontSize: 21, fontWeight: '900', letterSpacing: -0.4, marginTop: 3 }, heroText: { fontSize: 13, lineHeight: 17, marginTop: 5 },
  composer: { borderRadius: 25, borderWidth: 1, marginBottom: 28, padding: 18, shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 2 },
  sectionHeader: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', marginBottom: 12, marginTop: 4 }, libraryAddButton:{alignItems:'center',borderRadius:999,borderWidth:1.5,justifyContent:'center',minHeight:34,paddingHorizontal:12,paddingVertical:6},
  libraryAddText:{fontSize:12,fontWeight:'900'},
  sectionHeaderCopy: { flex: 1, minWidth: 190 }, sectionTitle: { fontSize: 19, fontWeight: '900' }, sectionSubtitle: { fontSize: 12, marginTop: 3 }, newBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 }, newBadgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  field: { gap: 8, marginBottom: 18 }, fieldLabel: { fontSize: 14, fontWeight: '900' }, input: { borderRadius: 15, borderWidth: 1, fontSize: 15, minHeight: 52, paddingHorizontal: 14 }, descriptionInput: { minHeight: 94, paddingTop: 14 }, helper: { fontSize: 12, lineHeight: 14 },
  frequencyGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, frequencyCard: { borderRadius: 15, borderWidth: 1.5, minHeight: 67, padding: 11, width: '48%' }, frequencyTitle: { fontSize: 13, fontWeight: '900' }, frequencyCaption: { fontSize: 11, lineHeight: 12, marginTop: 3 },
  profileChoiceGrid: { gap: 8 }, profileChoice: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 10 }, profileChoiceCopy: { flex: 1 }, profileChoiceName: { fontSize: 13, fontWeight: '900' }, profileChoiceCurrency: { fontSize: 11, fontWeight: '800', marginTop: 2 }, profileChoiceCheck: { fontSize: 16, fontWeight: '900' },
  saveButton: { alignItems: 'center', borderRadius: 16, paddingVertical: 15 }, saveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' }, smallAction: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 }, smallActionText: { fontSize: 12, fontWeight: '900' },
  taskList: { gap: 8, marginBottom: 27 }, taskCard: { borderRadius: 18, borderWidth: 1, padding: 12, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.035, shadowRadius: 12, elevation: 1 }, taskTopRow: { alignItems: 'center', flexDirection: 'row', gap: 9 }, taskCopy: { flex: 1 }, taskTitle: { fontSize: 14, fontWeight: '900' }, taskMeta: { fontSize: 11, marginTop: 3 }, taskDescription: { fontSize: 11, lineHeight: 14, marginTop: 6 },taskCardActions:{alignItems:'center',gap:5}, deleteButton: { alignItems: 'center', borderRadius: 999, height: 31, justifyContent: 'center', width: 31 }, deleteText: { fontSize: 20, fontWeight: '700', lineHeight: 22, marginTop: -2 }, assignmentDivider: { height: StyleSheet.hairlineWidth, marginVertical: 9 }, assignmentLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginBottom: 7 }, assignmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, assignmentChip: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 7, maxWidth: '48%', paddingHorizontal: 8, paddingVertical: 6 }, assignmentName: { flexShrink: 1, fontSize: 12, fontWeight: '900' }, assignmentValue: { fontSize: 11, fontWeight: '900' }, assignmentCheck: { fontSize: 13, fontWeight: '900' },
  emptyCard: { alignItems: 'center', borderRadius: 22, borderWidth: 1, padding: 28 }, emptyEmoji: { fontSize: 32 }, emptyTitle: { fontSize: 15, fontWeight: '900', marginTop: 8 }, emptyText: { fontSize: 12, lineHeight: 16, marginTop: 4, textAlign: 'center' },
  sampleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, sampleCard: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexBasis: 250, flexDirection: 'row', flexGrow: 1, gap: 10, minHeight: 78, minWidth: 0, paddingHorizontal: 11, paddingVertical: 10 }, sampleCopy: { flex: 1, minWidth: 0 }, sampleTitle: { flexShrink: 1, fontSize: 13, fontWeight: '900', lineHeight: 16 }, sampleMeta: { fontSize: 11, lineHeight: 14, marginTop: 3 }, sampleAdd: { alignItems: 'center', borderRadius: 999, minWidth: 48, paddingHorizontal: 9, paddingVertical: 7 }, sampleAddText: { fontSize: 11, fontWeight: '900' }, pressed: { opacity: 0.72 },
});
