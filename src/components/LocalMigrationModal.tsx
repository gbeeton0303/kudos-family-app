import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { FamilyState } from '../types';
import type { AppTheme } from '../theme';

export function LocalMigrationModal({ state, visible, theme, onImport, onSkip }: { state: FamilyState | null; visible: boolean; theme: AppTheme; onImport: () => Promise<void>; onSkip: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  if (!state) return null;
  const importNow = async () => { setBusy(true); try { await onImport(); } catch (error) { Alert.alert('Import Failed', error instanceof Error ? error.message : String(error)); } finally { setBusy(false); } };
  return <Modal animationType="fade" transparent visible={visible}><View style={styles.overlay}><View style={[styles.card, { backgroundColor: theme.surface }]}><Text style={styles.icon}>☁️</Text><Text style={[styles.title, { color: theme.text }]}>Upload Your Existing Kudos Data?</Text><Text style={[styles.body, { color: theme.textMuted }]}>We found {state.profiles.length} profiles, {state.tasks.length} tasks, and {state.rewards.length} rewards saved on this device. Import them once so they appear on every signed-in device.</Text><Pressable disabled={busy} onPress={() => void importNow()} style={[styles.primary, { backgroundColor: theme.primary }]}><Text style={styles.primaryText}>{busy ? 'Uploading…' : 'Upload to cloud'}</Text></Pressable><Pressable disabled={busy} onPress={() => void onSkip()} style={styles.skip}><Text style={[styles.skipText, { color: theme.textMuted }]}>Start with an empty cloud workspace</Text></Pressable></View></View></Modal>;
}
const styles = StyleSheet.create({ overlay: { alignItems: 'center', backgroundColor: 'rgba(18,18,32,.55)', flex: 1, justifyContent: 'center', padding: 22 }, card: { borderRadius: 27, maxWidth: 500, padding: 25, width: '100%' }, icon: { fontSize: 38 }, title: { fontSize: 24, fontWeight: '900', letterSpacing: -0.6, marginTop: 11 }, body: { fontSize: 14, lineHeight: 19, marginTop: 9 }, primary: { alignItems: 'center', borderRadius: 16, marginTop: 20, padding: 15 }, primaryText: { color: '#FFF', fontSize: 14, fontWeight: '900' }, skip: { alignItems: 'center', padding: 14 }, skipText: { fontSize: 12, fontWeight: '800' } });
