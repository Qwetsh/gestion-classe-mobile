/**
 * Vignette d'une photo de TP : le fichier du téléphone s'il est encore là (pas besoin de
 * réseau), sinon une adresse signée du serveur.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { CloudOff } from 'lucide-react-native';
import { theme } from '../../constants/theme';
import type { GroupSessionPhoto } from '../../types';
import { getTpPhotoSignedUrl, localPhotoExists } from '../../services/photos/tpPhotos';

interface Props {
  photo: GroupSessionPhoto;
  size: number;
  label?: string;
  onPress?: () => void;
}

export function useTpPhotoUri(photo: GroupSessionPhoto | null): string | null {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUri(null);
    if (!photo) return;
    (async () => {
      if (await localPhotoExists(photo.localUri)) {
        if (alive) setUri(photo.localUri);
        return;
      }
      if (photo.uploaded) {
        const signed = await getTpPhotoSignedUrl(photo.filePath);
        if (alive) setUri(signed);
      }
    })();
    return () => {
      alive = false;
    };
  }, [photo?.id, photo?.localUri, photo?.uploaded, photo?.filePath]);
  return uri;
}

export function TpPhotoThumb({ photo, size, label, onPress }: Props) {
  const uri = useTpPhotoUri(photo);
  return (
    <Pressable onPress={onPress} style={[styles.box, { width: size, height: size }]} accessibilityLabel={label ? `Photo, ${label}` : 'Photo'}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={styles.placeholder}>
          <ActivityIndicator size="small" color={theme.colors.textTertiary} />
        </View>
      )}
      {!photo.uploaded && (
        <View style={styles.pending} accessibilityLabel="Pas encore envoyée">
          <CloudOff size={12} color="#FFFFFF" />
        </View>
      )}
      {label && (
        <View style={styles.who}>
          <Text style={styles.whoText}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: { borderRadius: 12, overflow: 'hidden', backgroundColor: theme.colors.border },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pending: {
    position: 'absolute', top: 4, right: 4, width: 20, height: 20, borderRadius: 10,
    backgroundColor: 'rgba(15,23,42,0.6)', alignItems: 'center', justifyContent: 'center',
  },
  who: {
    position: 'absolute', left: 4, bottom: 4, height: 18, paddingHorizontal: 5, borderRadius: 5,
    backgroundColor: 'rgba(255,255,255,0.9)', justifyContent: 'center',
  },
  whoText: { fontSize: 10, fontFamily: theme.fonts.bodyBold, color: theme.colors.text },
});
