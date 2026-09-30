import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { createWorkspace } from '../cloud/workspaces';
import type { WorkspaceType } from '../cloud/types';

export function WorkspaceOnboardingScreen({ onComplete, onSignOut }: { onComplete: () => void; onSignOut: () => void }) {
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceType, setWorkspaceType] = useState<WorkspaceType>('family');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!workspaceName.trim()) return Alert.alert(workspaceType === 'classroom' ? 'Name Your Classroom' : 'Name Your Family', workspaceType === 'classroom' ? 'Enter a classroom name.' : 'Enter a family name.');
    setBusy(true);
    try {
      await createWorkspace(workspaceName, workspaceType);
      onComplete();
    } catch (error) { Alert.alert('Could Not Create Workspace', error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Welcome</Text>
          <Pressable accessibilityRole="button" onPress={onSignOut}><Text style={styles.signOut}>Sign out</Text></Pressable>
        </View>
        <Text style={styles.subtitle}>Create your own family or classroom.</Text>
        <View style={styles.typeRow}>
          {(['family', 'classroom'] as const).map((type) => <Pressable key={type} onPress={() => setWorkspaceType(type)} style={[styles.typeButton, workspaceType === type && styles.typeButtonActive]}><Text style={styles.typeEmoji}>{type === 'family' ? '👪' : '🏫'}</Text><Text style={[styles.typeText, workspaceType === type && styles.typeTextActive]}>{type === 'family' ? 'Family' : 'Classroom'}</Text></Pressable>)}
        </View>
        <TextInput onChangeText={setWorkspaceName} placeholder={workspaceType === 'classroom' ? 'Example: Room 12' : 'Example: The Beeton Family'} placeholderTextColor="#9694A7" style={styles.input} value={workspaceName} />
        <Pressable disabled={busy} onPress={() => void create()} style={[styles.primary, busy && styles.disabled]}><Text style={styles.primaryText}>{busy ? 'Connecting…' : `Create ${workspaceType}`}</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', backgroundColor: '#F4FBF8', flex: 1, justifyContent: 'center', padding: 22 }, card: { backgroundColor: '#FFF', borderColor: '#D5E9E4', borderRadius: 28, borderWidth: 1, maxWidth: 540, padding: 26, width: '100%' },
  headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' }, title: { color: '#183437', fontSize: 30, fontWeight: '900', letterSpacing: -0.8 }, subtitle: { color: '#5F7475', fontSize: 15, lineHeight: 20, marginTop: 8 },
  typeRow: { flexDirection: 'row', gap: 12, marginTop: 26 }, typeButton: { alignItems: 'center', backgroundColor: '#EDF7F3', borderColor: '#D5E9E4', borderRadius: 20, borderWidth: 1, flex: 1, paddingVertical: 20 }, typeButtonActive: { backgroundColor: '#DDF5F1', borderColor: '#0B756F' }, typeEmoji: { fontSize: 30 }, typeText: { color: '#5F7475', fontSize: 14, fontWeight: '900', marginTop: 7 }, typeTextActive: { color: '#0B756F' },
  input: { backgroundColor: '#F4FBF8', borderColor: '#D5E9E4', borderRadius: 15, borderWidth: 1, color: '#183437', fontSize: 15, marginTop: 20, minHeight: 54, paddingHorizontal: 14 }, primary: { alignItems: 'center', backgroundColor: '#0B756F', borderRadius: 16, marginTop: 13, padding: 17 }, primaryText: { color: '#FFF', fontSize: 14, fontWeight: '900', textTransform: 'capitalize' },
  signOut: { color: '#D85C67', fontSize: 12, fontWeight: '800' }, disabled: { opacity: 0.58 },
});
