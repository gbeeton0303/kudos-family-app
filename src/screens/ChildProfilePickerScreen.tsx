import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { ProfileAvatar } from '../components/ProfileAvatar';
import type { AppTheme } from '../theme';
import { getProfileAccent } from '../data/profileStyles';
import type { ChildProfile, RewardDelivery } from '../types';
import { createProfileInvite } from '../cloud/workspaces';

type ChildProfilePickerScreenProps = {
  profiles: ChildProfile[];
  rewardDeliveries: RewardDelivery[];
  theme: AppTheme;
  onSelect: (profileId: string) => void;
  onReturnToParent: () => void;
};

type InviteResult = { code: string; expires_at: string; profile_id: string };

export function ChildProfilePickerScreen({ profiles, rewardDeliveries, theme, onSelect, onReturnToParent }: ChildProfilePickerScreenProps) {
  const [childCodeVisible, setChildCodeVisible] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [invite, setInvite] = useState<InviteResult | null>(null);
  const [generating, setGenerating] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const closeChildCode = () => {
    setChildCodeVisible(false);
    setSelectedProfileId(null);
    setInvite(null);
    setCodeError(null);
  };

  const generateCode = async () => {
    if (!selectedProfileId || generating) return;
    setGenerating(true);
    setCodeError(null);
    try {
      const result = await createProfileInvite(selectedProfileId);
      setInvite(result);
    } catch (error) {
      setCodeError(error instanceof Error ? error.message : 'Kudos could not create a child code. Make sure this family is connected to Kudos Cloud.');
    } finally {
      setGenerating(false);
    }
  };

  const selectedProfile = profiles.find((profile) => profile.id === selectedProfileId) ?? null;

  const shareCode = async () => {
    if (!invite || !selectedProfile) return;
    await Share.share({
      message: `${selectedProfile.name}'s Kudos Child Code is ${invite.code}. Enter this code on the child's other device to connect to Child Mode.`,
      title: 'Kudos Child Code',
    });
  };

  return (
    <View>
      <View style={[styles.hero, { backgroundColor: theme.primarySoft }]}>
        <Pressable onPress={() => setChildCodeVisible(true)} style={[styles.childCodeButton, { backgroundColor: theme.surface, borderColor: theme.primary }]}>
          <Text style={[styles.childCodeButtonText, { color: theme.primary }]}>Child Code</Text>
        </Pressable>
        <Text style={styles.emoji}>🌈</Text>
        <Text style={[styles.title, { color: theme.text }]}>Who Is Using Kudos?</Text>
        <Text style={[styles.subtitle, { color: theme.textMuted }]}>Choose A Profile To Enter Child Mode. Children Can View Goals And Submit Completed Tasks For Parent Approval.</Text>
      </View>
      <View style={styles.grid}>
        {profiles.map((profile) => {
          const giftCount = rewardDeliveries.filter((delivery) => delivery.profileId === profile.id && delivery.status === 'waiting').length;
          return (
            <Pressable key={profile.id} onPress={() => onSelect(profile.id)} style={({ pressed }) => [styles.card, { backgroundColor: theme.surface, borderColor: giftCount ? theme.reward : theme.border }, pressed && styles.pressed]}>
              {giftCount > 0 ? <View style={[styles.giftBadge, { backgroundColor: theme.reward }]}><Text style={styles.giftBadgeText}>🎁 {giftCount}</Text></View> : null}
              <ProfileAvatar avatar={profile.avatar} size={82} theme={theme} />
              <Text style={[styles.name, { color: getProfileAccent(profile.colorKey) }]}>{profile.name}</Text>
              <Text style={[styles.enter, { color: giftCount ? theme.reward : theme.primary }]}>{giftCount ? 'Open your reward →' : 'Open profile →'}</Text>
            </Pressable>
          );
        })}
      </View>
      {profiles.length === 0 ? (
        <View style={[styles.empty, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={styles.emptyIcon}>👪</Text>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No Child Profiles Yet</Text>
          <Text style={[styles.emptyText, { color: theme.textMuted }]}>Return to Parent Mode and create a profile first.</Text>
          <Pressable onPress={onReturnToParent} style={[styles.parentButton, { backgroundColor: theme.primary }]}><Text style={styles.parentButtonText}>Go To Parent Mode</Text></Pressable>
        </View>
      ) : null}

      <Modal animationType="fade" onRequestClose={closeChildCode} transparent visible={childCodeVisible}>
        <Pressable onPress={closeChildCode} style={styles.modalBackdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={[styles.codeCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Pressable accessibilityLabel="Close child code" onPress={closeChildCode} style={[styles.closeButton, { backgroundColor: theme.surfaceMuted }]}>
              <Text style={[styles.closeText, { color: theme.text }]}>×</Text>
            </Pressable>
            <Text style={styles.codeIcon}>🔐</Text>
            <Text style={[styles.codeTitle, { color: theme.text }]}>Create A Child Code</Text>
            <Text style={[styles.codeSubtitle, { color: theme.textMuted }]}>Choose a child profile, then share the generated code with the child's other device.</Text>

            {!invite ? (
              <>
                <View style={styles.profileOptions}>
                  {profiles.map((profile) => {
                    const selected = profile.id === selectedProfileId;
                    return (
                      <Pressable key={profile.id} onPress={() => { setSelectedProfileId(profile.id); setCodeError(null); }} style={[styles.codeProfile, { backgroundColor: selected ? theme.primarySoft : theme.surfaceMuted, borderColor: selected ? theme.primary : theme.border }]}>
                        <ProfileAvatar avatar={profile.avatar} size={42} theme={theme} />
                        <Text style={[styles.codeProfileName, { color: selected ? theme.primary : theme.text }]}>{profile.name}</Text>
                        <Text style={[styles.codeCheck, { color: selected ? theme.primary : theme.textMuted }]}>{selected ? '✓' : '○'}</Text>
                      </Pressable>
                    );
                  })}
                </View>
                {codeError ? <Text style={[styles.codeError, { color: theme.danger }]}>{codeError}</Text> : null}
                <View style={styles.codeActions}>
                  <Pressable onPress={closeChildCode} style={[styles.cancelButton, { backgroundColor: theme.surfaceMuted }]}><Text style={[styles.cancelText, { color: theme.text }]}>Cancel</Text></Pressable>
                  <Pressable disabled={!selectedProfileId || generating} onPress={() => void generateCode()} style={[styles.generateButton, { backgroundColor: selectedProfileId ? theme.primary : theme.border }]}>
                    {generating ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.generateText}>Generate Code</Text>}
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.codeFor, { color: theme.textMuted }]}>Child code for {selectedProfile?.name}</Text>
                <View style={[styles.codeBox, { backgroundColor: theme.primarySoft, borderColor: theme.primary }]}>
                  <Text selectable style={[styles.codeValue, { color: theme.primary }]}>{invite.code}</Text>
                </View>
                <Text style={[styles.expiryText, { color: theme.textMuted }]}>This code expires in 7 days and can be entered on another device to connect directly to this Child Mode profile.</Text>
                <View style={styles.codeActions}>
                  <Pressable onPress={closeChildCode} style={[styles.cancelButton, { backgroundColor: theme.surfaceMuted }]}><Text style={[styles.cancelText, { color: theme.text }]}>Done</Text></Pressable>
                  <Pressable onPress={() => void shareCode()} style={[styles.generateButton, { backgroundColor: theme.primary }]}><Text style={styles.generateText}>Share Code</Text></Pressable>
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', borderRadius: 28, marginBottom: 18, padding: 25, position: 'relative' },
  childCodeButton:{borderRadius:999,borderWidth:1.5,paddingHorizontal:11,paddingVertical:8,position:'absolute',right:12,top:12,zIndex:3},
  childCodeButtonText:{fontSize:11,fontWeight:'900'},
  emoji: { fontSize: 42 },
  title: { fontSize: 25, fontWeight: '900', marginTop: 10, textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 18, marginTop: 8, maxWidth: 470, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { alignItems: 'center', borderRadius: 23, borderWidth: 1, flexBasis: 155, flexGrow: 1, gap: 8, padding: 20, position: 'relative' },
  giftBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 5, position: 'absolute', right: 10, top: 10, zIndex: 2 },
  giftBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  name: { fontSize: 16, fontWeight: '900' },
  enter: { fontSize: 12, fontWeight: '900' },
  empty: { alignItems: 'center', borderRadius: 23, borderWidth: 1, padding: 28 },
  emptyIcon: { fontSize: 38 },
  emptyTitle: { fontSize: 17, fontWeight: '900', marginTop: 8 },
  emptyText: { fontSize: 13, marginTop: 5, textAlign: 'center' },
  parentButton: { borderRadius: 15, marginTop: 16, paddingHorizontal: 16, paddingVertical: 12 },
  parentButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  modalBackdrop:{alignItems:'center',backgroundColor:'rgba(18,18,30,0.42)',flex:1,justifyContent:'center',padding:22},
  codeCard:{borderRadius:28,borderWidth:1,maxWidth:420,padding:22,paddingTop:28,position:'relative',width:'100%'},
  closeButton:{alignItems:'center',borderRadius:999,height:32,justifyContent:'center',position:'absolute',right:12,top:12,width:32,zIndex:4},
  closeText:{fontSize:22,fontWeight:'800',lineHeight:23},
  codeIcon:{fontSize:30,textAlign:'center'},
  codeTitle:{fontSize:21,fontWeight:'900',marginTop:5,textAlign:'center'},
  codeSubtitle:{fontSize:13,lineHeight:18,marginTop:7,textAlign:'center'},
  profileOptions:{gap:8,marginTop:18},
  codeProfile:{alignItems:'center',borderRadius:18,borderWidth:1,flexDirection:'row',gap:10,padding:10},
  codeProfileName:{flex:1,fontSize:14,fontWeight:'900'},
  codeCheck:{fontSize:18,fontWeight:'900'},
  codeError:{fontSize:12,lineHeight:16,marginTop:10,textAlign:'center'},
  codeActions:{flexDirection:'row',gap:9,marginTop:18},
  cancelButton:{alignItems:'center',borderRadius:16,flex:1,paddingVertical:12},
  cancelText:{fontSize:13,fontWeight:'900'},
  generateButton:{alignItems:'center',borderRadius:16,flex:1,minHeight:44,justifyContent:'center',paddingVertical:12},
  generateText:{color:'#FFFFFF',fontSize:13,fontWeight:'900'},
  codeFor:{fontSize:12,fontWeight:'800',marginTop:20,textAlign:'center'},
  codeBox:{borderRadius:20,borderWidth:1.5,marginTop:8,paddingHorizontal:16,paddingVertical:18},
  codeValue:{fontSize:29,fontWeight:'900',letterSpacing:5,textAlign:'center'},
  expiryText:{fontSize:12,lineHeight:17,marginTop:10,textAlign:'center'},
  pressed: { opacity: 0.72 },
});
