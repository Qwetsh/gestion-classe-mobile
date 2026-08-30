import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { AlertTriangle, Check } from 'lucide-react-native';
import { theme } from '../../constants/theme';

interface UndoBannerProps {
  visible: boolean;
  message: string;
  /** 'success' = vert avec lien Annuler ; 'error' = rouge sans undo. */
  variant?: 'success' | 'error';
  /** Affiche le lien "Annuler" (uniquement si l'evenement a bien ete cree). */
  canUndo?: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}

const AUTO_DISMISS_MS = 4000;

/**
 * Banniere de confirmation en haut d'ecran (toute action rapide) :
 * "✓ {eleve} · +1 Implication — Annuler", auto-dismiss 4 s.
 * En variante 'error', signale un echec d'enregistrement.
 */
export function UndoBanner({
  visible,
  message,
  variant = 'success',
  canUndo = true,
  onUndo,
  onDismiss,
}: UndoBannerProps) {
  const translateY = useRef(new Animated.Value(-80)).current;
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (visible) {
      Animated.spring(translateY, {
        toValue: 0,
        damping: 18,
        stiffness: 260,
        useNativeDriver: true,
      }).start();
      timerRef.current = setTimeout(onDismiss, AUTO_DISMISS_MS);
    } else {
      Animated.timing(translateY, {
        toValue: -80,
        duration: 180,
        useNativeDriver: true,
      }).start();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible, message, translateY, onDismiss]);

  if (!visible) return null;

  const isError = variant === 'error';

  return (
    <Animated.View
      style={[
        styles.banner,
        isError && styles.bannerError,
        { transform: [{ translateY }] },
      ]}
    >
      {isError ? (
        <AlertTriangle size={16} color={theme.colors.textInverse} strokeWidth={2.5} />
      ) : (
        <Check size={16} color={theme.colors.textInverse} strokeWidth={2.5} />
      )}
      <Text style={styles.text} numberOfLines={1}>
        {message}
      </Text>
      {!isError && canUndo && (
        <Pressable onPress={onUndo} hitSlop={8}>
          <Text style={styles.undoText}>Annuler</Text>
        </Pressable>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 8,
    left: theme.spacing.md,
    right: theme.spacing.md,
    zIndex: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
    backgroundColor: theme.colors.action,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: theme.spacing.md,
    ...theme.shadows.md,
  },
  bannerError: {
    backgroundColor: theme.colors.error,
  },
  text: {
    flex: 1,
    fontFamily: theme.fonts.bodySemibold,
    fontSize: 13.5,
    color: theme.colors.textInverse,
  },
  undoText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 13.5,
    color: theme.colors.textInverse,
    textDecorationLine: 'underline',
  },
});
