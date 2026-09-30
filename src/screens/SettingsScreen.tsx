import { Image, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { ScreenHeader } from '../components/ScreenHeader';
import { useClassroomMode } from '../context/ClassroomModeContext';
import type { WorkspaceAccess } from '../cloud/types';
import type { AppTheme } from '../theme';
import { toDisplayTitle } from '../utils/titleCase';

type SettingsScreenProps = {
  notificationsEnabled: boolean;
  hapticsEnabled: boolean;
  teacherModeEnabled: boolean;
  workspaceSwitchingEnabled?: boolean;
  cloudAccess?: WorkspaceAccess | null;
  cloudEmail?: string;
  onNotificationsChange: (value: boolean) => void;
  onHapticsChange: (value: boolean) => void;
  onTeacherModeChange: (value: boolean) => void;
  onOpenCloudAccount?: () => void;
  onOpenAppearance: () => void;
  onOpenFamilyAccount: () => void;
  onOpenTutorial: () => void;
  onOpenSupport: () => void;
  onOpenPrivacy: () => void;
  onOpenFailedSyncChanges?: () => void;
  onResetCloudSync?: () => void;
  failedSyncCount?: number;
  appearanceLabel: string;
  onOpenLifetimeUpgrade?: () => void;
  showTrialUpgrade?: boolean;
  theme: AppTheme;
};

type SettingRowProps = { icon: string; label: string; description: string; value: boolean; disabled?: boolean; onValueChange: (value: boolean) => void; theme: AppTheme };

function SettingRow({ icon, label, description, value, disabled, onValueChange, theme }: SettingRowProps) {
  return <View style={[styles.row, { borderBottomColor: theme.border }, disabled && styles.disabled]}><View style={[styles.settingIcon, { backgroundColor: theme.primarySoft }]}><Text style={styles.settingEmoji}>{icon}</Text></View><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: theme.text }]}>{toDisplayTitle(label)}</Text><Text style={[styles.rowDescription, { color: theme.textMuted }]}>{description}</Text></View><Switch accessibilityLabel={label} disabled={disabled} ios_backgroundColor={theme.surfaceMuted} onValueChange={onValueChange} thumbColor={value ? theme.primary : undefined} trackColor={{ false: theme.surfaceMuted, true: theme.primarySoft }} value={value} /></View>;
}

function MenuRow({ icon, label, description, value, theme, onPress }: { icon: string; label: string; description: string; value?: string; theme: AppTheme; onPress?: () => void }) {
  const content = <><View style={[styles.settingIcon, { backgroundColor: theme.surfaceMuted }]}><Text style={styles.settingEmoji}>{icon}</Text></View><View style={styles.rowCopy}><Text style={[styles.rowTitle, { color: theme.text }]}>{toDisplayTitle(label)}</Text><Text style={[styles.rowDescription, { color: theme.textMuted }]}>{description}</Text></View>{value ? <Text style={[styles.valueText, { color: theme.textMuted }]}>{value}</Text> : null}<Text style={[styles.chevron, { color: theme.textMuted }]}>›</Text></>;
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => [styles.menuRow, { borderBottomColor: theme.border }, pressed && styles.pressed]}>{content}</Pressable> : <View style={[styles.menuRow, { borderBottomColor: theme.border }]}>{content}</View>;
}

export function SettingsScreen({ notificationsEnabled, hapticsEnabled, teacherModeEnabled, workspaceSwitchingEnabled = false, cloudAccess, cloudEmail, onNotificationsChange, onHapticsChange, onTeacherModeChange, onOpenCloudAccount, onOpenAppearance, onOpenFamilyAccount, onOpenTutorial, onOpenSupport, onOpenPrivacy, onOpenFailedSyncChanges, onResetCloudSync, failedSyncCount = 0, appearanceLabel, onOpenLifetimeUpgrade, showTrialUpgrade = false, theme }: SettingsScreenProps) {
  const { teacherMode, terms } = useClassroomMode();
  const cloudLabel = cloudAccess ? `${cloudAccess.role} · Cloud synced` : 'Local only';
  return <View><ScreenHeader eyebrow={`${terms.adult} controls`} title={`${terms.group} settings`} subtitle={`Manage reminders, celebrations, access, and the experience used for your ${terms.workspaceLower}.`} theme={theme} />
    {showTrialUpgrade && onOpenLifetimeUpgrade ? <Pressable accessibilityHint="Opens the lifetime access purchase page" accessibilityRole="button" onPress={onOpenLifetimeUpgrade} style={({ pressed }) => [styles.upgradeBanner, { backgroundColor: theme.rewardSoft, borderColor: theme.reward }, pressed && styles.pressed]}>
      <View style={[styles.upgradeIconFrame, { backgroundColor: theme.surface, borderColor: theme.reward }]}><Image accessibilityLabel="Reward trophy" resizeMode="contain" source={require('../../assets/category/rewards.png')} style={styles.upgradeIcon} /></View>
      <View style={styles.upgradeCopy}><Text style={[styles.upgradeTitle, { color: theme.text }]}>Upgrade to lifetime access now!</Text><Text style={[styles.upgradeDescription, { color: theme.textMuted }]}>Keep every profile and all progress with one lifetime purchase.</Text></View>
      <Text style={[styles.upgradeChevron, { color: theme.reward }]}>›</Text>
    </Pressable> : null}
    <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>EXPERIENCE</Text><View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <SettingRow description={workspaceSwitchingEnabled ? (teacherModeEnabled ? 'Switch back to your separate family workspace.' : 'Switch to your separate classroom workspace.') : 'Switch to classroom terminology, school colors, and teacher-focused samples.'} icon="🏫" label="Teacher Mode" onValueChange={onTeacherModeChange} theme={theme} value={teacherModeEnabled} />
      <SettingRow description="Register this device for task approvals and reward-delivery alerts." icon="🔔" label={`${terms.adult} notifications`} onValueChange={onNotificationsChange} theme={theme} value={notificationsEnabled} />
      <SettingRow description="Use subtle feedback when celebrating a win." icon="🎉" label="Celebration feedback" onValueChange={onHapticsChange} theme={theme} value={hapticsEnabled} />
      <MenuRow description="Choose system, light, or dark appearance." icon="◐" label="Appearance" onPress={onOpenAppearance} theme={theme} value={appearanceLabel} />
    </View>
    <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>{teacherMode ? 'CLASSROOM & CLOUD' : 'FAMILY & CLOUD'}</Text><View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <MenuRow description={cloudAccess ? `${cloudEmail ?? ''} · ${cloudAccess.workspaceName}` : `Manage account details and ${terms.workspaceLower} access.`} icon={teacherMode ? '🏫' : '👪'} label="Account" onPress={onOpenCloudAccount ?? onOpenFamilyAccount} theme={theme} value={cloudLabel} />
      <MenuRow description="Replay the six-step parent guide at any time." icon="🧭" label="App Tutorial" onPress={onOpenTutorial} theme={theme} />
      <MenuRow description="Get help and find the information to include with a support request." icon="?" label="Support" onPress={onOpenSupport} theme={theme} />
      <MenuRow description="Review the data and device permissions used by Kudos." icon="🛡️" label="Privacy & permissions" onPress={onOpenPrivacy} theme={theme} />
    </View>
    {cloudAccess ? <><Text style={[styles.sectionLabel, { color: theme.textMuted }]}>KUDOS CLOUD</Text><View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <MenuRow description={failedSyncCount ? `${failedSyncCount} cloud change${failedSyncCount === 1 ? '' : 's'} need review.` : 'Review rejected cloud changes or confirm everything is synchronized.'} icon="⚠️" label="Failed Sync Changes" onPress={onOpenFailedSyncChanges} theme={theme} value={failedSyncCount ? String(failedSyncCount) : 'None'} />
      <MenuRow description="Discard unsynced device changes, clear stale sync state, and reload this workspace from Kudos Cloud." icon="↻" label="Reset Cloud Sync" onPress={onResetCloudSync} theme={theme} />
    </View></> : null}

  </View>;
}

const styles = StyleSheet.create({ sectionLabel: { fontSize: 12, fontWeight: '900', letterSpacing: 1.2, marginBottom: 8, marginLeft: 3, marginTop: 5 }, card: { borderRadius: 23, borderWidth: 1, marginBottom: 22, overflow: 'hidden', paddingHorizontal: 18 }, upgradeBanner: { alignItems: 'center', borderRadius: 22, borderWidth: 2, flexDirection: 'row', gap: 12, marginBottom: 17, marginTop: -4, minHeight: 82, paddingHorizontal: 14, paddingVertical: 12 }, upgradeIconFrame: { alignItems: 'center', borderRadius: 17, borderWidth: 1, height: 54, justifyContent: 'center', width: 54 }, upgradeIcon: { height: 48, width: 48 }, upgradeCopy: { flex: 1, gap: 3 }, upgradeTitle: { fontSize: 15, fontWeight: '900', lineHeight: 19 }, upgradeDescription: { fontSize: 12, lineHeight: 16 }, upgradeChevron: { fontSize: 29, fontWeight: '700', lineHeight: 31 }, row: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 86, paddingVertical: 15 }, menuRow: { alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', gap: 12, minHeight: 82, paddingVertical: 14 }, settingIcon: { alignItems: 'center', borderRadius: 14, height: 43, justifyContent: 'center', width: 43 }, settingEmoji: { fontSize: 19 }, rowCopy: { flex: 1, gap: 3 }, rowTitle: { fontSize: 15, fontWeight: '900' }, rowDescription: { fontSize: 13, lineHeight: 16 }, valueText: { fontSize: 12, fontWeight: '700', maxWidth: 88, textAlign: 'right', textTransform: 'capitalize' }, chevron: { fontSize: 23, lineHeight: 25, marginLeft: -4 }, aboutCard: { alignItems: 'center', borderRadius: 20, flexDirection: 'row', gap: 13, padding: 17 }, aboutIcon: { alignItems: 'center', borderRadius: 14, height: 45, justifyContent: 'center', width: 45 }, aboutStar: { color: '#FFFFFF', fontSize: 19 }, aboutCopy: { flex: 1, gap: 3 }, aboutTitle: { fontSize: 14, fontWeight: '900' }, aboutText: { fontSize: 12, lineHeight: 15 }, disabled: { opacity: 0.58 }, pressed: { opacity: 0.68 } });
