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
  Image,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AVATAR_KEYS } from '../data/avatarAssets';
import { useClassroomMode } from '../context/ClassroomModeContext';
import { CURRENCY_META, STORAGE_META } from '../data/currency';
import {
  PROFILE_COLOR_META,
  PROFILE_COLOR_OPTIONS,
  PROFILE_PATTERN_META,
  PROFILE_PATTERN_OPTIONS,
} from '../data/profileStyles';
import type { AppTheme } from '../theme';
import type {
  AvatarKey,
  CurrencyType,
  ProfileAvatar as ProfileAvatarValue,
  ProfileColorKey,
  ProfilePattern,
  StorageType,
} from '../types';
import { ProfileAvatar } from './ProfileAvatar';
import { ProfilePatternOverlay } from './ProfilePatternOverlay';
import { choosePhotoSource } from './PhotoSourcePicker';
import type { AppearancePreference } from './AppearanceModal';

type AddProfileModalProps = {
  visible: boolean;
  theme: AppTheme;
  onClose: () => void;
  onCreate: (input: {
    name: string;
    avatar: ProfileAvatarValue;
    colorKey: ProfileColorKey;
    pattern: ProfilePattern;
    currencyType: CurrencyType;
    storageType: StorageType;
  }) => string;
  onCreated: (profileId: string) => void;
  profile?: import('../types').ChildProfile | null;
  onUpdate?: (profileId: string, input: { name: string; avatar: ProfileAvatarValue; colorKey: ProfileColorKey; pattern: ProfilePattern; currencyType: CurrencyType; storageType: StorageType; }) => void;
  identityLocked?: boolean;
  appearancePreference?: AppearancePreference;
  onAppearanceChange?: (preference: AppearancePreference) => void;
};

const CURRENCY_OPTIONS: CurrencyType[] = ['stars', 'marbles', 'points', 'coins', 'dollars'];
const STORAGE_OPTIONS: StorageType[] = ['glassJar', 'piggyBank', 'treasureChest'];
const treasureChestSource = require('../../assets/icons/treasure-chest-storage.png');
const piggyBankStorageSource = require('../../assets/icons/piggy-bank-storage.png');

export function AddProfileModal({ visible, theme, onClose, onCreate, onCreated, profile = null, onUpdate, identityLocked = false, appearancePreference, onAppearanceChange }: AddProfileModalProps) {
  const { teacherMode, terms } = useClassroomMode();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<ProfileAvatarValue>({ type: 'preset', key: 'avatar-01' });
  const [colorKey, setColorKey] = useState<ProfileColorKey>('purple');
  const [pattern, setPattern] = useState<ProfilePattern>('solid');
  const [currencyType, setCurrencyType] = useState<CurrencyType>('stars');
  const [storageType, setStorageType] = useState<StorageType>('glassJar');
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setName(profile?.name ?? '');
    setAvatar(profile?.avatar ?? { type: 'preset', key: 'avatar-01' });
    setColorKey(profile?.colorKey ?? 'purple');
    setPattern(profile?.pattern ?? 'solid');
    setCurrencyType(profile?.currencyType ?? 'stars');
    setStorageType(profile?.storageType ?? 'glassJar');
  }, [visible, profile]);

  const choosePhoto = async () => {
    setIsPickingPhoto(true);
    try {
      const uri = await choosePhotoSource('profile');
      if (uri) setAvatar({ type: 'photo', uri });
    } catch (error) {
      console.warn(error);
      Alert.alert('Photo Unavailable', 'Kudos could not open the camera or photo library. Please try again or choose a default avatar.');
    } finally {
      setIsPickingPhoto(false);
    }
  };

  const save = () => {
    const trimmedName = name.trim();
    if (!trimmedName) return Alert.alert('Add A Name', `Enter the ${teacherMode ? 'class name' : "child’s first name"} before creating the profile.`);
    const input = { name: trimmedName, avatar, colorKey, pattern, currencyType, storageType };
    if (profile && onUpdate) onUpdate(profile.id, input);
    else { const id = onCreate(input); onCreated(id); }
    onClose();
  };

  const currency = CURRENCY_META[currencyType];
  const storage = STORAGE_META[storageType];
  const accent = PROFILE_COLOR_META[colorKey];

  return (
    <Modal animationType="fade" onRequestClose={onClose} presentationStyle="fullScreen" visible={visible}>
      <SafeAreaView edges={['left','right','bottom']} style={[styles.root, { backgroundColor: theme.background, paddingTop: insets.top + 8 }]}> 
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={[styles.topBar, { borderBottomColor: theme.border }]}> 
            <Pressable accessibilityRole="button" onPress={onClose} style={styles.topButton}><Text style={[styles.cancelText, { color: theme.textMuted }]}>Cancel</Text></Pressable>
            <Text style={[styles.topTitle, { color: profile ? theme.text : accent.color }]}>{profile ? (identityLocked ? 'Edit My Profile' : teacherMode ? 'Edit Class' : 'Edit Profile') : (teacherMode ? 'New Class' : 'New Profile')}</Text>
            <Pressable accessibilityRole="button" onPress={save} style={styles.topButton}><Text style={[styles.saveText, { color: theme.primary }]}>{profile ? 'Save' : 'Create'}</Text></Pressable>
          </View>

          <ScrollView alwaysBounceVertical={false} bounces={false} contentInsetAdjustmentBehavior="never" contentContainerStyle={styles.content} keyboardShouldPersistTaps="always" overScrollMode="never" showsVerticalScrollIndicator={false}>
            <View style={styles.heroCopy}>
              <Text style={[styles.eyebrow, { color: accent.color }]}>{profile ? (teacherMode ? 'EDIT CLASS PROFILE' : 'EDIT CHILD PROFILE') : (teacherMode ? 'NEW CLASS PROFILE' : 'NEW CHILD PROFILE')}</Text>
              <Text style={[styles.title, { color: theme.text }]}>{profile ? 'Update the profile details.' : (teacherMode ? 'Create a reward system for your class.' : 'Create a reward system that feels personal.')}</Text>
              <Text style={[styles.subtitle, { color: theme.textMuted }]}>{teacherMode ? 'Choose a class picture, accent style, earning currency, and the container that fills as the class completes tasks.' : 'Choose their picture, accent style, earning currency, and the container that fills when tasks are completed.'}</Text>
            </View>

            <View style={[styles.previewCard, { backgroundColor: accent.soft, borderColor: accent.color }]}> 
              <ProfilePatternOverlay color={accent.color} pattern={pattern} />
              <ProfileAvatar accessibilityLabel="Selected profile image" avatar={avatar} color={theme.surface} size={82} theme={theme} />
              <View style={styles.previewCopy}>
                <Text style={[styles.previewName, { color: accent.color }]}>{name.trim() || (teacherMode ? 'New Class' : 'New Profile')}</Text>
                {profile ? <Text style={[styles.previewMeta, { color: theme.textMuted }]}>0 {currency.label} · {storage.label}</Text> : null}
                {profile ? <View style={[styles.previewPill, { backgroundColor: theme.surface }]}><Text style={[styles.previewPillText, { color: accent.color }]}>{PROFILE_PATTERN_META[pattern].label} {accent.label.toLowerCase()} · {storage.label} fills as progress grows</Text></View> : null}
              </View>
            </View>

            {identityLocked && appearancePreference && onAppearanceChange ? (
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.text }]}>Appearance</Text>
                <Text style={[styles.labelHint, { color: theme.textMuted }]}>Choose light, dark, or follow this device.</Text>
                <View style={styles.appearanceOptions}>
                  {(['system', 'light', 'dark'] as const).map((option) => {
                    const selected = appearancePreference === option;
                    const label = option === 'system' ? 'Use Device' : option === 'light' ? 'Light' : 'Dark';
                    const icon = option === 'system' ? '◐' : option === 'light' ? '☀' : '☾';
                    return (
                      <Pressable
                        accessibilityLabel={`Use ${label.toLowerCase()} appearance`}
                        key={option}
                        onPress={() => onAppearanceChange(option)}
                        style={[
                          styles.appearanceOption,
                          { backgroundColor: selected ? theme.primarySoft : theme.surface, borderColor: selected ? theme.primary : theme.border },
                        ]}
                      >
                        <Text style={[styles.appearanceIcon, { color: selected ? theme.primary : theme.textMuted }]}>{icon}</Text>
                        <Text style={[styles.appearanceLabel, { color: selected ? theme.primary : theme.text }]}>{label}</Text>
                        <Text style={[styles.appearanceCheck, { color: selected ? theme.primary : 'transparent' }]}>✓</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <Field label={identityLocked ? 'Name (Parent Managed)' : teacherMode ? "Class name" : "First name"} theme={theme}>
              <TextInput accessibilityLabel={teacherMode ? "Class name" : "Profile first name"} autoCapitalize="words" editable={!identityLocked} maxLength={24} onChangeText={setName} placeholder={teacherMode ? "Example: Room 12" : "Enter a name"} placeholderTextColor={theme.textMuted} returnKeyType="done" style={[styles.input, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]} value={name} />
            </Field>

            <View style={styles.fieldGroup}>
              <View style={styles.labelRow}>
                <View style={styles.labelCopy}><Text style={[styles.label, { color: theme.text }]}>{identityLocked ? 'Profile picture (Parent Managed)' : teacherMode ? 'Class picture' : 'Profile picture'}</Text><Text style={[styles.labelHint, { color: theme.textMuted }]}>{teacherMode ? 'Choose a friendly class avatar or upload a classroom photo.' : 'Choose from an avatar or upload a photo.'}</Text></View>
                <Pressable disabled={identityLocked || isPickingPhoto} onPress={() => void choosePhoto()} style={({ pressed }) => [styles.photoButton, { backgroundColor: theme.primarySoft }, pressed && styles.pressed]}><Text style={[styles.photoButtonText, { color: theme.primary }]}>{isPickingPhoto ? 'Opening…' : '＋ Add photo'}</Text></Pressable>
              </View>
              <View style={styles.avatarGrid}>
                {AVATAR_KEYS.map((key) => {
                  const selected = avatar.type === 'preset' && avatar.key === key;
                  return <Pressable accessibilityLabel={`Choose default avatar ${key.replace('avatar-', '')}`} disabled={identityLocked} key={key} onPress={() => setAvatar({ type: 'preset', key: key as AvatarKey })} style={[styles.avatarOption, { backgroundColor: selected ? accent.soft : theme.surface, borderColor: selected ? accent.color : theme.border }]}><ProfileAvatar avatar={{ type: 'preset', key }} size={50} theme={theme} /></Pressable>;
                })}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Accent Color</Text>
              <Text style={[styles.labelHint, { color: theme.textMuted }]}>Pick One Of Eight Colors For Profile Cards, Progress, And Highlights.</Text>
              <View style={styles.colorGrid}>
                {PROFILE_COLOR_OPTIONS.map((option) => {
                  const meta = PROFILE_COLOR_META[option];
                  const selected = option === colorKey;
                  return (
                    <Pressable accessibilityLabel={`Choose ${meta.label} profile color`} key={option} onPress={() => setColorKey(option)} style={[styles.colorOption, { backgroundColor: selected ? meta.soft : theme.surface, borderColor: selected ? meta.color : theme.border }]}> 
                      <View style={[styles.colorSwatch, { backgroundColor: meta.color }]}>{selected ? <Text style={styles.check}>✓</Text> : null}</View>
                      <Text style={[styles.colorLabel, { color: selected ? meta.color : theme.text }]}>{meta.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Accent Pattern</Text>
              <Text style={[styles.labelHint, { color: theme.textMuted }]}>Use A Solid Color, Playful Stripes, Or Polka Dots.</Text>
              <View style={styles.patternGrid}>
                {PROFILE_PATTERN_OPTIONS.map((option) => {
                  const selected = option === pattern;
                  return (
                    <Pressable key={option} onPress={() => setPattern(option)} style={[styles.patternOption, { backgroundColor: accent.soft, borderColor: selected ? accent.color : theme.border }]}> 
                      <ProfilePatternOverlay color={accent.color} pattern={option} />
                      <View style={[styles.patternCheck, { backgroundColor: selected ? accent.color : theme.surface }]}><Text style={[styles.patternCheckText, { color: selected ? '#FFFFFF' : theme.textMuted }]}>{selected ? '✓' : '○'}</Text></View>
                      <Text style={[styles.patternTitle, { color: theme.text }]}>{PROFILE_PATTERN_META[option].label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Earning Currency</Text>
              <Text style={[styles.labelHint, { color: theme.textMuted }]}>{teacherMode ? 'Every task for this class awards this type of currency.' : 'Every task for this profile awards this type of currency.'}</Text>
              <View style={styles.optionGrid}>
                {CURRENCY_OPTIONS.map((option) => {
                  const meta = CURRENCY_META[option];
                  const selected = option === currencyType;
                  return <Pressable key={option} onPress={() => setCurrencyType(option)} style={[styles.currencyOption, { backgroundColor: selected ? theme.rewardSoft : theme.surface, borderColor: selected ? theme.reward : theme.border }]}><CurrencyIcon color={meta.color} size={25} type={option} /><Text style={[styles.optionTitle, { color: theme.text }]}>{meta.label}</Text>{selected ? <Text style={[styles.selectedCheck, { color: theme.reward }]}>✓</Text> : null}</Pressable>;
                })}
              </View>
            </View>

            <View style={styles.fieldGroup}>
              <Text style={[styles.label, { color: theme.text }]}>Storage Container</Text>
              <Text style={[styles.labelHint, { color: theme.textMuted }]}>{`This animated container appears at the top of the ${terms.profileLower} profile.`}</Text>
              <View style={styles.storageList}>
                {STORAGE_OPTIONS.map((option) => {
                  const meta = STORAGE_META[option];
                  const selected = option === storageType;
                  return <Pressable key={option} onPress={() => setStorageType(option)} style={[styles.storageOption, { backgroundColor: selected ? accent.soft : theme.surface, borderColor: selected ? accent.color : theme.border }]}><View style={[styles.storageIconWrap, { backgroundColor: theme.surface }]}>{option==='treasureChest'
  ? <Image resizeMode="contain" source={treasureChestSource} style={styles.treasureStorageImage}/>
  : option==='piggyBank'
    ? <Image resizeMode="contain" source={piggyBankStorageSource} style={styles.pigStorageImage}/>
    : <Text style={[styles.storageIcon, option==='glassJar' && styles.glassJarStorageIcon, { color: accent.color }]}>{meta.icon}</Text>}</View><View style={styles.storageCopy}><Text style={[styles.optionTitle, { color: theme.text }]}>{meta.label}</Text><Text style={[styles.storageDescription, { color: theme.textMuted }]}>{meta.description}</Text></View>{selected ? <Text style={[styles.selectedCheck, { color: accent.color }]}>✓</Text> : null}</Pressable>;
                })}
              </View>
            </View>

            <Pressable onPress={save} style={({ pressed }) => [styles.createButton, { backgroundColor: accent.color }, pressed && styles.pressed]}><Text style={styles.createButtonText}>{teacherMode ? 'Create class' : 'Create profile'}</Text></Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

function Field({ label, theme, children }: { label: string; theme: AppTheme; children: ReactNode }) {
  return <View style={styles.fieldGroup}><Text style={[styles.label, { color: theme.text }]}>{label}</Text>{children}</View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 }, flex: { flex: 1 },
  topBar: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 62, paddingHorizontal: 16, paddingVertical: 6 },
  topButton: { minWidth: 70, paddingVertical: 10 }, cancelText: { fontSize: 15, fontWeight: '700' }, saveText: { fontSize: 15, fontWeight: '900', textAlign: 'right' }, topTitle: { fontSize: 16, fontWeight: '900' },
  content: { alignSelf: 'center', maxWidth: 660, paddingBottom: 44, paddingHorizontal: 20, paddingTop: 24, width: '100%' },
  heroCopy: { gap: 7, marginBottom: 20 }, eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1.3 }, title: { fontSize: 29, fontWeight: '900', letterSpacing: -0.8, lineHeight: 35 }, subtitle: { fontSize: 15, lineHeight: 21 },
  previewCard: { alignItems: 'center', borderRadius: 24, borderWidth: 1.5, flexDirection: 'row', gap: 16, marginBottom: 26, overflow: 'hidden', padding: 17 }, previewCopy: { flex: 1, zIndex: 1 }, previewName: { fontSize: 20, fontWeight: '900' }, previewMeta: { fontSize: 13, marginTop: 4 }, previewPill: { alignSelf: 'flex-start', borderRadius: 999, marginTop: 9, paddingHorizontal: 9, paddingVertical: 6 }, previewPillText: { fontSize: 12, fontWeight: '900' },
  appearanceOptions: { flexDirection: 'row', gap: 8 }, appearanceOption: { alignItems: 'center', borderRadius: 16, borderWidth: 1.5, flex: 1, gap: 4, justifyContent: 'center', minHeight: 72, paddingHorizontal: 7, paddingVertical: 10 }, appearanceIcon: { fontSize: 20, fontWeight: '900' }, appearanceLabel: { fontSize: 11, fontWeight: '900', textAlign: 'center' }, appearanceCheck: { fontSize: 12, fontWeight: '900', position: 'absolute', right: 8, top: 6 },
  fieldGroup: { gap: 9, marginBottom: 25 }, label: { fontSize: 14, fontWeight: '900' }, labelHint: { fontSize: 12, lineHeight: 15, marginTop: -4 }, input: { borderRadius: 16, borderWidth: 1, fontSize: 15, minHeight: 54, paddingHorizontal: 15 },
  labelRow: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between' }, labelCopy: { flex: 1, gap: 9 }, photoButton: { borderRadius: 999, paddingHorizontal: 11, paddingVertical: 9 }, photoButtonText: { fontSize: 12, fontWeight: '900' },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, avatarOption: { alignItems: 'center', borderRadius: 17, borderWidth: 1.5, height: 64, justifyContent: 'center', width: 64 },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, colorOption: { alignItems: 'center', borderRadius: 15, borderWidth: 1.5, flexDirection: 'row', gap: 7, minWidth: '23%', padding: 8 }, colorSwatch: { alignItems: 'center', borderRadius: 999, height: 25, justifyContent: 'center', width: 25 }, colorLabel: { fontSize: 12, fontWeight: '900' }, check: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
  patternGrid: { flexDirection: 'row', gap: 8 }, patternOption: { borderRadius: 17, borderWidth: 1.5, flex: 1, height: 82, justifyContent: 'flex-end', overflow: 'hidden', padding: 10 }, patternCheck: { alignItems: 'center', borderRadius: 999, height: 22, justifyContent: 'center', position: 'absolute', right: 8, top: 8, width: 22 }, patternCheckText: { fontSize: 13, fontWeight: '900' }, patternTitle: { fontSize: 12, fontWeight: '900', zIndex: 1 },
  optionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 }, currencyOption: { alignItems: 'center', borderRadius: 17, borderWidth: 1.5, flexDirection: 'row', gap: 7, minWidth: '47%', padding: 13 }, currencyIcon: { fontSize: 20, fontWeight: '900' }, optionTitle: { flex: 1, fontSize: 14, fontWeight: '900', textTransform: 'capitalize' }, selectedCheck: { fontSize: 15, fontWeight: '900' },
  storageList: { gap: 8 }, storageOption: { alignItems: 'center', borderRadius: 18, borderWidth: 1.5, flexDirection: 'row', gap: 12, minHeight: 72, paddingHorizontal: 12, paddingVertical: 9 }, storageIconWrap: { alignItems: 'center', borderRadius: 14, flexShrink: 0, height: 54, justifyContent: 'center', overflow: 'hidden', width: 58 }, storageIcon: { fontSize: 23, fontWeight: '900' }, glassJarStorageIcon:{fontSize:42,lineHeight:48}, treasureStorageImage: { height: 50, width: 58 }, pigStorageImage: { height: 54, width: 60 }, storageCopy: { flex: 1 }, storageDescription: { fontSize: 12, lineHeight: 14, marginTop: 3 },
  createButton: { alignItems: 'center', borderRadius: 18, marginTop: 3, paddingVertical: 17 }, createButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' }, pressed: { opacity: 0.72 },
});
