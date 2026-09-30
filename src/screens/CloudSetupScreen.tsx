import { Pressable, StyleSheet, Text, View } from 'react-native';

export function CloudSetupScreen({ onUseLocalDemo }: { onUseLocalDemo: () => void }) {
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.logo}>☁️</Text>
        <Text style={styles.eyebrow}>CLOUD SETUP REQUIRED</Text>
        <Text style={styles.title}>Connect Kudos To Supabase</Text>
        <Text style={styles.body}>Copy <Text style={styles.code}>.env.example</Text> to <Text style={styles.code}>.env</Text>, add your Supabase project URL and publishable key, deploy the included migrations and Edge Functions, then restart Expo.</Text>
        <View style={styles.steps}>
          <Text style={styles.step}>1. Create a Supabase project.</Text>
          <Text style={styles.step}>2. Run the commands in CLOUD_SETUP.md.</Text>
          <Text style={styles.step}>3. Add the two EXPO_PUBLIC variables.</Text>
        </View>
        {__DEV__ ? <Pressable onPress={onUseLocalDemo} style={styles.button}><Text style={styles.buttonText}>Open Developer Demo</Text></Pressable> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', backgroundColor: '#F4FBF8', flex: 1, justifyContent: 'center', padding: 22 },
  card: { backgroundColor: '#FFFFFF', borderColor: '#D5E9E4', borderRadius: 28, borderWidth: 1, maxWidth: 520, padding: 26, width: '100%' },
  logo: { fontSize: 42 }, eyebrow: { color: '#0B756F', fontSize: 12, fontWeight: '900', letterSpacing: 1.2, marginTop: 14 },
  title: { color: '#183437', fontSize: 28, fontWeight: '900', letterSpacing: -0.7, marginTop: 7 },
  body: { color: '#5F7475', fontSize: 15, lineHeight: 22, marginTop: 12 }, code: { color: '#045D59', fontWeight: '900' },
  steps: { backgroundColor: '#DDF5F1', borderRadius: 18, gap: 7, marginTop: 18, padding: 16 }, step: { color: '#315B5B', fontSize: 14, fontWeight: '700' },
  button: { alignItems: 'center', backgroundColor: '#0B756F', borderRadius: 17, marginTop: 20, padding: 16 }, buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },
});
