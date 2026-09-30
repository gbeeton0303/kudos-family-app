import { CurrencyIcon } from './CurrencyIcon';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Image, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { getProfileAccent, getProfileSoftColor } from '../data/profileStyles';
import { CURRENCY_META, STORAGE_META, currencyWord } from '../data/currency';
import type { AppTheme } from '../theme';
import type { ChildProfile, CurrencyType } from '../types';

const piggyBankSource = require('../../assets/icons/piggy-bank-storage.png');
const piggyBankFrontSource = require('../../assets/icons/piggy-bank-frame.png');
const treasureChestStorageSource = require('../../assets/icons/treasure-chest-storage.png');
const treasureChestStorageFrontSource = require('../../assets/icons/treasure-chest-frame.png');
const coinSource = require('../../assets/icons/coin.png');
const marbleSource = require('../../assets/icons/marble.png');
const dollarBillSource = require('../../assets/icons/dollar-bill.png');

// Warm the layered storage artwork as soon as this module is imported. The piggy
// bank is composed from separate back and front PNGs so currency can sit between
// them; pre-decoding both files prevents the detail layer from appearing a frame
// (or, on slower iPhones, nearly a second) after the base layer.
const storageArtworkSources = [
  piggyBankSource,
  piggyBankFrontSource,
  treasureChestStorageSource,
  treasureChestStorageFrontSource,
  coinSource,
  marbleSource,
  dollarBillSource,
] as const;

void Promise.all(storageArtworkSources.map((source) => {
  const uri = Image.resolveAssetSource(source)?.uri;
  return uri ? Image.prefetch(uri) : Promise.resolve(false);
})).catch(() => undefined);

type CurrencyStorageProps = {
  profile: ChildProfile;
  balance: number;
  goalAmount: number;
  goalLabel?: string;
  theme: AppTheme;
  initialBalance?: number;
  celebrationAmount?: number;
  onGoalPress?: () => void;
  visualOnly?: boolean;
};

type PilePosition = readonly [left: number, bottom: number, rotation: number, size: number];

const DEFAULT_VISUAL_CAPACITY: Record<CurrencyType, number> = {
  stars: 25,
  marbles: 50,
  points: 100,
  coins: 50,
  dollars: 40,
};

// Every position list is deliberately ordered from the lowest row to the highest row.
// Since item reveal thresholds follow array order, all containers now fill bottom-up.
const JAR_ITEMS: readonly PilePosition[] = [
  [5, 0, -6, 19], [29, 0, 9, 21], [55, 1, -8, 20], [77, 3, 7, 19],
  [15, 12, 7, 22], [41, 11, -11, 23], [67, 14, 8, 21],
  [3, 25, 10, 21], [27, 26, -9, 24], [52, 25, 12, 25], [76, 29, -7, 21],
  [15, 42, -11, 24], [41, 41, 8, 26], [68, 43, -6, 23],
  [4, 57, -5, 22], [29, 58, 13, 25], [56, 58, -8, 27], [77, 61, 6, 22],
  [18, 75, 8, 25], [45, 75, -12, 28], [70, 77, 4, 25],
  [8, 91, -12, 25], [35, 93, 9, 27], [63, 92, -7, 26],
];

const PIG_ITEMS: readonly PilePosition[] = [
  [52, 0, -5, 20], [28, 0, 7, 19], [76, 0, -8, 19], [66, 0, 10, 19], [86, 2, -7, 18], [104, 1, 5, 18],
  [2, 13, 6, 19], [19, 15, -10, 20], [39, 12, 8, 18], [58, 16, -6, 20], [78, 13, 9, 19], [98, 15, -8, 20],
  [8, 27, -7, 20], [28, 25, 11, 19], [47, 29, -9, 21], [68, 25, 7, 20], [88, 29, -11, 19], [105, 27, 6, 18],
  [3, 41, 9, 19], [22, 43, -8, 21], [42, 40, 6, 20], [62, 44, -10, 22], [83, 40, 8, 20], [102, 43, -6, 19],
  [10, 56, -10, 20], [31, 54, 7, 21], [51, 58, -8, 22], [72, 55, 10, 21], [92, 57, -7, 20],
  [17, 70, 8, 20], [38, 72, -11, 22], [59, 69, 7, 21], [80, 73, -9, 22], [98, 70, 6, 19],
  [27, 84, -8, 20], [48, 86, 10, 21], [69, 83, -7, 20], [88, 85, 8, 19],
  [39, 95, 7, 19], [59, 97, -9, 20], [78, 95, 6, 19],
];

const CHEST_ITEMS: readonly PilePosition[] = [
  [2,0,-8,18],[18,1,7,19],[34,0,-5,18],[50,2,9,19],[66,0,-7,18],[82,2,6,18],[98,1,-10,19],[114,0,8,18],
  [7,11,6,19],[24,13,-9,20],[41,10,8,18],[58,14,-7,20],[75,11,10,19],[92,13,-8,20],[109,10,6,19],
  [1,22,-7,20],[18,24,11,19],[35,21,-8,21],[52,25,7,20],[69,22,-10,19],[86,24,9,20],[103,21,-6,19],[119,23,8,18],
  [8,34,9,19],[25,36,-8,21],[42,33,6,20],[59,37,-10,22],[76,34,8,20],[93,36,-7,20],[110,33,6,19],
  [2,46,-9,20],[20,48,7,21],[38,45,-8,22],[56,49,10,21],[74,46,-7,20],[92,48,9,21],[110,45,-6,20],
  [10,58,8,20],[29,60,-10,21],[48,57,7,22],[67,61,-8,21],[86,58,10,20],[105,60,-7,20],
  [18,70,-7,20],[38,72,9,21],[58,69,-8,21],[78,73,7,20],[98,70,-6,19],
];

export function CurrencyStorage({
  profile,
  balance,
  goalAmount,
  goalLabel,
  theme,
  initialBalance,
  celebrationAmount = 0,
  onGoalPress = undefined,
  visualOnly = false,
}: CurrencyStorageProps) {
  const { width: windowWidth } = useWindowDimensions();
  const wideProfileLayout = windowWidth >= 700;
  const fill = useRef(new Animated.Value(0)).current;
  const shimmer = useRef(new Animated.Value(0)).current;
  const dropValues = useRef(Array.from({ length: 8 }, () => new Animated.Value(0))).current;
  const currency = CURRENCY_META[profile.currencyType];
  const profileAccent = getProfileAccent(profile.colorKey);
  const profileSoft = getProfileSoftColor(profile.colorKey);
  const storage = STORAGE_META[profile.storageType];
  const rewardNameLength = goalLabel?.trim().length ?? 0;
  const rewardNameSize = rewardNameLength > 28 ? 10 : rewardNameLength > 20 ? 11 : rewardNameLength > 13 ? 12 : 13;
  const rewardCostSize = goalAmount >= 1000 ? 10 : goalAmount >= 100 ? 11 : 12;

  const fillForBalance = useCallback((value: number) => {
    const capacity = goalAmount > 0 ? goalAmount : DEFAULT_VISUAL_CAPACITY[profile.currencyType];
    if (capacity <= 0) return value > 0 ? 1 : 0;
    return Math.max(value > 0 ? 0.08 : 0, Math.min(1, value / capacity));
  }, [goalAmount, profile.currencyType]);

  const targetFill = useMemo(() => fillForBalance(balance), [balance, fillForBalance]);
  const startingFill = useMemo(
    () => initialBalance === undefined ? 0 : fillForBalance(initialBalance),
    [fillForBalance, initialBalance],
  );
  const isFull = targetFill >= 1;
  const showEarnedDrop = celebrationAmount > 0 && initialBalance !== undefined;

  const play = useCallback(() => {
    fill.stopAnimation();
    fill.setValue(startingFill);
    dropValues.forEach((value) => {
      value.stopAnimation();
      value.setValue(0);
    });

    const fillAnimation = Animated.timing(fill, {
      delay: showEarnedDrop ? 153 : 0,
      duration: showEarnedDrop ? 1063 : 1050,
      easing: Easing.out(Easing.cubic),
      toValue: targetFill,
      useNativeDriver: true,
    });

    if (!showEarnedDrop) {
      fillAnimation.start();
      return;
    }

    const numberOfDrops = Math.min(8, Math.max(1, Math.ceil(celebrationAmount)));
    const drops = dropValues.slice(0, numberOfDrops).map((value) =>
      Animated.timing(value, {
        duration: 306,
        easing: Easing.out(Easing.cubic),
        toValue: 1,
        useNativeDriver: true,
      }),
    );

    Animated.parallel([
      fillAnimation,
      Animated.sequence([Animated.delay(85), ...drops]),
    ]).start();
  }, [celebrationAmount, dropValues, fill, showEarnedDrop, startingFill, targetFill]);

  useEffect(() => { play(); }, [play, profile.id]);

  useEffect(() => {
    shimmer.setValue(0);
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(shimmer, { duration: 900, easing: Easing.inOut(Easing.ease), toValue: 1, useNativeDriver: true }),
      Animated.timing(shimmer, { duration: 900, easing: Easing.inOut(Easing.ease), toValue: 0, useNativeDriver: true }),
      Animated.delay(350),
    ]));
    loop.start();
    return () => {
      loop.stop();
      shimmer.stopAnimation();
    };
  }, [shimmer]);

  return (
    <Pressable
      accessibilityHint="Replays the fill animation"
      accessibilityLabel={`${profile.name}'s ${storage.label}: ${balance} ${currencyWord(profile.currencyType, balance)}`}
      accessibilityRole="button"
      onPress={play}
      style={[
        visualOnly ? styles.visualOnlyCard : styles.card,
        !visualOnly && {
          backgroundColor: theme.surface,
          borderColor: '#D8B45A',
          shadowColor: isFull ? '#D8B45A' : theme.shadow,
        },
        !visualOnly && isFull && styles.fullCard,
      ]}
    >
      {!visualOnly ? (
        <>
      {goalLabel ? (
        <Pressable
          accessibilityHint={onGoalPress ? 'Choose which reward to track' : undefined}
          accessibilityLabel={onGoalPress ? `Choose reward goal for ${profile.name}` : undefined}
          accessibilityRole={onGoalPress ? 'button' : undefined}
          disabled={!onGoalPress}
          onPress={(event) => {
            event.stopPropagation?.();
            onGoalPress?.();
          }}
          style={[
            styles.rewardGoalBadgeGlow,
            wideProfileLayout && styles.rewardGoalBadgeGlowWide,
            { shadowColor: '#D8B45A' },
          ]}
        >
          <View style={[styles.rewardGoalBadge, { backgroundColor: theme.surface, borderColor: '#D8B45A' }]}>
            <View style={[styles.rewardGoalTab, { backgroundColor: theme.surface, borderColor: '#D8B45A' }]}>
              <Text style={styles.rewardGoalTabIcon}>🎯</Text>
              <Text style={[styles.rewardGoalTabText, { color: profileAccent }]}>Goal</Text>
            </View>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.68}
              numberOfLines={2}
              style={[styles.rewardGoalBadgeName, { color: profileAccent, fontSize: rewardNameSize }]}
            >
              {goalLabel}
            </Text>
            <Text
              adjustsFontSizeToFit
              minimumFontScale={0.72}
              numberOfLines={1}
              style={[styles.rewardGoalBadgeCost, { color: profileAccent, fontSize: rewardCostSize }]}
            >
              {goalAmount} {currencyWord(profile.currencyType, goalAmount)}
            </Text>
          </View>
        </Pressable>
      ) : null}
      <View style={[styles.copy, wideProfileLayout && styles.copyWide]}>
        <Text style={[styles.eyebrow, { color: theme.textMuted }]}>MY {storage.label.toUpperCase()}</Text>
        <Text style={[styles.amount, { color: profileAccent }]}>{balance}</Text>
        <View style={styles.currencyRow}>
          <CurrencyIcon color={currency.color} size={23} type={profile.currencyType} />
          <Text style={[styles.currencyLabel, { color: theme.textMuted }]}>{currencyWord(profile.currencyType, balance)}</Text>
        </View>
      </View>

        </>
      ) : null}
      <View style={visualOnly ? styles.visualOnlyColumn : styles.visualColumn}>
        <View style={visualOnly ? styles.visualOnlyWrap : styles.visualWrap}>
          <StorageCelebrationBackdrop color={currency.color} />
          {profile.storageType === 'piggyBank' ? (
            <PiggyBank fill={fill} currencyType={profile.currencyType} currencyColor={currency.color} shimmer={shimmer} theme={theme} isFull={isFull} visualOnly={visualOnly} />
          ) : profile.storageType === 'treasureChest' ? (
            <TreasureChest fill={fill} currencyType={profile.currencyType} currencyColor={currency.color} shimmer={shimmer} theme={theme} isFull={isFull} visualOnly={visualOnly} />
          ) : (
            <GlassJar fill={fill} currencyType={profile.currencyType} currencyColor={currency.color} shimmer={shimmer} theme={theme} isFull={isFull} visualOnly={visualOnly} />
          )}
          {showEarnedDrop ? (
            <CurrencyDropBurst
              color={currency.color}
              currencyType={profile.currencyType}
              values={dropValues}
              visibleCount={Math.min(8, Math.max(1, Math.ceil(celebrationAmount)))}
            />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

function CurrencyDropBurst({
  color,
  currencyType,
  values,
  visibleCount,
}: {
  color: string;
  currencyType: CurrencyType;
  values: Animated.Value[];
  visibleCount: number;
}) {
  const horizontal = [-54, -36, -18, 0, 18, 36, 54, 8];
  return (
    <View pointerEvents="none" style={styles.dropLayer}>
      {values.slice(0, visibleCount).map((value, index) => {
        const translateY = value.interpolate({ inputRange: [0, 1], outputRange: [-72, 60] });
        const opacity = value.interpolate({ inputRange: [0, 0.08, 0.84, 1], outputRange: [0, 1, 1, 0] });
        return (
          <Animated.View
            key={index}
            style={[
              styles.dropCurrency,
              {
                left: 82 + horizontal[index],
                opacity,
                transform: [{ translateY }],
              },
            ]}
          >
            <CurrencyIcon color={color} size={currencyType === 'coins' || currencyType === 'marbles' ? 28 : currencyType === 'dollars' ? 42 : 25} type={currencyType} />
          </Animated.View>
        );
      })}
    </View>
  );
}

function CurrencyPile({ fill, positions, currencyType, currencyColor, itemStyle, shimmer, horizontalOffset = 0, horizontalScale = 1, renderScale = 1 }: PileProps & { shimmer?: Animated.Value; horizontalOffset?: number; horizontalScale?: number; renderScale?: number }) {
  return <>
    {positions.map(([left, bottom, rotation, size], index) => {
      const threshold = index / positions.length;
      const start = Math.max(0, threshold - 0.05);
      const end = Math.min(1, threshold + 0.05);
      const opacity = fill.interpolate({ inputRange: [start, end], outputRange: [0, 1], extrapolate: 'clamp' });
      const translateY = fill.interpolate({ inputRange: [start, end], outputRange: [-12, 0], extrapolate: 'clamp' });
      const glintOpacity = shimmer
        ? shimmer.interpolate({ inputRange: [0, .35, .5, .65, 1], outputRange: [0, 0, .8, 0, 0] })
        : 0;
      const pulseScale = shimmer
        ? shimmer.interpolate({
            inputRange: [0, .5, 1],
            outputRange: index % 2 === 0 ? [1, 1.16, 1] : [1.09, 1, 1.09],
          })
        : 1;
      const overlapX = currencyType === 'dollars' ? 0.82 : 0.90;
      const layeredLeft = Math.round((left * overlapX * horizontalScale + horizontalOffset + 4) * renderScale);
      const layeredBottom = Math.round(bottom * 0.90 * renderScale);

      if (currencyType === 'coins' || currencyType === 'marbles' || currencyType === 'dollars') {
        const px = Math.max(15, Math.round(size * 0.90 * renderScale));
        const itemWidth = currencyType === 'dollars' ? Math.round(px * 2.02) : px;
        const itemHeight = currencyType === 'dollars' ? Math.round(px * 1.03) : px;
        return (
          <Animated.View
            key={`currency-${index}-${Math.round(left)}-${Math.round(bottom)}`}
            style={[
              styles.bitmapPileItem,
              itemStyle,
              {
                bottom: Math.round(currencyType === 'dollars' ? layeredBottom * 0.88 : layeredBottom),
                height: itemHeight,
                left: layeredLeft,
                opacity,
                transform: [{ translateY }, { scale: pulseScale }],
                width: itemWidth,
              },
            ]}
          >
            <Image
              defaultSource={currencyType === 'coins' ? coinSource : currencyType === 'marbles' ? marbleSource : dollarBillSource}
              fadeDuration={0}
              resizeMode="contain"
              source={currencyType === 'coins' ? coinSource : currencyType === 'marbles' ? marbleSource : dollarBillSource}
              style={styles.bitmapCurrencyImage}
            />
            <Animated.Text style={[styles.bitmapGlint, { opacity: glintOpacity }]}>✦</Animated.Text>
          </Animated.View>
        );
      }

      return (
        <Animated.Text
          key={`currency-${index}-${Math.round(left)}-${Math.round(bottom)}`}
          style={[
            styles.pileItem,
            itemStyle,
            {
              bottom: layeredBottom,
              color: currencyColor,
              fontSize: Math.round(size * renderScale),
              width: Math.round(26 * renderScale),
              left: layeredLeft,
              opacity,
              transform: [{ translateY }, { scale: pulseScale }, { rotate: `${Math.round(rotation)}deg` }],
            },
          ]}
        >
          {storageGlyph(currencyType)}
        </Animated.Text>
      );
    })}
  </>;
}

function StorageCelebrationBackdrop({ color }: { color: string }) {
  return (
    <View pointerEvents="none" style={styles.storageCelebrationBackdrop}>
      <Text style={[styles.storageSparkle, styles.storageSparkleOne, { color: '#F4D06F' }]}>✦</Text>
      <Text style={[styles.storageSparkle, styles.storageSparkleTwo, { color }]}>✧</Text>
      <Text style={[styles.storageSparkle, styles.storageSparkleThree, { color: '#FFF3BF' }]}>✦</Text>
      <Text style={[styles.storageSparkle, styles.storageSparkleFour, { color: '#F4D06F' }]}>✧</Text>
      <Text style={[styles.storageSparkle, styles.storageSparkleFive, { color }]}>★</Text>
      <Text style={[styles.storageSparkle, styles.storageSparkleSix, { color: '#F4D06F' }]}>✦</Text>
      <Text style={[styles.storageSparkle, styles.storageSparkleSeven, { color }]}>✧</Text>
      <Text style={[styles.storageSparkle, styles.storageSparkleEight, { color: '#FFF3BF' }]}>★</Text>
    </View>
  );
}


function GlassJar({ fill, currencyType, currencyColor, shimmer, theme, isFull, visualOnly = false }: ContainerProps) {
  const shineX = shimmer.interpolate({ inputRange: [0, 1], outputRange: [-10, 30] });
  const glowOpacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.10, isFull ? 0.42 : 0.20] });
  return <View style={visualOnly ? styles.jarSceneLarge : styles.jarScene}>
    <Animated.View style={[styles.jarGlow, { backgroundColor: currencyColor, opacity: glowOpacity }]} />
    <View style={styles.jarCapTop}>
      <View style={[styles.jarCapStripe,{backgroundColor:currencyColor}]} />
    </View>
    <View style={styles.jarCap} />
    <View style={[visualOnly ? styles.jarBackLarge : styles.jarBack, { borderColor: currencyColor }]}>
      <View style={[styles.jarBottomTint, { backgroundColor: currencyColor }]} />
      <View pointerEvents="none" style={visualOnly ? styles.jarCurrencyStageLarge : styles.jarCurrencyStage}>
        <CurrencyPile currencyColor={currencyColor} currencyType={currencyType} fill={fill} positions={JAR_ITEMS} shimmer={shimmer} renderScale={visualOnly ? 1.20 : 1} />
      </View>
      <Animated.View style={[styles.movingShine, { backgroundColor: '#FFFFFF', transform: [{ translateX: shineX }, { rotate: '12deg' }] }]} />
      <View style={styles.jarSideShine} />
      <View style={[styles.jarSticker,{borderColor:currencyColor}]}>
        <Text style={[styles.jarStickerText,{color:currencyColor}]}>★</Text>
      </View>
    </View>
    <View style={[styles.jarBase, { backgroundColor: currencyColor }]} />
    <View style={[styles.containerShadow, { backgroundColor: currencyColor }]} />
    <Sparkles color={currencyColor} />
  </View>;
}

function PiggyBank({ fill, currencyType, currencyColor, shimmer, theme, isFull, visualOnly = false }: ContainerProps) {
  return <View style={visualOnly ? styles.pigSceneLarge : styles.pigScene}>
    <Image
      defaultSource={piggyBankSource}
      fadeDuration={0}
      resizeMode="contain"
      source={piggyBankSource}
      style={visualOnly ? styles.pigArtworkLarge : styles.pigArtwork}
    />

    <View pointerEvents="none" style={visualOnly ? styles.pigBellyFillBaseLarge : styles.pigBellyFillBase} />

    {/* Mount the detail frame before the bitmap-heavy currency pile. Its higher
        z-index still draws it on top, while native view creation no longer waits
        for every coin or marble Image to mount first. */}
    <Image
      defaultSource={piggyBankFrontSource}
      fadeDuration={0}
      resizeMode="contain"
      source={piggyBankFrontSource}
      style={visualOnly ? styles.pigFrameArtworkLarge : styles.pigFrameArtwork}
    />

    <View pointerEvents="none" style={visualOnly ? styles.pigCurrencyStageLarge : styles.pigCurrencyStage}>
      <CurrencyPile
        currencyColor={currencyColor}
        currencyType={currencyType}
        fill={fill}
        positions={PIG_ITEMS}
        itemStyle={styles.pigPileItem}
        shimmer={shimmer}
        renderScale={visualOnly ? 1.20 : 1}
      />
    </View>

    <Sparkles color={currencyColor} />
  </View>;
}

function TreasureChest({ fill, currencyType, currencyColor, shimmer, theme, isFull, visualOnly = false }: ContainerProps) {
  return <View style={visualOnly ? styles.chestSceneLarge : styles.chestScene}>
    <Image
      defaultSource={treasureChestStorageSource}
      fadeDuration={0}
      resizeMode="contain"
      source={treasureChestStorageSource}
      style={visualOnly ? styles.chestGlassArtworkLarge : styles.chestGlassArtwork}
    />

    <View pointerEvents="none" style={visualOnly ? styles.chestCurrencyStageLarge : styles.chestCurrencyStage}>
      <CurrencyPile
        currencyColor={currencyColor}
        currencyType={currencyType}
        fill={fill}
        horizontalOffset={8}
        horizontalScale={1.08}
        positions={CHEST_ITEMS}
        itemStyle={styles.chestPileItem}
        shimmer={shimmer}
        renderScale={visualOnly ? 1.20 : 1}
      />
    </View>

    <Image
      defaultSource={treasureChestStorageFrontSource}
      fadeDuration={0}
      resizeMode="contain"
      source={treasureChestStorageFrontSource}
      style={visualOnly ? styles.chestFrameArtworkLarge : styles.chestFrameArtwork}
    />

    <Sparkles color={currencyColor} />
  </View>;
}

function Sparkles({ color }: { color: string }) {
  return <><Text style={[styles.sparkleOne, { color }]}>✦</Text><Text style={[styles.sparkleTwo, { color }]}>✧</Text></>;
}

function storageGlyph(type: CurrencyType) { return type === 'stars' ? '★' : type === 'coins' ? '●' : type === 'marbles' ? '◉' : type === 'dollars' ? '$' : '✦'; }

type ContainerProps = { fill: Animated.Value; currencyType: CurrencyType; currencyColor: string; shimmer: Animated.Value; theme: AppTheme; isFull: boolean; visualOnly?: boolean; };
type PileProps = { fill: Animated.Value; positions: readonly PilePosition[]; currencyType: CurrencyType; currencyColor: string; itemStyle?: object; };

const styles = StyleSheet.create({
  jarSceneLarge:{alignItems:'center',height:221,justifyContent:'flex-end',width:180},
  jarBackLarge:{backgroundColor:'rgba(225,244,255,0.36)',borderBottomLeftRadius:35,borderBottomRightRadius:35,borderTopLeftRadius:14,borderTopRightRadius:14,borderWidth:2,height:148,overflow:'hidden',position:'relative',width:132,zIndex:2},
  jarCurrencyStageLarge:{bottom:0,height:130,left:4,overflow:'hidden',position:'absolute',width:125,zIndex:4},

  pigSceneLarge:{alignItems:'center',height:238,justifyContent:'center',position:'relative',width:250},
  pigArtworkLarge:{height:233,opacity:0.36,position:'absolute',width:245,zIndex:2},
  pigBellyFillBaseLarge:{backgroundColor:'#FAE3F1',borderRadius:82,bottom:52,height:142,left:42,position:'absolute',width:178,zIndex:4},
  pigCurrencyStageLarge:{backgroundColor:'transparent',bottom:52,height:142,left:42,overflow:'hidden',position:'absolute',width:178,zIndex:6,borderRadius:82},
  pigFrameArtworkLarge:{height:233,position:'absolute',width:245,zIndex:8},

  chestSceneLarge:{alignItems:'center',height:238,justifyContent:'center',position:'relative',width:250},
  chestGlassArtworkLarge:{height:230,opacity:1,position:'absolute',width:245,zIndex:2},
  chestCurrencyStageLarge:{bottom:50,height:101,left:29,overflow:'hidden',position:'absolute',width:192,zIndex:6,borderRadius:10},
  chestFrameArtworkLarge:{height:230,opacity:1,position:'absolute',width:245,zIndex:8},

  visualOnlyCard:{alignItems:'center',alignSelf:'center',backgroundColor:'transparent',borderWidth:0,height:276,justifyContent:'center',overflow:'visible',padding:0,width:340},
  visualOnlyColumn:{alignItems:'center',height:276,justifyContent:'center',overflow:'visible',width:340},
  visualOnlyWrap:{alignItems:'center',height:252,justifyContent:'center',overflow:'visible',position:'relative',width:286},

  rewardGoalBadgeGlow:{bottom:13,left:14,position:'absolute',shadowOffset:{width:0,height:2},shadowOpacity:0.14,shadowRadius:7,zIndex:25},
  rewardGoalBadgeGlowWide:{left:'24%',transform:[{translateX:-66}]},
  rewardGoalBadge:{alignItems:'flex-start',borderRadius:14,borderWidth:1.5,height:64,justifyContent:'center',paddingBottom:6,paddingHorizontal:10,paddingTop:15,width:132},
  rewardGoalTab:{alignItems:'center',borderRadius:999,borderWidth:1.3,flexDirection:'row',gap:4,height:25,left:9,paddingHorizontal:8,position:'absolute',top:-12,zIndex:3},
  rewardGoalTabIcon:{fontSize:14,lineHeight:17},
  rewardGoalTabText:{fontSize:11,fontWeight:'900',letterSpacing:0.6,textTransform:'uppercase'},
  rewardGoalBadgeName:{fontWeight:'900',lineHeight:15,textAlign:'left',width:'100%'},
  rewardGoalBadgeCost:{fontWeight:'900',lineHeight:14,marginTop:1,textAlign:'left',width:'100%'},

  storageCelebrationBackdrop:{height:194,left:'50%',marginLeft:-108,marginTop:-97,position:'absolute',top:'50%',width:216,zIndex:0},
  storageSparkle:{fontWeight:'900',position:'absolute',textShadowColor:'rgba(244,208,111,0.30)',textShadowOffset:{width:0,height:0},textShadowRadius:4},
  storageSparkleOne:{fontSize:17,left:13,top:39},
  storageSparkleTwo:{fontSize:12,right:17,top:24},
  storageSparkleThree:{bottom:20,fontSize:14,right:26},
  storageSparkleFour:{bottom:32,fontSize:11,left:27},
  storageSparkleFive:{fontSize:10,left:42,top:18},
  storageSparkleSix:{fontSize:13,right:42,top:55},
  storageSparkleSeven:{bottom:18,fontSize:12,left:67},
  storageSparkleEight:{bottom:52,fontSize:9,right:12},

  card:{
    alignItems:'center',borderRadius:28,borderWidth:1.2,flexDirection:'row',gap:10,
    justifyContent:'space-between',height:220,marginBottom:15,overflow:'hidden',
    paddingHorizontal:16,paddingVertical:18,shadowOffset:{width:0,height:9},
    shadowOpacity:0.07,shadowRadius:20,elevation:2
  },
  fullCard:{shadowOpacity:0.19,shadowRadius:24,elevation:7},
  copy:{alignItems:'center',alignSelf:'stretch',flex:1,justifyContent:'flex-start',maxWidth:'44%',minWidth:118,paddingRight:4,paddingTop:2},
  copyWide:{flex:0,maxWidth:'44%',width:'44%'},
  eyebrow:{fontSize:12,fontWeight:'900',letterSpacing:1.05,textAlign:'center',width:'100%'},
  amount:{fontSize:43,fontWeight:'900',letterSpacing:-1.5,lineHeight:48,marginTop:0,textAlign:'center',width:'100%'},
  currencyRow:{alignItems:'center',flexDirection:'row',gap:4,justifyContent:'center',marginTop:-1},
  currencyLabel:{fontSize:12,fontWeight:'800'},
  goalTextProminent:{fontSize:16,fontWeight:'900',lineHeight:22},
  goalText:{fontSize:12,lineHeight:15,marginTop:8},
  percentPill:{alignSelf:'flex-start',borderRadius:999,marginTop:9,paddingHorizontal:9,paddingVertical:6},
  percentText:{fontSize:12,fontWeight:'900'},
  replayPill:{alignSelf:'flex-start',borderRadius:999,marginTop:6,paddingHorizontal:6,paddingVertical:3},
  replayText:{fontSize:9,fontWeight:'900',lineHeight:11},

  visualColumn:{alignItems:'center',flex:1,justifyContent:'center',minWidth:170},
  visualWrap:{alignItems:'center',height:190,justifyContent:'center',overflow:'visible',position:'relative',width:182},
  dropLayer:{...StyleSheet.absoluteFillObject,overflow:'visible',zIndex:20},
  dropCurrency:{alignItems:'center',height:30,justifyContent:'center',position:'absolute',top:16,width:30},

  pileItem:{
    fontWeight:'900',lineHeight:26,position:'absolute',textAlign:'center',
    textShadowColor:'rgba(0,0,0,0.12)',textShadowOffset:{width:0,height:1},
    textShadowRadius:1,width:26,zIndex:3
  },
  bitmapPileItem:{alignItems:'center',justifyContent:'center',position:'absolute',zIndex:4},
  bitmapCurrencyImage:{backfaceVisibility:'hidden',height:'100%',width:'100%'},
  bitmapGlint:{
    color:'#FFFFFF',fontSize:9,fontWeight:'900',position:'absolute',right:-1,
    textShadowColor:'rgba(0,0,0,0.18)',textShadowRadius:1,top:-4
  },

  /* Glass jar */
  jarScene:{alignItems:'center',height:184,justifyContent:'flex-end',width:150},
  jarGlow:{borderRadius:62,bottom:10,height:128,position:'absolute',width:124},
  jarCapTop:{
    backgroundColor:'#ECEFF5',borderColor:'#AEB7C7',borderRadius:8,borderWidth:2,
    height:9,marginBottom:-2,overflow:'hidden',width:88,zIndex:7
  },
  jarCapStripe:{height:9,opacity:0.72,width:28},
  jarCap:{
    backgroundColor:'#D9DEE8',borderColor:'#9AA6B8',borderRadius:6,borderWidth:2,
    height:14,marginBottom:3,width:94,zIndex:6
  },
  jarBack:{
    backgroundColor:'rgba(225,244,255,0.36)',borderBottomLeftRadius:29,
    borderBottomRightRadius:29,borderTopLeftRadius:12,borderTopRightRadius:12,
    borderWidth:2,height:123,overflow:'hidden',position:'relative',width:110,zIndex:2
  },
  jarBottomTint:{bottom:0,height:38,left:0,opacity:0.10,position:'absolute',right:0},
  jarCurrencyStage:{bottom:0,height:108,left:3,overflow:'hidden',position:'absolute',width:104,zIndex:4},
  movingShine:{borderRadius:999,height:105,left:17,opacity:0.22,position:'absolute',top:7,width:10,zIndex:7},
  jarSideShine:{backgroundColor:'#FFFFFF',borderRadius:999,height:64,left:11,opacity:0.58,position:'absolute',top:15,width:6,zIndex:7},
  jarSticker:{
    alignItems:'center',backgroundColor:'rgba(255,255,255,0.82)',borderRadius:13,
    borderWidth:1.5,height:27,justifyContent:'center',position:'absolute',right:8,top:8,width:27,zIndex:8
  },
  jarStickerText:{fontSize:15,fontWeight:'900'},
  jarBase:{borderRadius:999,height:5,marginTop:-4,opacity:0.38,width:78,zIndex:3},
  containerShadow:{borderRadius:999,height:8,marginTop:3,opacity:0.16,width:102},
  sparkleOne:{fontSize:18,position:'absolute',right:3,top:43,zIndex:12},
  sparkleTwo:{fontSize:14,left:1,position:'absolute',top:76,zIndex:12},

  /* Piggy bank */
  pigScene:{alignItems:'center',height:198,justifyContent:'center',position:'relative',width:208},
  pigArtwork:{height:194,opacity:0.36,position:'absolute',width:204,zIndex:2},
  pigBellyFillBase:{backgroundColor:'#FAE3F1',borderRadius:68,bottom:43,height:118,left:35,position:'absolute',width:148,zIndex:4},
  pigCurrencyStage:{backgroundColor:'transparent',bottom:43,height:118,left:35,overflow:'hidden',position:'absolute',width:148,zIndex:6,borderRadius:68},
  pigPileItem:{lineHeight:20,width:20},
  pigFrameArtwork:{height:194,position:'absolute',width:204,zIndex:8},

  /* Treasure chest */
  chestScene:{alignItems:'center',height:198,justifyContent:'center',position:'relative',width:208},
  chestGlassArtwork:{height:192,opacity:1,position:'absolute',width:204,zIndex:2},
  chestCurrencyStage:{bottom:42,height:84,left:24,overflow:'hidden',position:'absolute',width:160,zIndex:6,borderRadius:8},
  chestPileItem:{lineHeight:19,width:19},
  chestFrameArtwork:{height:192,opacity:1,position:'absolute',width:204,zIndex:8},

  pressed:{opacity:0.92}
});
