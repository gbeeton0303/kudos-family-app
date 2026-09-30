import { StyleSheet, View } from 'react-native';
import type { ProfilePattern } from '../types';

type ProfilePatternOverlayProps = {
  pattern: ProfilePattern;
  color: string;
};

export function ProfilePatternOverlay({ pattern, color }: ProfilePatternOverlayProps) {
  if (pattern === 'solid') return null;

  if (pattern === 'striped') {
    return (
      <View pointerEvents="none" style={StyleSheet.absoluteFill}>
        {Array.from({ length: 42 }, (_, index) => (
          <View
            key={index}
            style={[
              styles.stripe,
              {
                backgroundColor: color,
                left: index * 40 - 260,
                opacity: 0.11,
              },
            ]}
          />
        ))}
      </View>
    );
  }

  const dotPositions = [
    [4,14,8],[12,72,7],[18,38,9],[25,88,6],[31,18,7],[38,58,8],
    [44,7,6],[49,82,9],[55,31,7],[60,66,6],[67,14,9],[72,47,7],
    [78,86,8],[84,26,6],[90,62,9],[8,49,6],[15,91,8],[23,61,6],
    [34,43,8],[42,93,7],[51,52,6],[58,4,8],[64,79,7],[70,34,6],
    [81,54,7],[88,8,8],[93,40,6],[95,82,8],[28,4,6],[76,69,6],
  ] as const;

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dotField]}>
      {dotPositions.map(([top, left, size], index) => (
        <View
          key={index}
          style={[
            styles.dot,
            {
              backgroundColor: color,
              height: size,
              left: `${left}%`,
              opacity: index % 4 === 0 ? 0.18 : 0.11,
              top: `${top}%`,
              width: size,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stripe: {
    height: 760,
    position: 'absolute',
    top: -260,
    transform: [{ rotate: '28deg' }],
    width: 19,
  },
  dotField: {
    overflow: 'hidden',
  },
  dot: {
    borderRadius: 999,
    position: 'absolute',
  },
});
