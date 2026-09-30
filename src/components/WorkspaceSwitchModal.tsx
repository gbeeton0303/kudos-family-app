import { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { WorkspaceType } from '../cloud/types';
import type { AppTheme } from '../theme';

export function WorkspaceSwitchModal({ onCancel, onCreate, targetType, theme }: {
  onCancel: () => void;
  onCreate: (name: string) => Promise<void>;
  targetType: WorkspaceType | null;
  theme: AppTheme;
}) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const label = targetType === 'classroom' ? 'Classroom' : 'Family';

  useEffect(() => {
    if (targetType) setName('');
  }, [targetType]);

  const submit = async () => {
    if (!targetType || busy) return;
    if (name.trim().length < 2) {
      Alert.alert(`Enter A ${label} Name`, `Use at least two characters for your ${label.toLowerCase()} name.`);
      return;
    }
    setBusy(true);
    try {
      await onCreate(name.trim());
    } catch (error) {
      Alert.alert(`Could Not Create ${label}`, error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  return <Modal animationType="fade" onRequestClose={onCancel} transparent visible={Boolean(targetType)}>
    <SafeAreaView style={styles.overlay}>
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}> 
        <Text style={styles.icon}>{targetType === 'classroom' ? '🏫' : '👪'}</Text>
        <Text style={[styles.title, { color: theme.text }]}>Create Your {label}</Text>
        <Text style={[styles.description, { color: theme.textMuted }]}>Your {label.toLowerCase()} will have its own profiles, tasks, rewards, and progress. You can switch between workspaces from Settings.</Text>
        <TextInput autoCapitalize="words" autoFocus maxLength={80} onChangeText={setName} placeholder={`${label} name`} placeholderTextColor={theme.textMuted} style={[styles.input, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]} value={name} />
        <Pressable disabled={busy} onPress={() => void submit()} style={({ pressed }) => [styles.create, { backgroundColor: theme.primary }, (pressed || busy) && styles.pressed]}><Text style={styles.createText}>{busy ? 'Creating…' : `Create ${label}`}</Text></Pressable>
        <Pressable disabled={busy} onPress={onCancel} style={({ pressed }) => [styles.cancel, pressed && styles.pressed]}><Text style={[styles.cancelText, { color: theme.textMuted }]}>Not Now</Text></Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', backgroundColor: 'rgba(4, 27, 27, 0.58)', flex: 1, justifyContent: 'center', padding: 22 },
  card: { borderRadius: 28, borderWidth: 1, maxWidth: 480, padding: 24, width: '100%' },
  icon: { fontSize: 42, textAlign: 'center' },
  title: { fontSize: 24, fontWeight: '900', marginTop: 10, textAlign: 'center' },
  description: { fontSize: 14, lineHeight: 20, marginTop: 9, textAlign: 'center' },
  input: { borderRadius: 16, borderWidth: 1, fontSize: 16, marginTop: 22, minHeight: 54, paddingHorizontal: 16 },
  create: { alignItems: 'center', borderRadius: 17, marginTop: 14, minHeight: 54, justifyContent: 'center' },
  createText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  cancel: { alignItems: 'center', marginTop: 10, padding: 12 },
  cancelText: { fontSize: 14, fontWeight: '800' },
  pressed: { opacity: 0.65 },
});
