import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as Print from 'expo-print';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ProfileAvatar } from '../components/ProfileAvatar';
import { getProfileAccent } from '../data/profileStyles';
import type { AppTheme } from '../theme';
import type { ChildProfile } from '../types';
import { CHORE_ICON_PRINT_DATA } from '../data/choreIconPrintData';
import { AVATAR_PRINT_DATA } from '../data/avatarPrintData';

type RotationMode = 'daily-weekdays' | 'daily-all' | 'weekly' | 'weekly-multiple' | 'manual';
type DisplayStyle = 'standard' | 'large-icon';
type BorderTheme = 'none' | 'red' | 'purple' | 'blue' | 'gold';
type ChoreIcon = { type: 'preset'; value: string } | { type: 'photo'; uri: string };
type Chore = { id: string; name: string; icon: ChoreIcon };
const presetIconValue = (icon: ChoreIcon) => icon.type === 'preset' ? icon.value : '';
type AssignmentMap = Record<string, string>;
type ChoreChartSnapshot = {
  chores: Chore[]; selectedProfileIds: string[]; rotationMode: RotationMode; choresPerChild: number;
  displayStyle: DisplayStyle; borderTheme: BorderTheme; familyName: string; rotationOffset: number; manualAssignments: AssignmentMap; generatedAssignments?: Record<string, string[]>;
};
type SavedChoreChart = { id: string; name: string; createdAt: string; snapshot: ChoreChartSnapshot };

type PersistedState = {
  chores: Chore[];
  selectedProfileIds: string[];
  rotationMode: RotationMode;
  choresPerChild: number;
  displayStyle: DisplayStyle;
  borderTheme: BorderTheme;
  familyName: string;
  rotationOffset: number;
  manualAssignments: AssignmentMap;
  savedCharts?: SavedChoreChart[];
};

type Props = { profiles: ChildProfile[]; familyName?: string; theme: AppTheme };

const STORAGE_KEY = '@brightsteps/chore-chart-v1';
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const ALL_DAYS = [...WEEKDAYS, 'Saturday', 'Sunday'];
const CHORE_ICONS = [
  { key: 'brushTeethMorning', label: 'Brush Teeth - Morning', source: require('../../assets/task-stickers/brushTeethMorning.png') },
  { key: 'brushTeethNight', label: 'Brush Teeth - Night', source: require('../../assets/task-stickers/brushTeethNight.png') },
  { key: 'cleanBedroomNew', label: 'Clean Bedroom', source: require('../../assets/task-stickers/cleanBedroom.png') },
  { key: 'washHands', label: 'Wash Hands', source: require('../../assets/task-stickers/washHands.png') },
  { key: 'mop', label: 'Mop', source: require('../../assets/chore-stickers-v2/mop.png') },
  { key: 'garbageCan', label: 'Garbage', source: require('../../assets/chore-stickers-v2/garbageCan.png') },
  { key: 'legoBlock', label: 'Lego', source: require('../../assets/chore-stickers-v2/legoBlock.png') },
  { key: 'toys', label: 'Toys', source: require('../../assets/chore-stickers-v2/toys.png') },
  { key: 'lawnMower', label: 'Lawn Mower', source: require('../../assets/chore-stickers-v2/lawnMower.png') },
  { key: 'lawnMowerSticker', label: 'Mow Lawn', source: require('../../assets/task-stickers/lawnMower.png') },
  { key: 'cleaningCloth', label: 'Cleaning Cloth', source: require('../../assets/chore-stickers-v2/cleaningCloth.png') },
  { key: 'bedroomBed', label: 'Bedroom / Make Bed', source: require('../../assets/chore-stickers-v2/bedroomBed.png') },
  { key: 'dishesSink', label: 'Dishes / Sink', source: require('../../assets/chore-stickers-v2/dishesSink.png') },
  { key: 'dishwasherLoad', label: 'Load Dishwasher', source: require('../../assets/chore-stickers-v2/dishwasherLoad.png') },
  { key: 'dishwasherUnload', label: 'Unload Dishwasher', source: require('../../assets/chore-stickers-v2/dishwasherUnload.png') },
  { key: 'petBowl', label: 'Feed A Pet', source: require('../../assets/chore-stickers-v2/petBowl.png') },
  { key: 'vacuum', label: 'Vacuum', source: require('../../assets/chore-stickers-v2/vacuum.png') },
  { key: 'sink', label: 'Kitchen', source: require('../../assets/task-stickers/sink.png') },
  { key: 'kitchenSinkSticker', label: 'Kitchen', source: require('../../assets/task-stickers/kitchenSink.png') },
  { key: 'couch', label: 'Living Room', source: require('../../assets/chore-stickers-v2/couch.png') },
  { key: 'toilet', label: 'Bathroom', source: require('../../assets/task-stickers/toilet.png') },
  { key: 'bathroomBlue', label: 'Bathroom (Blue)', source: require('../../assets/task-stickers/bathroom.png') },
  { key: 'table', label: 'Table', source: require('../../assets/chore-stickers-v2/table.png') },
  { key: 'tileFloor', label: 'Tile Floor', source: require('../../assets/task-stickers/tileFloor.png') },
  { key: 'woodFloor', label: 'Wood Floor', source: require('../../assets/task-stickers/woodFloor.png') },
  { key: 'basement', label: 'Basement', source: require('../../assets/task-stickers/basement.png') },
  { key: 'basementAlt', label: 'Basement (Alternative)', source: require('../../assets/task-stickers/basementAlt.png') },
  { key: 'laundryBasketSticker', label: 'Laundry', source: require('../../assets/chore-icons/laundryBasketSticker.png') },
  { key: 'sweepBroomDustpan', label: 'Sweep', source: require('../../assets/task-stickers/sweep.png') },
  { key: 'washingMachineSticker', label: 'Washing Machine', source: require('../../assets/task-stickers/washingMachine.png') },
  { key: 'cleanCarSticker', label: 'Clean Car', source: require('../../assets/task-stickers/cleanCar.png') },
  { key: 'trashCanSticker', label: 'Trash', source: require('../../assets/task-stickers/trashCan.png') },
  { key: 'mopBucketSticker', label: 'Mop & Bucket', source: require('../../assets/task-stickers/mopBucket.png') },
  { key: 'cordlessVacuumSticker', label: 'Cordless Vacuum', source: require('../../assets/task-stickers/cordlessVacuum.png') },
  { key: 'pianoSticker', label: 'Piano', source: require('../../assets/task-stickers/piano.png') },
  { key: 'violinSticker', label: 'Violin', source: require('../../assets/task-stickers/violin.png') },
  { key: 'dogWhiteLeash', label: 'White Dog', source: require('../../assets/task-stickers/dogWhiteLeash.png') },
  { key: 'dogChocolateRetriever', label: 'Chocolate Retriever', source: require('../../assets/task-stickers/dogChocolateRetriever.png') },
  { key: 'dogGoldenRetriever', label: 'Golden Retriever', source: require('../../assets/task-stickers/dogGoldenRetriever.png') },
] as const;

const AUTO_CHORE_ICON_RULES: Array<{ keywords: string[]; icon: string }> = [
  { keywords: ['brush teeth - morning','brush teeth-morning','brush teeth morning'], icon: 'brushTeethMorning' },
  { keywords: ['brush teeth - night','brush teeth-night','brush teeth night'], icon: 'brushTeethNight' },
  { keywords: ['wash hands','wash hand'], icon: 'washHands' },
  { keywords: ['clean bedroom','clean the bedroom'], icon: 'cleanBedroomNew' },
  { keywords: ['take out the trash','take out trash','trash'], icon: 'trashCanSticker' },
  { keywords: ['clean out the car','clean car'], icon: 'cleanCarSticker' },
  { keywords: ['mow','mow lawn','mow the lawn','lawn','cut grass','cut the grass','mowing'], icon: 'lawnMowerSticker' },
  { keywords: ['sweep floors','sweep floor','sweep','sweeping','sweep the floor','sweep the floors'], icon: 'sweepBroomDustpan' },
  { keywords: ['laundry','do laundry','laundry basket','dirty laundry','fold laundry','fold the laundry','put away laundry','wash laundry'], icon: 'laundryBasketSticker' },
  { keywords: ['kitchen','clean kitchen','clean the kitchen','kitchen cleanup','kitchen clean up','tidy kitchen'], icon: 'kitchenSinkSticker' },
  { keywords: ['unload dishes','unload the dishes','unload dishwasher','unload the dishwasher','put away dishes','put dishes away'], icon: 'dishwasherUnload' },
  { keywords: ['garbage','garbage bin','garbage can','take out garbage','take the garbage'], icon: 'garbageCan' },
    { keywords: ['load dishwasher','load the dishwasher','load dishes','load the dishes'], icon: 'dishwasherLoad' },
  { keywords: ['feed pet','feeding pet','pet food','pet bowl','feed dog','feed cat'], icon: 'petBowl' },
  { keywords: ['walk the dog','walk dog','dog walk','walking the dog'], icon: 'dogGoldenRetriever' },
  { keywords: ['vacuum'], icon: 'vacuum' },
  { keywords: ['mop'], icon: 'mop' },
  { keywords: ['lego','legos'], icon: 'legoBlock' },
  { keywords: ['toy','toys','put away toys'], icon: 'toys' },
    
  { keywords: ['make bed','make the bed','clean room','tidy room','clean bedroom','tidy bedroom','bedroom','bedding'], icon: 'bedroomBed' },
  { keywords: ['living room','family room'], icon: 'couch' },
  { keywords: ['cellar'], icon: 'basement' },
  { keywords: ['wood floor','hardwood','wooden floor'], icon: 'woodFloor' },
  
  { keywords: ['bathroom','toilet','restroom','shower','bathtub','bath tub','clean bath'], icon: 'toilet' },
  { keywords: ['cabinet','cabinets'], icon: 'sink' },
  { keywords: ['do the dishes','wash dishes','wash the dishes','dishes','dish','sink'], icon: 'dishesSink' },
  { keywords: ['wipe','clean surface','cleaning cloth','dust','duster'], icon: 'cleaningCloth' },
  { keywords: ['table','dining table'], icon: 'table' },
];

const COMMON_CHORES = [
  'Make the bed',
  'Clean bedroom',
  'Put away toys',
  'Brush teeth - morning',
  'Brush teeth - night',
  'Wash hands',
  'Feed pet',
  'Walk the dog',
  'Set the table',
  'Clear the table',
  'Wash dishes',
  'Load dishwasher',
  'Unload dishwasher',
  'Take out the trash',
  'Sweep the floor',
  'Mop the floor',
  'Vacuum',
  'Clean the kitchen',
  'Clean the bathroom',
  'Clean the living room',
  'Fold laundry',
  'Put away laundry',
  'Mow the lawn',
] as const;

function getAutoChoreIcon(name: string): ChoreIcon {
  const value = String(name || '').trim().toLowerCase();
  if (!value) return { type: 'preset', value: 'cleaningCloth' };
  const match = AUTO_CHORE_ICON_RULES.find((rule) => rule.keywords.some((keyword) => value.includes(keyword)));
  return { type: 'preset', value: match?.icon ?? 'cleaningCloth' };
}

const BORDER_COLORS: Record<BorderTheme, string> = { none: '#D9DBE7', red: '#D95858', purple: '#7A63D8', blue: '#3E79C7', gold: '#C99A2E' };

const uid = () => `chore-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char] ?? char));

export function ChoreChartScreen({ profiles, familyName: accountFamilyName, theme }: Props) {
  const [chores, setChores] = useState<Chore[]>([]);
  const [selectedProfileIds, setSelectedProfileIds] = useState<string[]>(profiles.map((p) => p.id));
  const [rotationMode, setRotationMode] = useState<RotationMode>('daily-weekdays');
  const [choresPerChild, setChoresPerChild] = useState(2);
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>('standard');
  const [borderTheme, setBorderTheme] = useState<BorderTheme>('none');
  const [familyName, setFamilyName] = useState(accountFamilyName?.replace(/^The\s+/i, '').replace(/\s+Family$/i, '').replace(/[’']s$/i, '') ?? '');
  const [rotationOffset, setRotationOffset] = useState(0);
  const [manualAssignments, setManualAssignments] = useState<AssignmentMap>({});
  const [choreName, setChoreName] = useState('');
  const [choreIcon, setChoreIcon] = useState<ChoreIcon>({ type: 'preset', value: 'cleaningCloth' });
  const [newChoreIconOverridden, setNewChoreIconOverridden] = useState(false);
  const [iconPickerTarget, setIconPickerTarget] = useState<string | 'new' | null>(null);
  const [rotationOpen, setRotationOpen] = useState(false);
  const [assignmentPicker, setAssignmentPicker] = useState<{ profileId: string; columnIndex: number; slot: number } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [savedCharts, setSavedCharts] = useState<SavedChoreChart[]>([]);
  const [showSavedCharts, setShowSavedCharts] = useState(false);
  const [viewingSavedId, setViewingSavedId] = useState<string | null>(null);
  const [renamingChartId, setRenamingChartId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [chartGenerated, setChartGenerated] = useState(false);
  const [generatedAssignments, setGeneratedAssignments] = useState<Record<string, string[]>>({});
  const [choreEntryFocused, setChoreEntryFocused] = useState(false);
  const [commonChoresOpen, setCommonChoresOpen] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
      if (!raw) return;
      try {
        const saved = JSON.parse(raw) as Partial<PersistedState>;
        if (Array.isArray(saved.chores)) setChores(saved.chores);
        if (Array.isArray(saved.selectedProfileIds)) setSelectedProfileIds(saved.selectedProfileIds.filter((id) => profiles.some((p) => p.id === id)));
        if (saved.rotationMode) setRotationMode(saved.rotationMode);
        if (saved.choresPerChild) setChoresPerChild(saved.choresPerChild);
        if (saved.displayStyle) setDisplayStyle(saved.displayStyle);
        if (saved.borderTheme) setBorderTheme(saved.borderTheme);
        if (typeof saved.familyName === 'string') setFamilyName(saved.familyName);
        if (typeof saved.rotationOffset === 'number') setRotationOffset(saved.rotationOffset);
        if (saved.manualAssignments) setManualAssignments(saved.manualAssignments);
        if (Array.isArray(saved.savedCharts)) setSavedCharts(saved.savedCharts);
      } catch {}
    }).finally(() => setHydrated(true));
  }, [profiles]);

  useEffect(() => {
    if (!hydrated) return;
    const state: PersistedState = { chores, selectedProfileIds, rotationMode, choresPerChild, displayStyle, borderTheme, familyName, rotationOffset, manualAssignments, savedCharts };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => undefined);
  }, [borderTheme, chores, choresPerChild, displayStyle, familyName, hydrated, manualAssignments, rotationMode, rotationOffset, savedCharts, selectedProfileIds]);

  useEffect(() => {
    setSelectedProfileIds((current) => current.filter((id) => profiles.some((p) => p.id === id)));
  }, [profiles]);

  const selectedProfiles = useMemo(() => profiles.filter((profile) => selectedProfileIds.includes(profile.id)), [profiles, selectedProfileIds]);
  const columns = rotationMode === 'weekly' || rotationMode === 'weekly-multiple'
    ? Array.from({ length: 4 }, (_, index) => `Week ${rotationOffset * 4 + index + 1}`)
    : rotationMode === 'daily-all' || rotationMode === 'manual' ? ALL_DAYS : WEEKDAYS;

  const getAssignmentIds = (profileIndex: number, columnIndex: number): string[] => {
    const profile = selectedProfiles[profileIndex];
    if (!profile || chores.length === 0) return [];
    if (rotationMode === 'manual') {
      const id = manualAssignments[`${profile.id}:${columnIndex}:0`] ?? manualAssignments[`${profile.id}:${columnIndex}`];
      return id ? [id] : [];
    }
    const generated = rotationMode === 'weekly-multiple'
      ? Array.from({ length: choresPerChild }, (_, slot) => chores[(profileIndex * choresPerChild + columnIndex * choresPerChild + slot + rotationOffset * choresPerChild) % chores.length]?.id).filter(Boolean) as string[]
      : rotationMode === 'weekly'
        ? [chores[(profileIndex + columnIndex + rotationOffset * 4) % chores.length].id]
        : [chores[(profileIndex + columnIndex + rotationOffset * columns.length) % chores.length].id];
    return generated.map((id, slot) => manualAssignments[`${profile.id}:${columnIndex}:${slot}`] ?? id);
  };

  const assignmentIds = (profileIndex: number, columnIndex: number) => {
    const profile = selectedProfiles[profileIndex];
    if (!profile) return [];
    return generatedAssignments[`${profile.id}:${columnIndex}`] ?? [];
  };

  const generateChart = () => {
    if (!selectedProfiles.length || !chores.length) {
      Alert.alert('Chore Chart Not Ready', 'Choose at least one profile and create at least one chore first.');
      return;
    }
    const next: Record<string, string[]> = {};
    selectedProfiles.forEach((profile, pi) => columns.forEach((_, ci) => {
      next[`${profile.id}:${ci}`] = getAssignmentIds(pi, ci);
    }));
    setGeneratedAssignments(next);
    setChartGenerated(true);
  };

  const chooseAssignment = (choreId: string) => {
    if (!assignmentPicker) return;
    const key = `${assignmentPicker.profileId}:${assignmentPicker.columnIndex}:${assignmentPicker.slot}`;
    setManualAssignments((current) => ({ ...current, [key]: choreId }));
    setGeneratedAssignments((current) => {
      const cellKey = `${assignmentPicker.profileId}:${assignmentPicker.columnIndex}`;
      const values = [...(current[cellKey] ?? [])];
      values[assignmentPicker.slot] = choreId;
      return { ...current, [cellKey]: values.filter(Boolean) };
    });
    setAssignmentPicker(null);
  };

  useEffect(() => {
    if (!viewingSavedId) setChartGenerated(false);
  }, [chores, selectedProfileIds, rotationMode, choresPerChild, rotationOffset]);

  useEffect(() => {
    if (!newChoreIconOverridden) setChoreIcon(getAutoChoreIcon(choreName));
  }, [choreName, newChoreIconOverridden]);

  const selectIconForTarget = (icon: ChoreIcon) => {
    if (iconPickerTarget === 'new') {
      setChoreIcon(icon);
      setNewChoreIconOverridden(true);
    } else if (iconPickerTarget) {
      setChores((current) => current.map((chore) => chore.id === iconPickerTarget ? { ...chore, icon } : chore));
    }
    setIconPickerTarget(null);
  };

  const addChore = () => {
    const name = choreName.trim();
    if (!name) return;
    const icon = newChoreIconOverridden ? choreIcon : getAutoChoreIcon(name);
    setChores((current) => [...current, { id: uid(), name, icon }]);
    setChoreName('');
    setNewChoreIconOverridden(false);
    setChoreIcon({ type: 'preset', value: 'cleaningCloth' });
    setCommonChoresOpen(false);
  };

  const chooseCommonChore = (name: string) => {
    setChoreName(name);
    setNewChoreIconOverridden(false);
    setChoreIcon(getAutoChoreIcon(name));
    setCommonChoresOpen(false);
  };

  const choosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return Alert.alert('Photo Access Needed', 'Allow photo access to choose a custom chore icon.');
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.75 });
    if (!result.canceled && result.assets[0]?.uri) {
      const photoIcon: ChoreIcon = { type: 'photo', uri: result.assets[0].uri };
      if (iconPickerTarget) selectIconForTarget(photoIcon);
      else {
        setChoreIcon(photoIcon);
        setNewChoreIconOverridden(true);
      }
    }
  };

  const chartTitle = familyName.trim() ? `The ${familyName.trim()} Family Chore Chart` : 'Family Chore Chart';

  const currentSnapshot = (): ChoreChartSnapshot => ({
    chores: JSON.parse(JSON.stringify(chores)), selectedProfileIds: [...selectedProfileIds], rotationMode, choresPerChild,
    displayStyle, borderTheme, familyName, rotationOffset, manualAssignments: { ...manualAssignments }, generatedAssignments: { ...generatedAssignments },
  });

  const loadSavedSnapshot = (chart: SavedChoreChart, editable: boolean) => {
    const x=chart.snapshot;
    setChores(x.chores); setSelectedProfileIds(x.selectedProfileIds.filter((id)=>profiles.some((profile)=>profile.id===id)));
    setRotationMode(x.rotationMode); setChoresPerChild(x.choresPerChild); setDisplayStyle(x.displayStyle); setBorderTheme(x.borderTheme);
    setFamilyName(x.familyName); setRotationOffset(x.rotationOffset); setManualAssignments(x.manualAssignments); setGeneratedAssignments(x.generatedAssignments ?? {}); setChartGenerated(true);
    setViewingSavedId(editable ? null : chart.id); setShowSavedCharts(false);
  };

  const saveCurrentChart = () => {
    if (!chartGenerated || !selectedProfiles.length || !chores.length) return Alert.alert('Generate Chore Chart First','Tap Generate Chart before saving this chore chart.');
    const now=new Date();
    const chart: SavedChoreChart={id:`chart-${now.getTime()}-${Math.random().toString(36).slice(2,7)}`,name:`${familyName.trim()?`${familyName.trim()} Family `:''}Chore Chart`,createdAt:now.toISOString(),snapshot:currentSnapshot()};
    setSavedCharts((current)=>[chart,...current]); setViewingSavedId(chart.id);
    Alert.alert('Chore Chart Saved','You can reopen, print, rename, duplicate, or delete it from Saved Chore Charts.');
  };

  const commitRename = () => {
    const name=renameValue.trim();
    if (renamingChartId && name) setSavedCharts((current)=>current.map((chart)=>chart.id===renamingChartId?{...chart,name}:chart));
    setRenamingChartId(null); setRenameValue('');
  };

  const deleteSavedChart = (chart: SavedChoreChart) => Alert.alert('Delete Chore Chart?',`Delete "${chart.name}"?`,[
    {text:'Cancel',style:'cancel'},
    {text:'Delete',style:'destructive',onPress:()=>{setSavedCharts((current)=>current.filter((item)=>item.id!==chart.id));if(viewingSavedId===chart.id)setViewingSavedId(null)}}
  ]);

  const imageUriToPrintData = async (uri: string) => {
    if (!uri) return '';
    if (/^data:/.test(uri)) return uri;

    let readableUri = uri;
    let temporaryUri = '';

    try {
      if (/^https?:\/\//i.test(uri)) {
        const extension = /\.png(?:$|\?)/i.test(uri) ? 'png' : /\.webp(?:$|\?)/i.test(uri) ? 'webp' : 'jpg';
        temporaryUri = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory}brightsteps-print-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
        const downloaded = await FileSystem.downloadAsync(uri, temporaryUri);
        readableUri = downloaded.uri;
      }

      const encoded = await FileSystem.readAsStringAsync(readableUri, { encoding: FileSystem.EncodingType.Base64 });
      const lower = readableUri.toLowerCase();
      const mime = lower.includes('.png') ? 'image/png' : lower.includes('.webp') ? 'image/webp' : 'image/jpeg';
      return `data:${mime};base64,${encoded}`;
    } catch {
      return '';
    } finally {
      if (temporaryUri) FileSystem.deleteAsync(temporaryUri, { idempotent: true }).catch(() => undefined);
    }
  };

  const buildPrintHtml = async () => {
    const border = BORDER_COLORS[borderTheme];
    const headerCells = columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('');
    const rowParts = await Promise.all(selectedProfiles.map(async (profile, pi) => {
      const cellParts = await Promise.all(columns.map(async (_, ci) => {
        const items = assignmentIds(pi, ci).map((id) => chores.find((c) => c.id === id)).filter(Boolean) as Chore[];
        const contentParts = await Promise.all(items.map(async (chore) => {
          let iconUri = '';
          if (chore.icon.type === 'preset') {
            iconUri = CHORE_ICON_PRINT_DATA[presetIconValue(chore.icon)] ?? '';
          } else if (chore.icon.uri) {
            try {
              const encoded = await FileSystem.readAsStringAsync(chore.icon.uri, { encoding: FileSystem.EncodingType.Base64 });
              const extension = chore.icon.uri.toLowerCase().includes('.png') ? 'png' : 'jpeg';
              iconUri = `data:image/${extension};base64,${encoded}`;
            } catch {
              iconUri = '';
            }
          }
          const icon = iconUri ? `<img class="icon-img" src="${iconUri}" alt="" />` : '';
          return `<div class="chore ${displayStyle === 'large-icon' ? 'large' : ''}">${icon}<span>${escapeHtml(chore.name)}</span></div>`;
        }));
        const content = contentParts.length ? contentParts.join('') : '<span class="empty">—</span>';
        return `<td>${content}</td>`;
      }));
      const cells = cellParts.join('');
      let avatarUri = '';
      if (profile.avatar.type === 'preset') {
        avatarUri = AVATAR_PRINT_DATA[profile.avatar.key] ?? '';
      } else if (profile.avatar.uri) {
        avatarUri = await imageUriToPrintData(profile.avatar.uri);
      }
      const avatar = avatarUri ? `<img class="profile-avatar" src="${avatarUri}" alt="" />` : '';
      return `<tr><th class="name">${avatar}<span class="profile-name">${escapeHtml(profile.name)}</span></th>${cells}</tr>`;
    }));
    const rows = rowParts.join('');
    return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@page{size:landscape;margin:24px}body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#24243a;padding:4px}h1{text-align:center;font-size:25px;margin:4px 0 6px}.sub{text-align:center;color:#707287;margin:0 0 18px;font-size:12px}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:2px solid ${border};padding:${displayStyle === 'large-icon' ? '4px 3px' : '10px 7px'};text-align:center;vertical-align:middle}thead th{background:#f4f2ff;font-size:12px}.name{font-size:15px;background:#fafafe;width:13%}.profile-avatar{display:block;width:48px;height:48px;border-radius:16px;object-fit:cover;margin:0 auto 6px}.profile-name{display:block;font-weight:800}.chore{display:flex;align-items:center;justify-content:center;gap:6px;font-size:12px;font-weight:650;margin:3px 0}.chore.large{display:block}.icon-img{width:${displayStyle === 'large-icon' ? '90px' : '22px'};height:${displayStyle === 'large-icon' ? '90px' : '22px'};max-width:${displayStyle === 'large-icon' ? '96%' : '22px'};object-fit:contain;display:inline-block;vertical-align:middle}.chore.large{min-height:104px;padding:2px 0}.chore.large .icon-img{display:block;margin:0 auto}.chore.large span:last-child{display:block;font-size:10px;line-height:11px;margin-top:2px}.empty{color:#aaa}
</style></head><body><h1>${escapeHtml(chartTitle)}</h1><p class="sub">${escapeHtml(rotationLabel(rotationMode, choresPerChild))}</p><table><thead><tr><th>Profile</th>${headerCells}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
  };

  const printChart = async () => {
    if (!chartGenerated || selectedProfiles.length === 0 || chores.length === 0) return Alert.alert('Generate Chore Chart First', 'Choose your profiles, rotation, and chores, then tap Generate Chart before printing.');
    try { const html = await buildPrintHtml(); await Print.printAsync({ html, orientation: Print.Orientation.landscape }); }
    catch (error) { if (Platform.OS !== 'ios') Alert.alert('Unable to Print', error instanceof Error ? error.message : 'The print menu could not be opened.'); }
  };

  const cellMinWidth = rotationMode === 'weekly-multiple' ? 155 : 132;
  return <View style={styles.screen}>
    <View style={styles.headerRow}>
      <View style={styles.headerCopy}><Text style={[styles.eyebrow,{color:theme.primary}]}>FAMILY ROTATION</Text><Text style={[styles.title,{color:theme.text}]}>Chore Chart</Text><Text style={[styles.subtitle,{color:theme.textMuted}]}>Create a fair rotation, preview it, then print a chart for the family.</Text></View>
      <Pressable onPress={printChart} style={[styles.printButton,{backgroundColor:theme.primary}]}><Text style={styles.printIcon}>⌁</Text><Text style={styles.printText}>Print</Text></Pressable>
    </View>

    {profiles.length === 0 ? <View style={[styles.emptyCard,{backgroundColor:theme.surface,borderColor:theme.border}]}><Text style={[styles.emptyTitle,{color:theme.text}]}>Add Profiles First</Text><Text style={[styles.helper,{color:theme.textMuted}]}>Create child profiles on Home, then return here to build their chore rotation.</Text></View> : null}

    <Pressable onPress={()=>setShowSavedCharts((value)=>!value)} style={[styles.savedToggle,{backgroundColor:theme.surface,borderColor:theme.border}]}>
      <View><Text style={[styles.savedToggleTitle,{color:theme.text}]}>Saved Chore Charts</Text><Text style={[styles.helper,{color:theme.textMuted}]}>{savedCharts.length ? `${savedCharts.length} saved chart${savedCharts.length===1?'':'s'}` : 'Reopen and reuse previous chore charts'}</Text></View>
      <Text style={[styles.dropdownChevron,{color:theme.textMuted}]}>{showSavedCharts?'▲':'▼'}</Text>
    </Pressable>
    {showSavedCharts?<View style={styles.savedList}>
      {savedCharts.length===0?<View style={[styles.emptyCard,{backgroundColor:theme.surface,borderColor:theme.border}]}><Text style={[styles.emptyTitle,{color:theme.text}]}>No Saved Charts Yet</Text><Text style={[styles.helper,{color:theme.textMuted}]}>Build a chart below and tap Save Chore Chart.</Text></View>:
      savedCharts.map((chart)=>{const names=profiles.filter((profile)=>chart.snapshot.selectedProfileIds.includes(profile.id)).map((profile)=>profile.name).join(' · ');return <View key={chart.id} style={[styles.savedCard,{backgroundColor:theme.surface,borderColor:theme.border}]}>
        {renamingChartId===chart.id?<View style={styles.renameRow}><TextInput autoFocus value={renameValue} onChangeText={setRenameValue} onSubmitEditing={commitRename} style={[styles.renameInput,{backgroundColor:theme.surfaceMuted,borderColor:theme.border,color:theme.text}]}/><Pressable onPress={commitRename} style={[styles.savedAction,{backgroundColor:theme.primary}]}><Text style={styles.savedActionPrimary}>Save</Text></Pressable></View>:<Text style={[styles.savedTitle,{color:theme.text}]}>{chart.name}</Text>}
        <Text style={[styles.savedMeta,{color:theme.textMuted}]}>{new Date(chart.createdAt).toLocaleDateString()} · {rotationLabel(chart.snapshot.rotationMode,chart.snapshot.choresPerChild)}</Text>
        {names?<Text numberOfLines={2} style={[styles.savedMeta,{color:theme.textMuted}]}>{names}</Text>:null}
        <View style={styles.savedActions}>
          <Pressable onPress={()=>loadSavedSnapshot(chart,false)} style={[styles.savedAction,{backgroundColor:theme.primary}]}><Text style={styles.savedActionPrimary}>View</Text></Pressable>
          <Pressable onPress={()=>loadSavedSnapshot(chart,true)} style={[styles.savedAction,{backgroundColor:theme.surfaceMuted}]}><Text style={[styles.savedActionText,{color:theme.text}]}>Duplicate & Edit</Text></Pressable>
          <Pressable onPress={()=>{setRenamingChartId(chart.id);setRenameValue(chart.name)}} style={[styles.savedAction,{backgroundColor:theme.surfaceMuted}]}><Text style={[styles.savedActionText,{color:theme.text}]}>Rename</Text></Pressable>
          <Pressable onPress={()=>deleteSavedChart(chart)} style={[styles.savedAction,{backgroundColor:theme.surfaceMuted}]}><Text style={[styles.savedActionText,{color:theme.danger}]}>Delete</Text></Pressable>
        </View>
      </View>})}
    </View>:null}
    {viewingSavedId?<View style={[styles.readOnlyBanner,{backgroundColor:theme.primarySoft,borderColor:theme.primary}]}><View style={{flex:1}}><Text style={[styles.readOnlyTitle,{color:theme.primary}]}>Viewing Saved Chore Chart</Text><Text style={[styles.helper,{color:theme.textMuted}]}>This saved copy is read-only.</Text></View><Pressable onPress={()=>setViewingSavedId(null)} style={[styles.savedAction,{backgroundColor:theme.primary}]}><Text style={styles.savedActionPrimary}>Duplicate & Edit</Text></Pressable></View>:null}

    <View pointerEvents={viewingSavedId?'none':'auto'} style={viewingSavedId?styles.disabledEditor:undefined}>
    <Section title="Profiles" theme={theme}><View style={styles.profileWrap}>{profiles.map((profile) => { const selected=selectedProfileIds.includes(profile.id); const accent=getProfileAccent(profile.colorKey); return <Pressable key={profile.id} onPress={() => setSelectedProfileIds((ids) => selected ? ids.filter((id)=>id!==profile.id) : [...ids,profile.id])} style={[styles.profileChip,{backgroundColor:selected?`${accent}1F`:theme.surfaceMuted,borderColor:selected?accent:theme.border}]}><ProfileAvatar avatar={profile.avatar} color={accent} size={38} theme={theme}/><Text numberOfLines={1} style={[styles.profileName,{color:selected?accent:theme.text}]}>{profile.name}</Text><Text style={{color:selected?accent:theme.textMuted,fontWeight:'900'}}>{selected?'✓':'+'}</Text></Pressable>; })}</View></Section>

    <Section title="Rotation" theme={theme}>
      <Pressable onPress={()=>setRotationOpen((open)=>!open)} style={[styles.dropdownButton,{backgroundColor:theme.surfaceMuted,borderColor:theme.border}]}>
        <Text style={[styles.dropdownLabel,{color:theme.text}]}>{rotationLabel(rotationMode,choresPerChild)}</Text><Text style={[styles.dropdownChevron,{color:theme.textMuted}]}>{rotationOpen?'▲':'▼'}</Text>
      </Pressable>
      {rotationOpen?<View style={[styles.dropdownMenu,{borderColor:theme.border,backgroundColor:theme.surface}]}>
        {([['daily-weekdays','Daily · Monday–Friday'],['daily-all','Daily · Monday–Sunday'],['weekly','One Chore · Weekly · 4 Weeks'],['weekly-multiple','Multiple Chores · Weekly · 4 Weeks'],['manual','Manual Assignment · Monday–Sunday']] as [RotationMode,string][]).map(([mode,label])=><Pressable key={mode} onPress={()=>{setRotationMode(mode);setRotationOffset(0);setRotationOpen(false)}} style={[styles.dropdownOption,{backgroundColor:rotationMode===mode?theme.primarySoft:'transparent'}]}><Text style={[styles.dropdownOptionText,{color:rotationMode===mode?theme.primary:theme.text}]}>{label}</Text>{rotationMode===mode?<Text style={{color:theme.primary,fontWeight:'900'}}>✓</Text>:null}</Pressable>)}
      </View>:null}
      {rotationMode==='weekly-multiple'?<View style={styles.stepRow}><Text style={[styles.fieldLabel,{color:theme.text}]}>Chores Per Profile</Text><View style={styles.counter}><Pressable onPress={()=>setChoresPerChild(Math.max(2,choresPerChild-1))} style={[styles.counterButton,{backgroundColor:theme.surfaceMuted}]}><Text style={[styles.counterText,{color:theme.text}]}>−</Text></Pressable><Text style={[styles.counterValue,{color:theme.text}]}>{choresPerChild}</Text><Pressable onPress={()=>setChoresPerChild(Math.min(6,choresPerChild+1))} style={[styles.counterButton,{backgroundColor:theme.surfaceMuted}]}><Text style={[styles.counterText,{color:theme.text}]}>+</Text></Pressable></View></View>:null}
    </Section>

    <View style={choreEntryFocused ? [styles.focusedChoreSection,{backgroundColor:theme.surface,borderColor:theme.primary}] : undefined}><Section title="Create Chores" theme={theme}>
      <Text style={[styles.miniLabel,{color:theme.textMuted}]}>COMMON CHORES (OPTIONAL)</Text>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: commonChoresOpen }} onPress={()=>setCommonChoresOpen((open)=>!open)} style={[styles.dropdownButton,{backgroundColor:theme.surfaceMuted,borderColor:theme.border}]}>
        <Text style={[styles.dropdownLabel,{color:choreName?theme.text:theme.textMuted}]}>{choreName || 'Choose a common chore'}</Text><Text style={[styles.dropdownChevron,{color:theme.textMuted}]}>{commonChoresOpen?'▲':'▼'}</Text>
      </Pressable>
      {commonChoresOpen?<View style={[styles.commonChoreMenu,{backgroundColor:theme.surface,borderColor:theme.border}]}><ScrollView nestedScrollEnabled style={styles.commonChoreScroll}>
        {COMMON_CHORES.map((name)=><Pressable accessibilityLabel={`Choose ${name}`} key={name} onPress={()=>chooseCommonChore(name)} style={[styles.dropdownOption,{backgroundColor:choreName===name?theme.primarySoft:'transparent'}]}><Text style={[styles.dropdownOptionText,{color:choreName===name?theme.primary:theme.text}]}>{name}</Text>{choreName===name?<Text style={{color:theme.primary,fontWeight:'900'}}>✓</Text>:null}</Pressable>)}
      </ScrollView></View>:null}
      <Text style={[styles.miniLabel,{color:theme.textMuted}]}>OR ENTER A CUSTOM CHORE</Text>
      <View style={styles.inputRow}><TextInput onFocus={()=>{setChoreEntryFocused(true);setShowSavedCharts(false)}} onBlur={()=>setChoreEntryFocused(false)} onChangeText={setChoreName} onSubmitEditing={addChore} placeholder="Chore name" placeholderTextColor={theme.textMuted} style={[styles.input,{backgroundColor:theme.surface,borderColor:theme.border,color:theme.text}]} value={choreName}/><Pressable onPress={addChore} style={[styles.addButton,{backgroundColor:theme.primary}]}><Text style={styles.addButtonText}>Add</Text></Pressable></View>
      <Text style={[styles.miniLabel,{color:theme.textMuted}]}>CHORE ICON</Text>
      <Pressable onPress={()=>setIconPickerTarget('new')} style={[styles.autoIconRow,{backgroundColor:theme.surfaceMuted,borderColor:theme.border}]}>
        {choreIcon.type==='preset'?<Image source={CHORE_ICONS.find((item)=>item.key===choreIcon.value)?.source} style={styles.autoIconImage}/>:<Image source={{uri:choreIcon.uri}} style={styles.autoIconImage}/>}
        <View style={styles.autoIconCopy}><Text style={[styles.autoIconTitle,{color:theme.text}]}>Auto-Matched Icon</Text><Text style={[styles.helper,{color:theme.textMuted}]}>Tap the icon to choose a different one.</Text></View>
        <Text style={[styles.changeIconText,{color:theme.primary}]}>Change</Text>
      </Pressable>
      <View style={styles.chorePool}>{chores.map((chore)=><View key={chore.id} style={[styles.chorePill,{backgroundColor:theme.surfaceMuted}]}><Pressable accessibilityLabel={`Change icon for ${chore.name}`} onPress={()=>setIconPickerTarget(chore.id)} style={styles.pillIconButton}>{chore.icon.type==='preset'?<Image source={CHORE_ICONS.find((item)=>item.key===presetIconValue(chore.icon))?.source} style={styles.pillPhoto}/>:<Image source={{uri:chore.icon.uri}} style={styles.pillPhoto}/>}</Pressable><Text numberOfLines={1} style={[styles.pillName,{color:theme.text}]}>{chore.name}</Text><Pressable hitSlop={8} onPress={()=>setChores((current)=>current.filter((item)=>item.id!==chore.id))}><Text style={[styles.remove,{color:theme.danger}]}>×</Text></Pressable></View>)}</View>
    </Section></View>

    <Section title="Chart Style" theme={theme}>
      <Text style={[styles.fieldLabel,{color:theme.text}]}>Family Name</Text><TextInput onChangeText={setFamilyName} placeholder="e.g., Beeton" placeholderTextColor={theme.textMuted} style={[styles.input,{backgroundColor:theme.surface,borderColor:theme.border,color:theme.text}]} value={familyName}/>
      <View style={styles.styleRow}><View style={styles.styleGroup}><Text style={[styles.miniLabel,{color:theme.textMuted}]}>DISPLAY</Text><View style={styles.segment}><Segment label="Standard" selected={displayStyle==='standard'} onPress={()=>setDisplayStyle('standard')} theme={theme}/><Segment label="Large Icons" selected={displayStyle==='large-icon'} onPress={()=>setDisplayStyle('large-icon')} theme={theme}/></View></View></View>
      <Text style={[styles.miniLabel,{color:theme.textMuted}]}>BORDER</Text><View style={styles.colorRow}>{(['none','red','purple','blue','gold'] as BorderTheme[]).map((key)=><Pressable accessibilityLabel={`${key} border`} key={key} onPress={()=>setBorderTheme(key)} style={[styles.colorDot,{backgroundColor:key==='none'?theme.surfaceMuted:BORDER_COLORS[key],borderColor:borderTheme===key?theme.text:theme.border,borderWidth:borderTheme===key?3:1}]}><Text style={{color:key==='none'?theme.textMuted:'#fff',fontSize:10,fontWeight:'900'}}>{key==='none'?'—':''}</Text></Pressable>)}</View>
    </Section>

    </View>

    <View style={[styles.previewCard,{backgroundColor:theme.surface,borderColor:theme.border}]}>
      <View style={styles.previewHeader}><View style={styles.previewCopy}><Text style={[styles.previewTitle,{color:theme.text}]}>{chartTitle}</Text><Text style={[styles.helper,{color:theme.textMuted}]}>{rotationLabel(rotationMode,choresPerChild)}</Text></View>{!viewingSavedId?<Pressable onPress={generateChart} style={[styles.generateButton,{backgroundColor:theme.primary}]}><Text style={styles.generateButtonText}>Generate Chart</Text></Pressable>:null}</View>
      {!chartGenerated ? <View style={styles.previewEmpty}><Text style={[styles.emptyTitle,{color:theme.text}]}>Ready When You Are</Text><Text style={[styles.helper,{color:theme.textMuted}]}>Choose profiles, set the rotation, add all your chores, then tap Generate Chart.</Text></View> : <ScrollView horizontal showsHorizontalScrollIndicator={true}><View style={[styles.chart,{borderColor:BORDER_COLORS[borderTheme]}]}>
        <View style={styles.chartRow}><View style={[styles.nameCell,styles.headerCell,{backgroundColor:theme.primarySoft,borderColor:BORDER_COLORS[borderTheme]}]}><Text style={[styles.chartHeader,{color:theme.primary}]}>Profile</Text></View>{columns.map((column)=><View key={column} style={[styles.choreCell,styles.headerCell,{backgroundColor:theme.primarySoft,borderColor:BORDER_COLORS[borderTheme],minWidth:cellMinWidth}]}><Text style={[styles.chartHeader,{color:theme.primary}]}>{column}</Text></View>)}</View>
        {selectedProfiles.map((profile,pi)=><View key={profile.id} style={styles.chartRow}><View style={[styles.nameCell,{borderColor:BORDER_COLORS[borderTheme]}]}><ProfileAvatar avatar={profile.avatar} color={getProfileAccent(profile.colorKey)} size={40} theme={theme}/><Text numberOfLines={2} style={[styles.chartName,{color:getProfileAccent(profile.colorKey)}]}>{profile.name}</Text></View>{columns.map((_,ci)=>{const items=assignmentIds(pi,ci).map((id)=>chores.find((c)=>c.id===id)).filter(Boolean) as Chore[]; return <Pressable key={`${profile.id}-${ci}`} onPress={()=>{if(!viewingSavedId)setAssignmentPicker({profileId:profile.id,columnIndex:ci,slot:0})}} style={[styles.choreCell,{borderColor:BORDER_COLORS[borderTheme],minWidth:cellMinWidth}]}>{items.length?items.map((chore,slot)=><Pressable key={`${profile.id}-${ci}-${slot}-${chore.id}`} onPress={()=>{if(!viewingSavedId)setAssignmentPicker({profileId:profile.id,columnIndex:ci,slot})}} style={[styles.assignment,displayStyle==='large-icon'&&styles.assignmentLarge]}>{chore.icon.type==='preset'?<Image source={CHORE_ICONS.find((item)=>item.key===presetIconValue(chore.icon))?.source} style={displayStyle==='large-icon'?styles.assignmentPhotoLarge:styles.assignmentPhoto}/>:<Image source={{uri:chore.icon.uri}} style={displayStyle==='large-icon'?styles.assignmentPhotoLarge:styles.assignmentPhoto}/>}<Text numberOfLines={2} style={[displayStyle==='large-icon'?styles.assignmentLabelSmall:styles.assignmentLabel,{color:theme.text}]}>{chore.name}</Text></Pressable>):<Text style={[styles.tapHint,{color:theme.textMuted}]}>Tap to assign</Text>}</Pressable>})}</View>)}
      </View></ScrollView>}
      {!viewingSavedId?<Text style={[styles.tapHelp,{color:theme.textMuted}]}>Tip: tap any chore to choose from your created chores.</Text>:null}
      <View style={styles.chartActions}>
        {!viewingSavedId?<Pressable onPress={saveCurrentChart} style={[styles.fullSave,{backgroundColor:theme.primarySoft,borderColor:theme.primary}]}><Text style={[styles.fullSaveText,{color:theme.primary}]}>Save Chore Chart</Text></Pressable>:null}
        <Pressable onPress={printChart} style={[styles.fullPrint,{backgroundColor:theme.primary}]}><Text style={styles.fullPrintText}>{viewingSavedId?'Print Again':'Print Chore Chart'}</Text></Pressable>
      </View>
    </View>
    <Modal visible={Boolean(iconPickerTarget)} transparent animationType="fade" onRequestClose={()=>setIconPickerTarget(null)}>
      <Pressable style={styles.modalBackdrop} onPress={()=>setIconPickerTarget(null)}>
        <Pressable style={[styles.iconPickerMenu,{backgroundColor:theme.surface,borderColor:theme.border}]} onPress={(event)=>event.stopPropagation()}>
          <Text style={[styles.assignmentMenuTitle,{color:theme.text}]}>Choose A Chore Icon</Text>
          <Text style={[styles.helper,{color:theme.textMuted}]}>Kudos picks an icon from the chore name automatically. Choose any icon below to override it.</Text>
          <ScrollView contentContainerStyle={styles.iconPickerGrid} style={styles.iconPickerScroll}>
            {CHORE_ICONS.map((icon)=><Pressable accessibilityLabel={icon.label} key={icon.key} onPress={()=>selectIconForTarget({type:'preset',value:icon.key})} style={[styles.iconPickerOption,{backgroundColor:theme.surfaceMuted,borderColor:theme.border}]}><Image source={icon.source} style={styles.iconPickerImage}/><Text numberOfLines={2} style={[styles.iconPickerLabel,{color:theme.text}]}>{icon.label}</Text></Pressable>)}
          </ScrollView>
          <Pressable onPress={()=>void choosePhoto()} style={[styles.photoPickerButton,{borderColor:theme.primary}]}><Text style={[styles.photoPickerText,{color:theme.primary}]}>Use A Photo</Text></Pressable>
          <Pressable onPress={()=>setIconPickerTarget(null)} style={[styles.cancelButton,{backgroundColor:theme.surfaceMuted}]}><Text style={[styles.cancelText,{color:theme.text}]}>Cancel</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
    <Modal visible={Boolean(assignmentPicker)} transparent animationType="fade" onRequestClose={()=>setAssignmentPicker(null)}>
      <Pressable style={styles.modalBackdrop} onPress={()=>setAssignmentPicker(null)}>
        <Pressable style={[styles.assignmentMenu,{backgroundColor:theme.surface,borderColor:theme.border}]} onPress={(event)=>event.stopPropagation()}>
          <Text style={[styles.assignmentMenuTitle,{color:theme.text}]}>Choose A Chore</Text><Text style={[styles.helper,{color:theme.textMuted}]}>Select any chore you created.</Text>
          <ScrollView style={styles.assignmentMenuScroll}>{chores.map((chore)=><Pressable key={chore.id} onPress={()=>chooseAssignment(chore.id)} style={[styles.assignmentOption,{borderColor:theme.border}]}>{chore.icon.type==='preset'?<Image source={CHORE_ICONS.find((item)=>item.key===presetIconValue(chore.icon))?.source} style={styles.assignmentOptionIcon}/>:<Image source={{uri:chore.icon.uri}} style={styles.assignmentOptionIcon}/>}<Text style={[styles.assignmentOptionText,{color:theme.text}]}>{chore.name}</Text></Pressable>)}</ScrollView>
          <Pressable onPress={()=>setAssignmentPicker(null)} style={[styles.cancelButton,{backgroundColor:theme.surfaceMuted}]}><Text style={[styles.cancelText,{color:theme.text}]}>Cancel</Text></Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  </View>;
}

function rotationLabel(mode: RotationMode, count: number) {
  if (mode==='daily-weekdays') return 'Daily Rotation · Monday–Friday';
  if (mode==='daily-all') return 'Daily Rotation · Monday–Sunday';
  if (mode==='weekly') return 'One Chore Per Profile · One Week at a Time · 4-Week Rotation';
  if (mode==='weekly-multiple') return `${count} Chores Per Profile · One Week at a Time · 4-Week Rotation`;
  return 'Manual Chore Assignment · Monday–Sunday';
}
function Section({title,theme,children}:{title:string;theme:AppTheme;children:ReactNode}) { return <View style={[styles.section,{backgroundColor:theme.surface,borderColor:theme.border}]}><Text style={[styles.sectionTitle,{color:theme.text}]}>{title}</Text>{children}</View>; }
function Segment({label,selected,onPress,theme}:{label:string;selected:boolean;onPress:()=>void;theme:AppTheme}) { return <Pressable onPress={onPress} style={[styles.segmentButton,{backgroundColor:selected?theme.primary:theme.surfaceMuted}]}><Text style={[styles.segmentText,{color:selected?'#fff':theme.text}]}>{label}</Text></Pressable>; }

const styles=StyleSheet.create({
  screen:{gap:14,paddingBottom:20},focusedChoreSection:{borderRadius:24,borderWidth:2,padding:3},savedToggle:{alignItems:'center',borderRadius:18,borderWidth:1,flexDirection:'row',justifyContent:'space-between',minHeight:64,paddingHorizontal:14,paddingVertical:10},savedToggleTitle:{fontSize:16,fontWeight:'900'},savedList:{gap:9},savedCard:{borderRadius:17,borderWidth:1,gap:5,padding:12},savedTitle:{fontSize:15,fontWeight:'900'},savedMeta:{fontSize:11,lineHeight:16},savedActions:{flexDirection:'row',flexWrap:'wrap',gap:7,marginTop:5},savedAction:{alignItems:'center',borderRadius:10,justifyContent:'center',minHeight:36,paddingHorizontal:10},savedActionPrimary:{color:'#fff',fontSize:11,fontWeight:'900'},savedActionText:{fontSize:11,fontWeight:'800'},renameRow:{alignItems:'center',flexDirection:'row',gap:7},renameInput:{borderRadius:10,borderWidth:1,flex:1,fontSize:14,minHeight:38,paddingHorizontal:10},readOnlyBanner:{alignItems:'center',borderRadius:16,borderWidth:1,flexDirection:'row',gap:10,padding:12},readOnlyTitle:{fontSize:14,fontWeight:'900'},disabledEditor:{opacity:0.72,gap:14}, headerRow:{alignItems:'flex-start',flexDirection:'row',gap:14,justifyContent:'space-between'},headerCopy:{flex:1,gap:4},eyebrow:{fontSize:11,fontWeight:'900',letterSpacing:1.2},title:{fontSize:30,fontWeight:'900',letterSpacing:-0.8},subtitle:{fontSize:14,lineHeight:20,maxWidth:580},printButton:{alignItems:'center',borderRadius:16,gap:1,justifyContent:'center',minHeight:58,minWidth:64,paddingHorizontal:10},printIcon:{color:'#fff',fontSize:22,fontWeight:'900'},printText:{color:'#fff',fontSize:11,fontWeight:'900'},
  section:{borderRadius:22,borderWidth:1,gap:12,padding:15},sectionTitle:{fontSize:18,fontWeight:'900'},profileWrap:{flexDirection:'row',flexWrap:'wrap',gap:9},profileChip:{alignItems:'center',borderRadius:15,borderWidth:1.5,flexDirection:'row',gap:8,maxWidth:'48%',minHeight:50,paddingHorizontal:9,paddingVertical:6},profileName:{flexShrink:1,fontSize:13,fontWeight:'800'},
  optionWrap:{flexDirection:'row',flexWrap:'wrap',gap:9},dropdownButton:{alignItems:'center',borderRadius:15,borderWidth:1,flexDirection:'row',justifyContent:'space-between',minHeight:52,paddingHorizontal:14,paddingVertical:10},dropdownLabel:{flex:1,fontSize:14,fontWeight:'800',paddingRight:10},dropdownChevron:{fontSize:12,fontWeight:'900'},dropdownMenu:{borderRadius:15,borderWidth:1,overflow:'hidden'},commonChoreMenu:{borderRadius:15,borderWidth:1,overflow:'hidden'},commonChoreScroll:{maxHeight:238},dropdownOption:{alignItems:'center',flexDirection:'row',justifyContent:'space-between',minHeight:46,paddingHorizontal:14,paddingVertical:10},dropdownOptionText:{fontSize:13,fontWeight:'800'},optionCard:{borderRadius:15,borderWidth:1.5,minHeight:68,padding:10,width:'48%'},optionTitle:{fontSize:14,fontWeight:'900'},optionDesc:{fontSize:11,lineHeight:15,marginTop:3},stepRow:{alignItems:'center',flexDirection:'row',justifyContent:'space-between',marginTop:2},fieldLabel:{fontSize:13,fontWeight:'800'},counter:{alignItems:'center',flexDirection:'row',gap:12},counterButton:{alignItems:'center',borderRadius:12,height:38,justifyContent:'center',width:38},counterText:{fontSize:22,fontWeight:'800'},counterValue:{fontSize:17,fontWeight:'900',minWidth:20,textAlign:'center'},
  inputRow:{flexDirection:'row',gap:8},input:{borderRadius:14,borderWidth:1,flex:1,fontSize:15,minHeight:48,paddingHorizontal:13,paddingVertical:10},addButton:{alignItems:'center',borderRadius:14,justifyContent:'center',minWidth:66,paddingHorizontal:14},addButtonText:{color:'#fff',fontSize:14,fontWeight:'900'},miniLabel:{fontSize:10,fontWeight:'900',letterSpacing:1.1},iconsRow:{gap:7,paddingRight:12},iconChoice:{alignItems:'center',borderRadius:12,borderWidth:2,height:46,justifyContent:'center',width:46},iconEmoji:{fontSize:23},iconImage:{height:38,width:38,resizeMode:'contain'},photoChoice:{alignItems:'center',borderRadius:12,borderWidth:2,height:46,justifyContent:'center',minWidth:66,overflow:'hidden'},photoText:{fontSize:11,fontWeight:'900'},photoPreview:{height:'100%',width:46},chorePool:{flexDirection:'row',flexWrap:'wrap',gap:7},chorePill:{alignItems:'center',borderRadius:14,flexDirection:'row',gap:6,maxWidth:'100%',paddingHorizontal:9,paddingVertical:7},pillIcon:{fontSize:18},pillPhoto:{borderRadius:6,height:24,width:24},pillName:{fontSize:13,fontWeight:'800',maxWidth:180},remove:{fontSize:20,fontWeight:'600',lineHeight:20},
  styleRow:{flexDirection:'row'},styleGroup:{flex:1,gap:6},segment:{flexDirection:'row',gap:7},segmentButton:{borderRadius:12,paddingHorizontal:12,paddingVertical:9},segmentText:{fontSize:12,fontWeight:'800'},colorRow:{flexDirection:'row',gap:10},colorDot:{alignItems:'center',borderRadius:17,height:34,justifyContent:'center',width:34},
  previewCard:{borderRadius:24,borderWidth:1,gap:12,overflow:'hidden',padding:15},previewHeader:{alignItems:'flex-start',flexDirection:'row',gap:10,justifyContent:'space-between'},generateButton:{alignItems:'center',borderRadius:12,justifyContent:'center',minHeight:38,paddingHorizontal:12},generateButtonText:{color:'#fff',fontSize:11,fontWeight:'900'},previewCopy:{flex:1},previewTitle:{fontSize:19,fontWeight:'900'},helper:{fontSize:12,lineHeight:17},navButtons:{flexDirection:'row',gap:6},smallNav:{alignItems:'center',borderRadius:10,height:36,justifyContent:'center',width:36},smallNavText:{fontSize:27,fontWeight:'700',lineHeight:29},previewEmpty:{alignItems:'center',gap:4,paddingVertical:28},emptyCard:{borderRadius:18,borderWidth:1,gap:4,padding:15},emptyTitle:{fontSize:15,fontWeight:'900'},chart:{borderLeftWidth:2,borderTopWidth:2},chartRow:{flexDirection:'row'},nameCell:{alignItems:'center',borderBottomWidth:2,borderRightWidth:2,gap:5,justifyContent:'center',minHeight:94,padding:7,width:108},choreCell:{alignItems:'center',borderBottomWidth:2,borderRightWidth:2,justifyContent:'center',minHeight:94,padding:7},headerCell:{minHeight:46},chartHeader:{fontSize:11,fontWeight:'900',textAlign:'center'},chartName:{fontSize:12,fontWeight:'900',textAlign:'center'},assignment:{alignItems:'center',flexDirection:'row',gap:5,justifyContent:'center',marginVertical:2,maxWidth:142},assignmentLarge:{flexDirection:'column',gap:2},assignmentIcon:{fontSize:20},assignmentIconLarge:{fontSize:31},assignmentPhoto:{borderRadius:7,height:28,width:28},assignmentPhotoLarge:{borderRadius:9,height:43,width:43},assignmentLabel:{flexShrink:1,fontSize:11,fontWeight:'800',textAlign:'center'},assignmentLabelSmall:{fontSize:9,fontWeight:'800',textAlign:'center'},tapHint:{fontSize:10,fontWeight:'700'},tapHelp:{fontSize:11,textAlign:'center'},chartActions:{flexDirection:'row',gap:8},fullSave:{alignItems:'center',borderRadius:15,borderWidth:1,flex:1,justifyContent:'center',minHeight:50},fullSaveText:{fontSize:13,fontWeight:'900'},fullPrint:{alignItems:'center',borderRadius:15,flex:1,justifyContent:'center',minHeight:50},fullPrintText:{color:'#fff',fontSize:14,fontWeight:'900'},autoIconRow:{alignItems:'center',borderRadius:15,borderWidth:1,flexDirection:'row',gap:12,minHeight:64,padding:10},autoIconImage:{height:44,resizeMode:'contain',width:44},autoIconCopy:{flex:1},autoIconTitle:{fontSize:14,fontWeight:'800'},changeIconText:{fontSize:13,fontWeight:'900'},pillIconButton:{alignItems:'center',justifyContent:'center'},iconPickerMenu:{borderRadius:22,borderWidth:1,maxHeight:'82%',padding:16,width:'100%',maxWidth:430},iconPickerScroll:{marginTop:10},iconPickerGrid:{flexDirection:'row',flexWrap:'wrap',gap:10,paddingBottom:6},iconPickerOption:{alignItems:'center',borderRadius:14,borderWidth:1,justifyContent:'center',minHeight:86,padding:8,width:'30%'},iconPickerImage:{height:42,resizeMode:'contain',width:42},iconPickerLabel:{fontSize:10,fontWeight:'700',marginTop:5,textAlign:'center'},photoPickerButton:{alignItems:'center',borderRadius:13,borderWidth:1,justifyContent:'center',marginTop:10,minHeight:46},photoPickerText:{fontSize:14,fontWeight:'900'},modalBackdrop:{alignItems:'center',backgroundColor:'rgba(20,20,35,0.48)',flex:1,justifyContent:'center',padding:22},assignmentMenu:{borderRadius:22,borderWidth:1,maxHeight:'72%',padding:16,width:'100%',maxWidth:420},assignmentMenuTitle:{fontSize:20,fontWeight:'900'},assignmentMenuScroll:{marginTop:10},assignmentOption:{alignItems:'center',borderBottomWidth:1,flexDirection:'row',gap:12,minHeight:54,paddingHorizontal:4,paddingVertical:8},assignmentOptionIcon:{borderRadius:8,height:38,resizeMode:'contain',width:38},assignmentOptionText:{flex:1,fontSize:15,fontWeight:'800'},cancelButton:{alignItems:'center',borderRadius:13,justifyContent:'center',marginTop:12,minHeight:46},cancelText:{fontSize:14,fontWeight:'900'}
});
