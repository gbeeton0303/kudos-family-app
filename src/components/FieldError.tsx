import { StyleSheet, Text } from 'react-native';

export function FieldError({ message }: { message?: string }) {
  return message ? <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{message}</Text> : null;
}
const styles = StyleSheet.create({ error: { color: '#A52E38', fontSize: 12, lineHeight: 18 } });
