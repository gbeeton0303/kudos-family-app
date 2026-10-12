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
import { useClassroomMode } from '../context/ClassroomModeContext';
import { CLASSROOM_SAMPLE_REWARDS } from '../data/classroomSamples';
import { CURRENCY_META } from '../data/currency';
import { SAMPLE_REWARDS } from '../data/sampleRewards';
import { getProfileAccent } from '../data/profileStyles';
import type { AppTheme } from '../theme';
import type { ChildProfile, ChildReward, ItemIcon, NewRewardInput } from '../types';
import { IconPicker } from './IconPicker';
import { CurrencyIcon } from './CurrencyIcon';
import { CategoryIcon } from './CategoryIcon';
import { ItemIconView } from './ItemIconView';
import { ProfileAvatar } from './ProfileAvatar';

type RewardLibraryModalProps = {
  visible: boolean;
  profiles: ChildProfile[];
  rewards: ChildReward[];
  onClose: () => void;
  onAddReward: (input: NewRewardInput) => string;
  onUpdateReward: (rewardId: string, input: NewRewardInput) => void;
  onDeleteReward: (rewardId: string) => void;
  onSetRewardAssigned: (rewardId: string, profileId: string, assigned: boolean) => void;
  theme: AppTheme;
};

export function RewardLibraryModal({ visible, profiles, rewards, onClose, onAddReward, onUpdateReward, onDeleteReward, onSetRewardAssigned, theme }: RewardLibraryModalProps) {
  const { teacherMode, terms } = useClassroomMode();
  const sampleRewards = teacherMode ? CLASSROOM_SAMPLE_REWARDS : SAMPLE_REWARDS;
  const [showComposer, setShowComposer] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [title, setTitle] = useState('');
  const [cost, setCost] = useState('25');
  const [icon, setIcon] = useState<ItemIcon>({ type: 'preset', value: '🎁' });
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>([]);
  const [sampleEdit, setSampleEdit] = useState<{ index: number; value: string } | null>(null);
  const [editingRewardId, setEditingRewardId] = useState<string | null>(null);
  const visibleRewards = useMemo(() => rewards.filter((reward) => !reward.archivedAt), [rewards]);

  const rewardKeys = useMemo(() => new Set(visibleRewards.map((reward) => `${reward.title.trim().toLowerCase()}::${reward.cost}`)), [visibleRewards]);

  const resetComposer = () => {
    setTitle('');
    setCost('25');
    setIcon({ type: 'preset', value: '🎁' });
    setSelectedProfileIds([]);
    setEditingRewardId(null);
    setShowComposer(false);
  };
  const close = () => { resetComposer(); onClose(); };
  const toggleSelectedProfile = (profileId: string) => setSelectedProfileIds((current) => current.includes(profileId) ? current.filter((id) => id !== profileId) : [...current, profileId]);

  const saveCustomReward = () => {
    const parsed = Number.parseInt(cost, 10);
    if (!title.trim()) return Alert.alert('Reward Name Required', 'Enter a name for the reward before saving.');
    if (!Number.isFinite(parsed) || parsed < 1) return Alert.alert('Reward Value Required', 'Reward value must be at least 1.');
    const input = { title, cost: parsed, icon, profileIds: selectedProfileIds };
    if (editingRewardId) onUpdateReward(editingRewardId, input);
    else onAddReward(input);
    resetComposer();
  };

  const editReward = (reward: ChildReward) => {
    setEditingRewardId(reward.id);
    setTitle(reward.title);
    setCost(String(reward.cost));
    setIcon(reward.icon);
    setSelectedProfileIds(reward.assignedProfileIds);
    setShowComposer(true);
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  };

  const addSample = (index: number, overrideCost?: number) => {
    const sample = sampleRewards[index];
    if (sample) onAddReward({ ...sample, cost: overrideCost ?? sample.cost, profileIds: [] });
  };
  const addEditedSample = () => {
    if (!sampleEdit) return;
    const parsed = Number.parseInt(sampleEdit.value, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return Alert.alert('Value Required', 'Enter a value of at least 1.');
    addSample(sampleEdit.index, parsed);
    setSampleEdit(null);
  };

  const addAllSamples = () => {
    const missing = sampleRewards.filter((sample) => !rewardKeys.has(`${sample.title.toLowerCase()}::${sample.cost}`));
    missing.forEach((sample) => onAddReward({ ...sample, profileIds: [] }));
    if (missing.length === 0) Alert.alert('Samples Already Added', 'Every sample reward is already in your reward library.');
  };

  const confirmDelete = (reward: ChildReward) => Alert.alert(
    `Delete “${reward.title}”?`,
    'This removes the reward and its profile assignments. Past redemptions and points spent remain in the profile history.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => onDeleteReward(reward.id) }],
  );

  return (
    <Modal animationType="slide" onRequestClose={close} presentationStyle="pageSheet" visible={visible}>
      <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
            <Pressable onPress={close} style={styles.topAction}><Text style={[styles.cancelText, { color: theme.textMuted }]}>Close</Text></Pressable>
            <Text style={[styles.topTitle, { color: theme.text }]}>Reward Library</Text>
            <View style={styles.topAction} />
          </View>

          <ScrollView ref={scrollRef} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={[styles.hero, { backgroundColor: theme.rewardSoft }]}>
              <CategoryIcon backgroundColor={theme.rewardSoft} kind="reward" size={82} theme={theme} />
              <View style={styles.heroCopy}>
                <Text style={[styles.eyebrow, { color: theme.reward }]}>{teacherMode ? 'CLASSROOM REWARDS' : 'FAMILY REWARDS'}</Text>
                <Text style={[styles.heroTitle, { color: theme.text }]}>Rewards That Inspire Progress.</Text>
                <Text style={[styles.heroText, { color: theme.textMuted }]}>{`Create reusable reward ideas, choose an icon or photo, and assign each reward to any ${terms.profileLower}.`}</Text>
              </View>
            </View>

            {showComposer ? (
              <View style={[styles.composer, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
                <SectionHeader title={editingRewardId ? "Edit reward" : "Create a custom reward"} subtitle="Change the name, icon, value, or assignments." theme={theme} badge={editingRewardId ? "EDIT" : "NEW"} />
                <Field label="Reward name" theme={theme}>
                  <TextInput onChangeText={setTitle} placeholder={teacherMode ? "Example: Extra recess" : "Example: Choose family movie"} placeholderTextColor={theme.textMuted} style={[styles.input, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]} value={title} />
                </Field>
                <Field label="Reward icon" theme={theme}><IconPicker kind="reward" onChange={setIcon} theme={theme} value={icon} /></Field>
                <Field label="Reward value" theme={theme}>
                  <TextInput keyboardType="number-pad" maxLength={5} onChangeText={setCost} placeholder="25" placeholderTextColor={theme.textMuted} style={[styles.input, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]} value={cost} />
                  <Text style={[styles.helper, { color: theme.textMuted }]}>{`Each ${terms.profileLower} profile sees this value in its own selected currency.`}</Text>
                </Field>
                <Field label={teacherMode ? "Assign to classes now (optional)" : "Assign now (optional)"} theme={theme}><ProfileChoices profiles={profiles} selectedIds={selectedProfileIds} onToggle={toggleSelectedProfile} theme={theme} /></Field>
                <Pressable onPress={saveCustomReward} style={({ pressed }) => [styles.saveButton, { backgroundColor: theme.reward }, pressed && styles.pressed]}><Text style={styles.saveButtonText}>{editingRewardId ? 'Save Changes' : 'Save Reward'}</Text></Pressable>
              </View>
            ) : null}

            <SectionHeader title="Your reward library" subtitle={`${visibleRewards.length} reward${visibleRewards.length === 1 ? '' : 's'} available`} theme={theme} action={<Pressable onPress={() => setShowComposer((current) => !current)} style={[styles.libraryAddButton, { borderColor: theme.reward }]}><Text style={[styles.libraryAddText, { color: theme.reward }]}>{showComposer ? 'Hide' : '＋ Add'}</Text></Pressable>} />
            <View style={styles.rewardList}>
              {visibleRewards.length === 0 ? (
                <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}><Text style={[styles.emptyTitle, { color: theme.text }]}>No Rewards Yet</Text><Text style={[styles.emptyText, { color: theme.textMuted }]}>Create a custom reward or add samples below.</Text></View>
              ) : visibleRewards.map((reward) => (
                <View key={reward.id} style={[styles.rewardCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
                  <View style={styles.rewardTopRow}>
                    <ItemIconView backgroundColor={theme.rewardSoft} icon={reward.icon} size={48} theme={theme} />
                    <View style={styles.rewardCopy}>
                      <Text style={[styles.rewardTitle, { color: theme.text }]}>{reward.title}</Text>
                      <Text style={[styles.rewardMeta, { color: theme.textMuted }]}>Value {reward.cost} · {reward.assignedProfileIds.length} assigned</Text>
                      <Pressable accessibilityLabel={`Edit ${reward.title}`} onPress={() => editReward(reward)} style={[styles.rewardEditButton,{backgroundColor:theme.rewardSoft}]}><Text style={[styles.rewardEditText,{color:theme.reward}]}>✎ Edit</Text></Pressable>
                    </View>
                    <Pressable accessibilityLabel={`Delete ${reward.title}`} onPress={() => confirmDelete(reward)} style={[styles.deleteButton, { backgroundColor: theme.dangerSoft }]}><Text style={[styles.deleteText, { color: theme.danger }]}>×</Text></Pressable>
                  </View>
                  <View style={[styles.assignmentDivider, { backgroundColor: theme.border }]} />
                  <Text style={[styles.assignmentLabel, { color: theme.textMuted }]}>{teacherMode ? 'ASSIGN TO CLASSES' : 'ASSIGN TO PROFILES'}</Text>
                  <AssignmentChips profiles={profiles} assignedIds={reward.assignedProfileIds} value={reward.cost} onToggle={(profileId, assigned) => onSetRewardAssigned(reward.id, profileId, assigned)} theme={theme} />
                </View>
              ))}
            </View>

            <SectionHeader title="Sample rewards" subtitle="Add one or bring the full starter collection into your library." theme={theme} action={<Pressable onPress={addAllSamples} style={[styles.smallAction, { backgroundColor: theme.primarySoft }]}><Text style={[styles.smallActionText, { color: theme.primary }]}>Add All</Text></Pressable>} />
            <View style={styles.sampleGrid}>
              {sampleRewards.map((sample, index) => {
                const added = rewardKeys.has(`${sample.title.toLowerCase()}::${sample.cost}`);
                return (
                  <View key={`${sample.title}-${sample.cost}`} style={[styles.sampleCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <ItemIconView icon={sample.icon} size={42} theme={theme} />
                    <View style={styles.sampleCopy}><Text numberOfLines={2} style={[styles.sampleTitle, { color: theme.text }]}>{sample.title}</Text><View style={styles.sampleValueRow}><Text style={[styles.sampleMeta, { color: theme.textMuted }]}>Value {sample.cost}</Text><Pressable onPress={() => setSampleEdit({ index, value: String(sample.cost) })} style={[styles.quickEditButton,{backgroundColor:theme.rewardSoft}]}><Text style={[styles.quickEditText,{color:theme.reward}]}>Edit</Text></Pressable></View></View>
                    <Pressable disabled={added} onPress={() => addSample(index)} style={[styles.sampleAdd, { backgroundColor: added ? theme.successSoft : theme.rewardSoft }]}><Text style={[styles.sampleAddText, { color: added ? theme.success : theme.reward }]}>{added ? 'Added' : 'Add'}</Text></Pressable>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
        <Modal animationType="fade" onRequestClose={() => setSampleEdit(null)} transparent visible={Boolean(sampleEdit)}>
          <Pressable onPress={() => setSampleEdit(null)} style={styles.quickEditBackdrop}><Pressable onPress={(event) => event.stopPropagation()} style={[styles.quickEditCard,{backgroundColor:theme.surface,borderColor:theme.border}]}>
            <Text style={[styles.quickEditTitle,{color:theme.text}]}>Quick edit reward value</Text>
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
  if (profiles.length === 0) return <Text style={[styles.helper, { color: theme.textMuted }]}>Create a profile before assigning rewards.</Text>;
  return <View style={styles.profileChoiceGrid}>{profiles.map((profile) => {
    const selected = selectedIds.includes(profile.id);
    const currency = CURRENCY_META[profile.currencyType];
    return <Pressable key={profile.id} onPress={() => onToggle(profile.id)} style={[styles.profileChoice, { backgroundColor: selected ? theme.primarySoft : theme.surfaceMuted, borderColor: selected ? theme.primary : theme.border }]}><ProfileAvatar avatar={profile.avatar} size={34} theme={theme} /><View style={styles.profileChoiceCopy}><Text style={[styles.profileChoiceName, { color: getProfileAccent(profile.colorKey) }]}>{profile.name}</Text><View style={styles.inlineCurrency}><CurrencyIcon color={currency.color} size={15} type={profile.currencyType} /><Text style={[styles.profileChoiceCurrency, { color: currency.color }]}>{currency.label}</Text></View></View><Text style={[styles.profileChoiceCheck, { color: selected ? theme.primary : theme.textMuted }]}>{selected ? '✓' : '+'}</Text></Pressable>;
  })}</View>;
}

function AssignmentChips({ profiles, assignedIds, value, onToggle, theme }: { profiles: ChildProfile[]; assignedIds: string[]; value: number; onToggle: (id: string, assigned: boolean) => void; theme: AppTheme }) {
  if (profiles.length === 0) return <Text style={[styles.helper, { color: theme.textMuted }]}>Create a profile before assigning rewards.</Text>;
  return <View style={styles.assignmentRow}>{profiles.map((profile) => {
    const assigned = assignedIds.includes(profile.id);
    const currency = CURRENCY_META[profile.currencyType];
    return <Pressable key={profile.id} onPress={() => onToggle(profile.id, !assigned)} style={[styles.assignmentChip, { backgroundColor: assigned ? theme.primarySoft : theme.surfaceMuted, borderColor: assigned ? theme.primary : theme.border }]}><ProfileAvatar avatar={profile.avatar} size={27} theme={theme} /><Text style={[styles.assignmentName, { color: getProfileAccent(profile.colorKey) }]}>{profile.name}</Text><View style={styles.inlineCurrency}><CurrencyIcon color={currency.color} size={14} type={profile.currencyType} /><Text style={[styles.assignmentValue, { color: currency.color }]}>{value}</Text></View><Text style={[styles.assignmentCheck, { color: assigned ? theme.primary : theme.textMuted }]}>{assigned ? '✓' : '+'}</Text></Pressable>;
  })}</View>;
}

const styles = StyleSheet.create({
  sampleValueRow:{alignItems:'center',flexDirection:'row',gap:6}, quickEditButton:{borderRadius:999,paddingHorizontal:7,paddingVertical:3}, quickEditText:{fontSize:10,fontWeight:'900'},
  quickEditBackdrop:{...StyleSheet.absoluteFillObject,alignItems:'center',backgroundColor:'rgba(7,28,29,0.48)',justifyContent:'center',padding:20}, quickEditCard:{borderRadius:22,borderWidth:1,maxWidth:360,padding:20,width:'100%'},
  quickEditTitle:{fontSize:18,fontWeight:'900',marginBottom:12,textAlign:'center'}, quickEditInput:{borderRadius:14,borderWidth:1,fontSize:18,fontWeight:'800',paddingHorizontal:14,paddingVertical:12,textAlign:'center'},
  quickEditActions:{flexDirection:'row',gap:10,marginTop:14}, quickEditCancel:{alignItems:'center',borderRadius:14,flex:1,paddingVertical:12}, quickEditCancelText:{fontSize:13,fontWeight:'900'}, quickEditAdd:{alignItems:'center',borderRadius:14,flex:1,paddingVertical:12}, quickEditAddText:{color:'#FFFFFF',fontSize:13,fontWeight:'900'},
  inlineCurrency: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  root: { flex: 1 }, flex: { flex: 1 },
  topBar: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 16 }, topAction: { minWidth: 74, paddingVertical: 10 }, cancelText: { fontSize: 15, fontWeight: '800' }, addText: { fontSize: 15, fontWeight: '900', textAlign: 'right' }, topTitle: { fontSize: 16, fontWeight: '900' },
  content: { alignSelf: 'center', maxWidth: 760, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 54, width: '100%' }, hero: { alignItems: 'center', borderRadius: 25, flexDirection: 'row', gap: 15, marginBottom: 22, padding: 19 }, heroIcon: { alignItems: 'center', borderRadius: 18, height: 58, justifyContent: 'center', width: 58 }, heroIconText: { color: '#FFFFFF', fontSize: 27, fontWeight: '900' }, heroCopy: { flex: 1 }, eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1.15 }, heroTitle: { fontSize: 21, fontWeight: '900', letterSpacing: -0.4, marginTop: 3 }, heroText: { fontSize: 13, lineHeight: 17, marginTop: 5 },
  composer: { borderRadius: 25, borderWidth: 1, marginBottom: 28, padding: 18, shadowOffset: { width: 0, height: 9 }, shadowOpacity: 0.05, shadowRadius: 20, elevation: 2 }, sectionHeader: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between', marginBottom: 12, marginTop: 4 }, libraryAddButton:{alignItems:'center',borderRadius:999,borderWidth:1.5,justifyContent:'center',minHeight:34,paddingHorizontal:12,paddingVertical:6},
  libraryAddText:{fontSize:12,fontWeight:'900'},
  sectionHeaderCopy: { flex: 1, minWidth: 190 }, sectionTitle: { fontSize: 19, fontWeight: '900' }, sectionSubtitle: { fontSize: 12, marginTop: 3 }, newBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 }, newBadgeText: { fontSize: 11, fontWeight: '900', letterSpacing: 0.7 },
  field: { gap: 8, marginBottom: 18 }, fieldLabel: { fontSize: 14, fontWeight: '900' }, input: { borderRadius: 15, borderWidth: 1, fontSize: 15, minHeight: 52, paddingHorizontal: 14 }, helper: { fontSize: 12, lineHeight: 14 },
  profileChoiceGrid: { gap: 8 }, profileChoice: { alignItems: 'center', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 10 }, profileChoiceCopy: { flex: 1 }, profileChoiceName: { fontSize: 13, fontWeight: '900' }, profileChoiceCurrency: { fontSize: 11, fontWeight: '800', marginTop: 2 }, profileChoiceCheck: { fontSize: 16, fontWeight: '900' }, saveButton: { alignItems: 'center', borderRadius: 16, paddingVertical: 15 }, saveButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  rewardList: { gap: 11, marginBottom: 27 }, rewardCard: { borderRadius: 21, borderWidth: 1, padding: 15, shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.035, shadowRadius: 12, elevation: 1 }, rewardTopRow: { alignItems: 'center', flexDirection: 'row', gap: 10 }, rewardCopy: { flex: 1 }, rewardTitle: { fontSize: 14, fontWeight: '900' }, rewardMeta: { fontSize: 12, marginTop: 4 },rewardEditButton:{alignItems:'center',alignSelf:'flex-start',borderRadius:999,marginTop:6,paddingHorizontal:8,paddingVertical:4},rewardEditText:{fontSize:10,fontWeight:'900'}, deleteButton: { alignItems: 'center', borderRadius: 999, height: 31, justifyContent: 'center', width: 31 }, deleteText: { fontSize: 20, fontWeight: '700', lineHeight: 22, marginTop: -2 }, assignmentDivider: { height: StyleSheet.hairlineWidth, marginVertical: 12 }, assignmentLabel: { fontSize: 11, fontWeight: '900', letterSpacing: 0.9, marginBottom: 8 }, assignmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, assignmentChip: { alignItems: 'center', borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 7, paddingVertical: 6 }, assignmentName: { fontSize: 12, fontWeight: '900' }, assignmentValue: { fontSize: 11, fontWeight: '900' }, assignmentCheck: { fontSize: 13, fontWeight: '900' },
  emptyCard: { alignItems: 'center', borderRadius: 22, borderWidth: 1, justifyContent: 'center', minHeight: 112, padding: 28 }, emptyTitle: { fontSize: 15, fontWeight: '900', textAlign: 'center' }, emptyText: { fontSize: 12, lineHeight: 16, marginTop: 4, textAlign: 'center' }, smallAction: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 8 }, smallActionText: { fontSize: 12, fontWeight: '900' },
  sampleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, sampleCard: { alignItems: 'center', borderRadius: 18, borderWidth: 1, flexBasis: 250, flexDirection: 'row', flexGrow: 1, gap: 10, minHeight: 78, minWidth: 0, paddingHorizontal: 11, paddingVertical: 10 }, sampleCopy: { flex: 1, minWidth: 0 }, sampleTitle: { flexShrink: 1, fontSize: 13, fontWeight: '900', lineHeight: 16 }, sampleMeta: { fontSize: 11, lineHeight: 14, marginTop: 3 }, sampleAdd: { alignItems: 'center', borderRadius: 999, minWidth: 48, paddingHorizontal: 9, paddingVertical: 7 }, sampleAddText: { fontSize: 11, fontWeight: '900' }, pressed: { opacity: 0.72 },
});
