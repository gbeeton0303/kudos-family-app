import * as ImagePicker from 'expo-image-picker';
import { Alert, Platform } from 'react-native';

type PhotoKind = 'profile' | 'task' | 'reward';

async function pickFromLibrary(kind: PhotoKind): Promise<string | null> {
  // Apple's system picker grants access only to the photo the person selects,
  // so an up-front full-library permission request is unnecessary here.
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
  });
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;
  return asset.base64 ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}` : asset.uri;
}

async function takeWithCamera(kind: PhotoKind): Promise<string | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('Camera access needed', `Allow camera access to take a custom ${kind} photo.`);
    return null;
  }
  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true,
  });
  const asset = result.assets?.[0];
  if (result.canceled || !asset) return null;
  return asset.base64 ? `data:${asset.mimeType ?? 'image/jpeg'};base64,${asset.base64}` : asset.uri;
}

export function choosePhotoSource(kind: PhotoKind): Promise<string | null> {
  return new Promise((resolve) => {
    const options = [
      { text: 'Take Photo', onPress: () => void takeWithCamera(kind).then(resolve) },
      { text: 'Choose from Library', onPress: () => void pickFromLibrary(kind).then(resolve) },
      { text: 'Cancel', style: 'cancel' as const, onPress: () => resolve(null) },
    ];
    Alert.alert(`Add ${kind} photo`, 'Take a new picture or choose one from your photo library.', options, { cancelable: Platform.OS === 'android', onDismiss: () => resolve(null) });
  });
}
