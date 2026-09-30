import type { ImageSourcePropType } from 'react-native';
import type { AvatarKey } from '../types';

export const AVATAR_KEYS: AvatarKey[] = [
  'avatar-01',
  'avatar-02',
  'avatar-03',
  'avatar-04',
  'avatar-05',
  'avatar-06',
  'avatar-07',
  'avatar-08',
  'avatar-09',
  'avatar-10',
];

export const AVATAR_SOURCES: Record<AvatarKey, ImageSourcePropType> = {
  'avatar-01': require('../../assets/avatars/avatar-01.png'),
  'avatar-02': require('../../assets/avatars/avatar-02.png'),
  'avatar-03': require('../../assets/avatars/avatar-03.png'),
  'avatar-04': require('../../assets/avatars/avatar-04.png'),
  'avatar-05': require('../../assets/avatars/avatar-05.png'),
  'avatar-06': require('../../assets/avatars/avatar-06.png'),
  'avatar-07': require('../../assets/avatars/avatar-07.png'),
  'avatar-08': require('../../assets/avatars/avatar-08.png'),
  'avatar-09': require('../../assets/avatars/avatar-09.png'),
  'avatar-10': require('../../assets/avatars/avatar-10.png'),
  'avatar-11': require('../../assets/avatars/avatar-04.png'),
  'avatar-12': require('../../assets/avatars/avatar-05.png'),
};
