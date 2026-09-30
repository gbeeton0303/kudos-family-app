import { Image, StyleSheet, Text, View } from 'react-native';

const BUNDLED_TASK_ICONS: Record<string, any> = {
  // Reward sticker library
  'reward:sticker:nailPolish': require('../../assets/reward-stickers/nailPolish.png'),
  'reward:sticker:stuffedToys': require('../../assets/reward-stickers/stuffedToys.png'),
  'reward:sticker:candyBag': require('../../assets/reward-stickers/candyBag.png'),
  'reward:sticker:castle': require('../../assets/reward-stickers/castle.png'),
  'reward:sticker:airplane': require('../../assets/reward-stickers/airplane.png'),
  'reward:sticker:mysteryGift': require('../../assets/reward-stickers/mysteryGift.png'),
  // Shared Chore Chart icon library
  'task:chore:brushTeethMorning': require('../../assets/task-stickers/brushTeethMorning.png'),
  'task:chore:brushTeethNight': require('../../assets/task-stickers/brushTeethNight.png'),
  'task:chore:cleanBedroomNew': require('../../assets/task-stickers/cleanBedroom.png'),
  'task:chore:washHands': require('../../assets/task-stickers/washHands.png'),
  'task:chore:mop': require('../../assets/chore-stickers-v2/mop.png'),
  'task:chore:garbageCan': require('../../assets/chore-stickers-v2/garbageCan.png'),
  'task:chore:legoBlock': require('../../assets/chore-stickers-v2/legoBlock.png'),
  'task:chore:toys': require('../../assets/chore-stickers-v2/toys.png'),
  'task:chore:lawnMower': require('../../assets/chore-stickers-v2/lawnMower.png'),
  'task:chore:lawnMowerSticker': require('../../assets/task-stickers/lawnMower.png'),
  'task:chore:cleaningCloth': require('../../assets/chore-stickers-v2/cleaningCloth.png'),
  'task:chore:bedroomBed': require('../../assets/chore-stickers-v2/bedroomBed.png'),
  'task:chore:dishesSink': require('../../assets/chore-stickers-v2/dishesSink.png'),
  'task:chore:dishwasherLoad': require('../../assets/chore-stickers-v2/dishwasherLoad.png'),
  'task:chore:dishwasherUnload': require('../../assets/chore-stickers-v2/dishwasherUnload.png'),
  'task:chore:dishwasherOpen': require('../../assets/chore-icons/dishwasherOpen.png'),
  'task:chore:petBowl': require('../../assets/chore-stickers-v2/petBowl.png'),
  'task:chore:vacuum': require('../../assets/chore-stickers-v2/vacuum.png'),
  'task:chore:sink': require('../../assets/task-stickers/sink.png'),
  'task:chore:kitchenSinkSticker': require('../../assets/task-stickers/kitchenSink.png'),
  'task:chore:couch': require('../../assets/chore-stickers-v2/couch.png'),
  'task:chore:toilet': require('../../assets/task-stickers/toilet.png'),
  'task:chore:bathroomBlue': require('../../assets/task-stickers/bathroom.png'),
  'task:chore:table': require('../../assets/chore-stickers-v2/table.png'),
  'task:chore:tileFloor': require('../../assets/task-stickers/tileFloor.png'),
  'task:chore:woodFloor': require('../../assets/task-stickers/woodFloor.png'),
  'task:chore:basement': require('../../assets/task-stickers/basement.png'),
  'task:chore:basementAlt': require('../../assets/task-stickers/basementAlt.png'),
  'task:chore:laundryBasketSticker': require('../../assets/chore-icons/laundryBasketSticker.png'),
  'task:chore:sweepBroomDustpan': require('../../assets/task-stickers/sweep.png'),
  'task:chore:washingMachineSticker': require('../../assets/task-stickers/washingMachine.png'),
  'task:chore:cleanCarSticker': require('../../assets/task-stickers/cleanCar.png'),
  'task:chore:trashCanSticker': require('../../assets/task-stickers/trashCan.png'),
  'task:chore:mopBucketSticker': require('../../assets/task-stickers/mopBucket.png'),
  'task:chore:cordlessVacuumSticker': require('../../assets/task-stickers/cordlessVacuum.png'),
  'task:chore:pianoSticker': require('../../assets/task-stickers/piano.png'),
  'task:chore:violinSticker': require('../../assets/task-stickers/violin.png'),
  'task:chore:dogWhiteLeash': require('../../assets/task-stickers/dogWhiteLeash.png'),
  'task:chore:dogChocolateRetriever': require('../../assets/task-stickers/dogChocolateRetriever.png'),
  'task:chore:dogGoldenRetriever': require('../../assets/task-stickers/dogGoldenRetriever.png'),
  'task:sticker:sharingGiftBox': require('../../assets/task-stickers/sharingGiftBox.png'),
  'task:sticker:gradeAPlus': require('../../assets/task-stickers/gradeAPlus.png'),
  'task:sticker:goldCheckmark': require('../../assets/task-stickers/goldCheckmark.png'),
  'task:sticker:kindMessage': require('../../assets/task-stickers/kindMessage.png'),
  'task:sticker:pajamasBlue': require('../../assets/task-stickers/pajamasBlue.png'),
  'task:sticker:pajamasPink': require('../../assets/task-stickers/pajamasPink.png'),
  'task:sticker:outfitGreen': require('../../assets/task-stickers/outfitGreen.png'),
  'task:sticker:shirtPinkDaisy': require('../../assets/task-stickers/shirtPinkDaisy.png'),
  'task:sticker:childCarSeat': require('../../assets/task-stickers/childCarSeat.png'),
  'task:sticker:seatBelt': require('../../assets/task-stickers/seatBelt.png'),
  'task:brush-teeth-morning': require('../../assets/task-stickers/brushTeethMorning.png'),
  'task:brush-teeth-night': require('../../assets/task-stickers/brushTeethNight.png'),
  'task:clean-bedroom': require('../../assets/task-stickers/cleanBedroom.png'),
  'task:wash-hands': require('../../assets/task-stickers/washHands.png'),
};
import type { AppTheme } from '../theme';
import type { ItemIcon } from '../types';

type ItemIconViewProps = {
  icon?: ItemIcon;
  size?: number;
  backgroundColor?: string;
  theme: AppTheme;
  accessibilityLabel?: string;
};

export function ItemIconView({ icon, size = 48, backgroundColor, theme, accessibilityLabel }: ItemIconViewProps) {
  const safeIcon: ItemIcon = icon ?? { type: 'preset', value: '🏆' };
  const radius = Math.round(size * 0.31);
  return (
    <View
      accessibilityLabel={accessibilityLabel}
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
      {safeIcon.type === 'photo' ? (
        <Image source={{ uri: safeIcon.uri }} style={{ borderRadius: radius, height: size, width: size }} />
      ) : BUNDLED_TASK_ICONS[safeIcon.value] ? (
        <Image source={BUNDLED_TASK_ICONS[safeIcon.value]} resizeMode="contain" style={{ height: size, width: size }} />
      ) : (
        <Text style={{ fontSize: Math.max(18, Math.round(size * 0.48)) }}>{safeIcon.value}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
