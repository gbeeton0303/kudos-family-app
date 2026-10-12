import { useAssets } from 'expo-asset';
import { Image, type ImageProps } from 'react-native';

// In Metro development mode, a require() can resolve to the computer's asset
// server. Prefer Expo's downloaded device-local file once it is available.
// Standalone builds already package these assets and need no network download.
export function CachedAssetImage({ source, ...props }: Omit<ImageProps, 'source'> & { source: number }) {
  const [assets] = useAssets([source]);
  const localUri = assets?.[0]?.localUri;
  return <Image {...props} source={localUri ? { uri: localUri } : source} />;
}
