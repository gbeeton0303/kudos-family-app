import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
export function CloudLoadingScreen({ label = 'Connecting to Kudos Cloud…' }: { label?: string }) {
  return <View style={styles.root}><ActivityIndicator color="#0B756F" size="large" /><Text style={styles.text}>{label}</Text></View>;
}
const styles = StyleSheet.create({ root: { alignItems: 'center', backgroundColor: '#F4FBF8', flex: 1, justifyContent: 'center' }, text: { color: '#5F7475', fontSize: 14, fontWeight: '800', marginTop: 12 } });
