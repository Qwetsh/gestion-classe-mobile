import { useEffect, useState } from 'react';
import { Image, Text, type ImageStyle, type StyleProp } from 'react-native';
import { getStudentPhotoUrl } from '../services/photos';

/**
 * Photo jointe à une remarque. La base garde le chemin du fichier dans le stockage, pas une
 * adresse : il faut demander une adresse signée avant de l'afficher (passer le chemin tel quel
 * à <Image> n'affichait rien).
 */
export function RemarkPhoto({ path, style }: { path: string; style?: StyleProp<ImageStyle> }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    setFailed(false);
    getStudentPhotoUrl(path)
      .then((u) => { if (alive) { if (u) setUrl(u); else setFailed(true); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [path]);

  if (failed) return <Text style={{ fontSize: 12, opacity: 0.6 }}>Photo indisponible (réseau)</Text>;
  if (!url) return null;
  return <Image source={{ uri: url }} style={style} resizeMode="cover" />;
}
