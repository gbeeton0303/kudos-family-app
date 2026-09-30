import { memo, useEffect, useMemo } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { AVATAR_SOURCES } from '../data/avatarAssets';
import type { AppTheme } from '../theme';
import type { ProfileAvatar as ProfileAvatarValue } from '../types';

type ProfileAvatarProps = {
  avatar: ProfileAvatarValue;
  theme: AppTheme;
  size?: number;
  color?: string;
  accessibilityLabel?: string;
};

const remoteSourceCache = new Map<string, { uri: string }>();
function cachedRemoteSource(uri: string) {
  const existing = remoteSourceCache.get(uri);
  if (existing) return existing;
  const source = { uri };
  remoteSourceCache.set(uri, source);
  return source;
}

function ProfileAvatarComponent({ avatar, theme, size = 56, color, accessibilityLabel }: ProfileAvatarProps) {
  const source = useMemo(() => avatar.type === 'photo' ? cachedRemoteSource(avatar.uri) : AVATAR_SOURCES[avatar.key], [avatar]);

  useEffect(() => {
    if (avatar.type === 'photo' && /^(https?:)?\/\//.test(avatar.uri)) Image.prefetch(avatar.uri).catch(() => undefined);
  }, [avatar]);

  return <View style={[styles.frame,{backgroundColor:color??theme.primarySoft,borderColor:theme.surface,borderRadius:size*.34,height:size,width:size}]}>
    <Image accessibilityLabel={accessibilityLabel} fadeDuration={0} resizeMethod="resize" resizeMode="cover" source={source} style={styles.image}/>
  </View>;
}

export const ProfileAvatar = memo(ProfileAvatarComponent, (previous, next) =>
  previous.size === next.size && previous.color === next.color && previous.theme.surface === next.theme.surface && previous.theme.primarySoft === next.theme.primarySoft && JSON.stringify(previous.avatar) === JSON.stringify(next.avatar)
);

const styles=StyleSheet.create({frame:{alignItems:'center',borderWidth:2,justifyContent:'center',overflow:'hidden'},image:{height:'100%',width:'100%'}});
