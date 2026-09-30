import { StyleSheet, Text, View } from 'react-native';
import type { AppTheme } from '../theme';
import { toDisplayTitle } from '../utils/titleCase';

type ScreenHeaderProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  theme: AppTheme;
};

export function ScreenHeader({ eyebrow, title, subtitle, theme }: ScreenHeaderProps) {
  return (
    <View style={styles.container}>
      <Text style={[styles.eyebrow, { color: theme.primary }]}>{eyebrow}</Text>
      <Text adjustsFontSizeToFit minimumFontScale={0.72} numberOfLines={2} style={[styles.title, { color: theme.text }]}>{toDisplayTitle(title)}</Text>
      <Text style={[styles.subtitle, { color: theme.textMuted }]}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 7,
    marginBottom: 22,
  },
  eyebrow: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 1.35,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1.05,
    lineHeight: 36,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    maxWidth: 580,
  },
});
