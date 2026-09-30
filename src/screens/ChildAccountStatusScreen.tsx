import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

export function ChildAccountStatusScreen({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <View style={styles.root}>
      <Image resizeMode="contain" source={require('../../assets/branding/kudos-star-laurel.png')} style={styles.logo} />
      <View style={styles.card}>
        <Text style={styles.title}>Opening your profile</Text>
        <Text style={styles.body}>{error ?? 'Kudos is securely connecting this child account to its personal profile.'}</Text>
        <Pressable onPress={onRetry} style={styles.primary}><Text style={styles.primaryText}>Try again</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', backgroundColor: '#F4FBF8', flex: 1, justifyContent: 'center', padding: 24 },
  logo: { height: 90, marginBottom: 18, width: 90 },
  card: { backgroundColor: '#FFFFFF', borderColor: '#D5E9E4', borderRadius: 24, borderWidth: 1, maxWidth: 480, padding: 24, width: '100%' },
  title: { color: '#183437', fontSize: 25, fontWeight: '900', textAlign: 'center' },
  body: { color: '#5F7475', fontSize: 14, lineHeight: 21, marginTop: 10, textAlign: 'center' },
  primary: { alignItems: 'center', backgroundColor: '#2F9E91', borderRadius: 15, marginTop: 20, padding: 15 },
  primaryText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
