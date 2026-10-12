import { StyleSheet, View } from 'react-native';
import { CachedAssetImage } from './CachedAssetImage';
import type { AppTheme } from '../theme';

type CategoryIconProps = {
  kind: 'task' | 'reward';
  size?: number;
  backgroundColor?: string;
  theme: AppTheme;
};

const SOURCES = {
  task: require('../../assets/category/tasks.png'),
  reward: require('../../assets/category/rewards.png'),
} as const;

export function CategoryIcon({ kind, size = 48, backgroundColor, theme }: CategoryIconProps) {
  const radius = Math.round(size * 0.31);
  return (
    <View
      accessibilityLabel={kind === 'task' ? 'Tasks' : 'Rewards'}
      style={[
        styles.container,
        {
          backgroundColor: backgroundColor ?? theme.surfaceMuted,
          borderRadius: radius,
          height: size,
          width: size,
        },
      ]}
    >
      <CachedAssetImage
        resizeMode="contain"
        source={SOURCES[kind]}
        style={[styles.image, { height: size * 0.88, width: size * 0.88 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    alignSelf: 'center',
  },
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
