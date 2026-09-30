import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PRIVACY_URL, TERMS_URL } from '../legal';
import type { AppTheme } from '../theme';

export function InformationModal({ kind, visible, onClose, theme }: { kind: 'support' | 'privacy'; visible: boolean; onClose: () => void; theme: AppTheme }) {
  const privacy = kind === 'privacy';
  const openDocument = (url: string) => void Linking.openURL(url);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <ScrollView contentContainerStyle={styles.copy}>
            <Text style={[styles.eyebrow, { color: theme.primary }]}>{privacy ? 'PRIVACY & PERMISSIONS' : 'KUDOS SUPPORT'}</Text>
            <Text style={[styles.title, { color: theme.text }]}>{privacy ? 'Your family’s information' : 'How can we help?'}</Text>
            {privacy ? (
              <>
                <Text style={[styles.body, { color: theme.textMuted }]}>Kudos Family stores an adult’s account email and display name, family or classroom details, child names or nicknames, avatars, tasks, rewards, progress, and family activity when Kudos Cloud is used. A child account does not require a child email address.</Text>
                <Text style={[styles.heading, { color: theme.text }]}>Photos and notifications</Text>
                <Text style={[styles.body, { color: theme.textMuted }]}>Photos are optional, private to authorized family or classroom members, and used only where the adult selected them. The system photo picker exposes only the selected image. Camera and notification permissions are requested only when their related feature is used.</Text>
                <Text style={[styles.heading, { color: theme.text }]}>No advertising or tracking</Text>
                <Text style={[styles.body, { color: theme.textMuted }]}>Kudos Family does not sell personal information, show third-party advertising, or track people across other companies’ apps or websites.</Text>
                <Text style={[styles.heading, { color: theme.text }]}>Parent and child choices</Text>
                <Text style={[styles.body, { color: theme.textMuted }]}>Adults can edit or delete child profiles and can permanently delete the family cloud account from Settings → Account. A linked child can delete their own account and linked profile there. Adults can replace a lost child-device connection without deleting the child’s task or reward history.</Text>
                <Pressable accessibilityRole="link" onPress={() => openDocument(PRIVACY_URL)} style={[styles.documentButton, { backgroundColor: theme.primarySoft, borderColor: theme.primary }]}>
                  <Text style={[styles.documentButtonText, { color: theme.primary }]}>Open Privacy Policy ↗</Text>
                </Pressable>
                <Pressable accessibilityRole="link" onPress={() => openDocument(TERMS_URL)} style={[styles.documentButton, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                  <Text style={[styles.documentButtonText, { color: theme.text }]}>Open Terms of Service ↗</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.body, { color: theme.textMuted }]}>Visit the Kudos Family support page for help. Include your app version, device model, and a short description of what happened.</Text>
                <Text style={[styles.body, { color: theme.textMuted }]}>Never include your password, child invite code, or private family information in a support request.</Text>
              </>
            )}
          </ScrollView>
          <Pressable onPress={onClose} style={[styles.button, { backgroundColor: theme.primary }]}><Text style={styles.buttonText}>Done</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(16,35,37,0.55)', flex: 1, justifyContent: 'center', padding: 22 },
  card: { borderRadius: 24, borderWidth: 1, maxHeight: '82%', maxWidth: 520, padding: 18, width: '100%' },
  copy: { gap: 11, paddingBottom: 8 },
  eyebrow: { fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  title: { fontSize: 25, fontWeight: '900' },
  heading: { fontSize: 16, fontWeight: '900', marginTop: 4 },
  body: { fontSize: 14, lineHeight: 21 },
  documentButton: { alignItems: 'center', borderRadius: 14, borderWidth: 1, marginTop: 3, padding: 13 },
  documentButtonText: { fontSize: 13, fontWeight: '900' },
  button: { alignItems: 'center', borderRadius: 15, marginTop: 12, padding: 15 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '900' },
});
