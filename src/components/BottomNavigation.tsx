import { Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppTheme } from '../theme';
import type { SectionKey } from '../types';
const settingsGearsSource = require('../../assets/icons/settings-gears-outline.png');
const choreChartOutlineSource = require('../../assets/icons/chore-chart-outline.png');
const homeOutlineSource = require('../../assets/icons/home-outline.png');
const historyCalendarSource = require('../../assets/icons/history-calendar-outline.png');

type BottomNavigationProps = {
  activeSection: SectionKey;
  onChange: (section: SectionKey) => void;
  theme: AppTheme;
};

const tabs: Array<{ key: SectionKey; label: string }> = [
  { key: 'dashboard', label: 'Home' },
  { key: 'history', label: 'History' },
  { key: 'choreChart', label: 'Chore Chart' },
  { key: 'settings', label: 'Settings' },
];

function NavGlyph({ section, color }: { section: SectionKey; color: string }) {
  if (section === 'dashboard') {
    return (
      <Image
        fadeDuration={0}
        resizeMode="contain"
        source={homeOutlineSource}
        style={[styles.homeImageGlyph, { tintColor: color }]}
      />
    );
  }
  if (section === 'history') {
    return (
      <Image
        fadeDuration={0}
        resizeMode="contain"
        source={historyCalendarSource}
        style={[styles.historyImageGlyph, { tintColor: color }]}
      />
    );
  }
  if (section === 'choreChart') {
    return (
      <Image
        fadeDuration={0}
        resizeMode="contain"
        source={choreChartOutlineSource}
        style={[styles.choreChartImageGlyph, { tintColor: color }]}
      />
    );
  }
  return (
    <Image
      fadeDuration={0}
      resizeMode="contain"
      source={settingsGearsSource}
      style={[styles.settingsImageGlyph, { tintColor: color }]}
    />
  );
}

export function BottomNavigation({ activeSection, onChange, theme }: BottomNavigationProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.outer,
        {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          paddingBottom: Math.max(insets.bottom - 5, 5),
          shadowColor: theme.shadow,
        },
      ]}
    >
      <View style={styles.inner}>
        {tabs.map((tab) => {
          const isActive = tab.key === activeSection;

          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${tab.label} section`}
              key={tab.key}
              onPress={() => onChange(tab.key)}
              style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
            >
              <View style={[styles.iconCircle, isActive && { backgroundColor: theme.primarySoft }]}>
                <NavGlyph section={tab.key} color={isActive ? theme.primary : theme.textMuted} />
              </View>
              <Text
                numberOfLines={1}
                style={[
                  styles.label,
                  { color: isActive ? theme.primary : theme.textMuted },
                  isActive && styles.activeLabel,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingTop: 0,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: Platform.OS === 'ios' ? 0.05 : 0,
    shadowRadius: 18,
    elevation: 10,
  },
  inner: {
    alignItems:'center',
    alignSelf: 'center',
    flexDirection: 'row',
    minHeight:56,
    transform:[{translateY:4}],
    maxWidth: 720,
    width: '100%',
  },
  tab: {
    alignItems: 'center',
    flex: 1,
    gap: 1,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 2,
    paddingVertical: 0,
  },
  iconCircle: {
    alignItems: 'center',
    borderRadius: 13,
    height: 34,
    justifyContent: 'center',
    width: 44,
  },
  pressed: {
    opacity: 0.64,
  },
  homeGlyph:{height:25,position:'relative',width:27},
  homeImageGlyph:{height:27,width:28},
  historyImageGlyph:{height:25,width:25},
  choreChartImageGlyph:{height:25,width:25},
  settingsImageGlyph:{height:25,width:27},
  homeRoofLeft:{borderRadius:2,height:2,left:3,position:'absolute',top:7,transform:[{rotate:'-38deg'}],width:13},
  homeRoofRight:{borderRadius:2,height:2,position:'absolute',right:3,top:7,transform:[{rotate:'38deg'}],width:13},
  homeBody:{borderBottomLeftRadius:4,borderBottomRightRadius:4,borderWidth:1.8,bottom:2,height:14,left:5,position:'absolute',width:17},
  homeDoor:{borderTopLeftRadius:2,borderTopRightRadius:2,borderWidth:1.4,bottom:-1,height:8,left:6,position:'absolute',width:5},
  calendarGlyph:{borderRadius:5,borderWidth:1.8,height:23,position:'relative',width:23},
  calendarTopLine:{height:1.7,left:0,position:'absolute',right:0,top:6},
  calendarRing:{borderRadius:2,height:5,position:'absolute',top:-3,width:2.2},
  calendarRingLeft:{left:5},calendarRingRight:{right:5},
  calendarGrid:{flexDirection:'row',flexWrap:'wrap',gap:3,left:5,position:'absolute',top:11,width:12},
  calendarDot:{borderRadius:1,height:2.7,width:2.7},
  checklistGlyph:{borderRadius:5,borderWidth:1.8,gap:2.5,height:23,justifyContent:'center',paddingHorizontal:3,width:23},
  checklistRow:{alignItems:'center',flexDirection:'row',gap:2.5},
  checkBox:{borderRadius:1.5,borderWidth:1,height:5,position:'relative',width:5},
  checkStrokeA:{borderRadius:1,height:1,left:0.5,position:'absolute',top:2.3,transform:[{rotate:'42deg'}],width:2.2},
  checkStrokeB:{borderRadius:1,height:1,left:1.7,position:'absolute',top:1.7,transform:[{rotate:'-48deg'}],width:4},
  checkLine:{borderRadius:2,height:1.5,width:9},
  settingsGlyph:{height:25,position:'relative',width:25},
  sliderLine:{borderRadius:2,height:1.7,left:2,position:'absolute',width:21},
  sliderKnob:{backgroundColor:'transparent',borderRadius:5,borderWidth:1.7,height:8,position:'absolute',width:8},
  label: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  activeLabel: {
    fontWeight: '900',
  },
});
