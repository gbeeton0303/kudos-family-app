import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useClassroomMode } from '../context/ClassroomModeContext';
import type { AppTheme } from '../theme';
import type { AppMode } from '../types';
import type { WorkspaceRole } from '../cloud/types';

type ModeHeaderProps = {
  mode: AppMode;
  pendingCount: number;
  childName?: string;
  childAccent?: string;
  childRewardCount?: number;
  cloudRole?: WorkspaceRole;
  theme: AppTheme;
  onChangeMode: (mode: AppMode) => void;
  onOpenNotifications: () => void;
  onSwitchChild: () => void;
};

export function ModeHeader({ mode, pendingCount, childName, childAccent, childRewardCount = 0, cloudRole, theme, onChangeMode, onOpenNotifications, onSwitchChild }: ModeHeaderProps) {
  const { teacherMode, terms } = useClassroomMode();
  return (
    <View style={[styles.wrap, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}> 
      {cloudRole === 'child' ? (
        <View style={[styles.teacherBadge, { backgroundColor: theme.primarySoft }]}>
          <Text style={styles.teacherIcon}>🧒</Text><View><Text style={[styles.teacherTitle, { color: childAccent ?? theme.primary }]}>Child Account</Text><Text style={[styles.teacherSubtitle, { color: theme.textMuted }]}>Cloud-Linked Profile</Text></View>
        </View>
      ) : teacherMode ? (
        <View style={[styles.teacherBadge, { backgroundColor: theme.primarySoft }]}>
          <Text style={styles.teacherIcon}>🏫</Text><View><Text style={[styles.teacherTitle, { color: theme.primary }]}>Teacher Mode</Text><Text style={[styles.teacherSubtitle, { color: theme.textMuted }]}>Classroom Workspace</Text></View>
        </View>
      ) : (
        <View style={[styles.segment, { backgroundColor: theme.surfaceMuted }]}> 
          {(['parent', 'child'] as const).map((item) => {
            const selected = mode === item;
            const selectedBackground = item === 'parent' ? theme.secondary : theme.primary;
            return (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected }}
                key={item}
                onPress={() => onChangeMode(item)}
                style={({ pressed }) => [
                  styles.modeButton,
                  selected && { backgroundColor: selectedBackground },
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.modeButtonContent}>
                  {item === 'parent' ? (
                    <Image
                      resizeMode="contain"
                      source={require('../../assets/branding/parent-mode-white-outline.png')}
                      style={[styles.parentModeIcon, !selected && styles.unselectedParentIcon]}
                    />
                  ) : (
                    <Image
                      resizeMode="contain"
                      source={require('../../assets/branding/child-mode-gold-clean.png')}
                      style={styles.childModeIcon}
                    />
                  )}
                  <Text style={[styles.modeText, { color: selected ? '#FFFFFF' : theme.textMuted }]}>
                    {item === 'parent' ? 'Parent Mode' : 'Child Mode'}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}

      {cloudRole !== 'child' && (mode === 'parent' || teacherMode) ? (
        <Pressable accessibilityLabel={`${pendingCount} pending approvals`} onPress={onOpenNotifications} style={({ pressed }) => [styles.notificationButton, { backgroundColor: pendingCount ? theme.rewardSoft : theme.surfaceMuted }, pressed && styles.pressed]}>
          <Text style={styles.bell}>🔔</Text>{pendingCount > 0 ? <View style={[styles.badge, { backgroundColor: theme.danger }]}><Text style={styles.badgeText}>{pendingCount > 9 ? '9+' : pendingCount}</Text></View> : null}
        </Pressable>
      ) : (
        <Pressable onPress={onSwitchChild} style={({ pressed }) => [styles.childButton, { backgroundColor: theme.primarySoft }, pressed && styles.pressed]}>
          <Text numberOfLines={1} style={[styles.childText, { color: childAccent ?? theme.primary }]}>{childName ? `${childName} ▾` : `Choose ${terms.profileLower}`}</Text>
          {childRewardCount > 0 ? <View style={[styles.giftBadge, { backgroundColor: theme.reward }]}><Text style={styles.giftBadgeText}>🎁 {childRewardCount}</Text></View> : null}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', borderRadius: 19, borderWidth: 1, flexDirection: 'row', gap: 9, marginBottom: 16, padding: 7, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.05, shadowRadius: 14, elevation: 1 },
  segment: { borderRadius: 14, flex: 1, flexDirection: 'row', padding: 3 },
  modeButton: { alignItems: 'center', borderRadius: 11, flex: 1, paddingHorizontal: 6, paddingVertical: 9 },
  modeButtonContent:{alignItems:'center',flexDirection:'row',gap:6,justifyContent:'center'},
  modeText: { fontSize: 12, fontWeight: '900' },
  parentModeIcon:{height:20,width:20},
  unselectedParentIcon:{opacity:0.62},
  childModeIcon:{height:20,width:20},
  teacherBadge: { alignItems: 'center', borderRadius: 14, flex: 1, flexDirection: 'row', gap: 10, minHeight: 46, paddingHorizontal: 13 }, teacherIcon: { fontSize: 22 }, teacherTitle: { fontSize: 13, fontWeight: '900' }, teacherSubtitle: { fontSize: 11, fontWeight: '700', marginTop: 1 },
  notificationButton: { alignItems: 'center', borderRadius: 14, height: 40, justifyContent: 'center', width: 43 }, bell: { fontSize: 18 }, badge: { alignItems: 'center', borderRadius: 999, height: 18, justifyContent: 'center', position: 'absolute', right: -3, top: -4, minWidth: 18, paddingHorizontal: 4 }, badgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  childButton: { alignItems: 'center', borderRadius: 14, flexDirection: 'row', gap: 6, justifyContent: 'center', minHeight: 40, paddingHorizontal: 12 }, childText: { fontSize: 12, fontWeight: '900', maxWidth: 100 }, giftBadge: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 4 }, giftBadgeText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' }, pressed: { opacity: 0.72 },
});
