import { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AppTheme } from '../theme';
import type { ItemIcon } from '../types';
import { REWARD_ICON_OPTIONS, TASK_ICON_OPTIONS } from '../data/itemIcons';
import { ItemIconView } from './ItemIconView';
import { choosePhotoSource } from './PhotoSourcePicker';

type IconPickerProps = {
  kind: 'task' | 'reward';
  value: ItemIcon;
  onChange: (icon: ItemIcon) => void;
  theme: AppTheme;
  buttonLabel?: string;
};

export function IconPicker({ kind, value, onChange, theme, buttonLabel }: IconPickerProps) {
  const [isPicking, setIsPicking] = useState(false);
  const [pickerVisible, setPickerVisible] = useState(false);
  const options = kind === 'task' ? TASK_ICON_OPTIONS : REWARD_ICON_OPTIONS;

  const choosePhoto = async () => {
    setIsPicking(true);
    try {
      const uri = await choosePhotoSource(kind);
      if (uri) onChange({ type: 'photo', uri });
    } catch (error) {
      console.warn(error);
      Alert.alert('Photo Unavailable', 'Kudos could not open the camera or photo library. Please try again or select an included icon.');
    } finally {
      setIsPicking(false);
    }
  };

  const pickerContent = (
    <View style={styles.root}>
      <View style={styles.selectedRow}>
        <ItemIconView icon={value} size={62} backgroundColor={theme.primarySoft} theme={theme} />
        <View style={styles.selectedCopy}>
          <Text style={[styles.selectedTitle, { color: theme.text }]}>Selected {kind} icon</Text>
          <Text style={[styles.selectedHint, { color: theme.textMuted }]}>Choose from {options.length} included icons or upload your own square photo.</Text>
        </View>
        <Pressable
          disabled={isPicking}
          onPress={() => void choosePhoto()}
          style={({ pressed }) => [styles.photoButton, { backgroundColor: theme.primarySoft }, pressed && styles.pressed]}
        >
          <Text style={[styles.photoButtonText, { color: theme.primary }]}>{isPicking ? 'Opening…' : 'Add photo'}</Text>
        </Pressable>
      </View>
      <View style={styles.grid}>
        {options.map((option) => {
          const selected = value.type === 'preset' && value.value === option;
          return (
            <Pressable
              accessibilityLabel={`Choose ${option} icon`}
              key={option}
              onPress={() => onChange({ type: 'preset', value: option })}
              style={[
                styles.option,
                {
                  backgroundColor: selected ? theme.primarySoft : theme.surfaceMuted,
                  borderColor: selected ? theme.primary : theme.border,
                },
              ]}
            >
              {String(option).startsWith('task:') || String(option).startsWith('reward:') ? (
                <ItemIconView icon={{ type: 'preset', value: option }} size={43} backgroundColor="transparent" theme={theme} />
              ) : (
                <Text style={styles.optionText}>{option}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  if (!buttonLabel) return pickerContent;

  return (
    <>
      <Pressable
        accessibilityHint={`Opens the ${kind} icon library`}
        accessibilityRole="button"
        onPress={() => setPickerVisible(true)}
        style={({ pressed }) => [styles.chooseButton, { backgroundColor: theme.surface, borderColor: theme.border }, pressed && styles.pressed]}
      >
        <ItemIconView icon={value} size={43} backgroundColor="transparent" theme={theme} />
        <View style={styles.chooseCopy}>
          <Text style={[styles.chooseTitle, { color: theme.text }]}>{buttonLabel}</Text>
          <Text style={[styles.chooseHint, { color: theme.textMuted }]}>Tap to browse all included icons or add a photo.</Text>
        </View>
        <Text style={[styles.chevron, { color: theme.primary }]}>›</Text>
      </Pressable>
      <Modal animationType="slide" onRequestClose={() => setPickerVisible(false)} presentationStyle="pageSheet" visible={pickerVisible}>
        <SafeAreaView style={[styles.modalRoot, { backgroundColor: theme.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
            <Pressable onPress={() => setPickerVisible(false)} style={styles.headerButton}><Text style={[styles.headerButtonText, { color: theme.textMuted }]}>Cancel</Text></Pressable>
            <Text style={[styles.modalTitle, { color: theme.text }]}>Choose a task icon</Text>
            <Pressable onPress={() => setPickerVisible(false)} style={styles.headerButton}><Text style={[styles.doneText, { color: theme.primary }]}>Done</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent} showsVerticalScrollIndicator={false}>
            {pickerContent}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  selectedRow: { alignItems: 'center', flexDirection: 'row', gap: 11 },
  selectedCopy: { flex: 1 },
  selectedTitle: { fontSize: 13, fontWeight: '900' },
  selectedHint: { fontSize: 12, lineHeight: 14, marginTop: 3 },
  photoButton: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 9 },
  photoButtonText: { fontSize: 12, fontWeight: '900' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  option: { alignItems: 'center', borderRadius: 13, borderWidth: 1.5, height: 46, justifyContent: 'center', width: 46 },
  optionText: { fontSize: 22 },
  chooseButton: { alignItems: 'center', borderRadius: 16, borderWidth: 1.5, flexDirection: 'row', gap: 12, minHeight: 66, paddingHorizontal: 13, paddingVertical: 10 },
  chooseCopy: { flex: 1 },
  chooseTitle: { fontSize: 15, fontWeight: '900' },
  chooseHint: { fontSize: 11, lineHeight: 15, marginTop: 2 },
  chevron: { fontSize: 30, fontWeight: '500', marginLeft: 2 },
  modalRoot: { flex: 1 },
  modalHeader: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', minHeight: 58, paddingHorizontal: 16 },
  headerButton: { minWidth: 62, paddingVertical: 10 },
  headerButtonText: { fontSize: 14, fontWeight: '700' },
  doneText: { fontSize: 14, fontWeight: '900', textAlign: 'right' },
  modalTitle: { fontSize: 16, fontWeight: '900' },
  modalContent: { alignSelf: 'center', maxWidth: 660, paddingBottom: 42, paddingHorizontal: 18, paddingTop: 18, width: '100%' },
  pressed: { opacity: 0.7 },
});
