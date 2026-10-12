import { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import type { WorkspaceAccess } from '../cloud/types';
import { alternativeManagerWorkspaces } from '../cloud/workspaceNavigation';
import type { AppTheme } from '../theme';

export function PurchaseWorkspaceSwitcher({ access, workspaces, onSelect, disabled, theme }: {
  access: WorkspaceAccess; workspaces: WorkspaceAccess[];
  onSelect: (id: string) => Promise<void>; disabled?: boolean; theme: AppTheme;
}) {
  const [switching, setSwitching] = useState(false);
  const running = useRef(false);
  const alternatives = alternativeManagerWorkspaces(access, workspaces);
  if (!alternatives.length) return null;
  const select = async (id: string) => {
    if (disabled || running.current) return;
    running.current = true;
    setSwitching(true);
    try { await onSelect(id); }
    catch (error) { Alert.alert('Could Not Switch Workspace', error instanceof Error ? error.message : String(error)); }
    finally { running.current = false; setSwitching(false); }
  };
  return <View style={styles.card}>
    {alternatives.map((item) => <Pressable accessibilityRole="button" accessibilityLabel={`Back to ${item.workspaceName}`} key={item.workspaceId} disabled={disabled || switching} onPress={() => void select(item.workspaceId)} style={[styles.button, { backgroundColor: theme.surface, borderColor: theme.border }, (disabled || switching) && { opacity: 0.5 }]}>
      <Text style={[styles.label, { color: theme.primary }]}>{switching ? 'Switching…' : '‹ Back'}</Text>
    </Pressable>)}
  </View>;
}
const styles = StyleSheet.create({ card: { alignItems: 'flex-start', gap: 8, marginBottom: 14, width: '100%' }, button: { borderWidth: 1, borderRadius: 10, minHeight: 44, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 14 }, label: { fontSize: 14, fontWeight: '800' } });
