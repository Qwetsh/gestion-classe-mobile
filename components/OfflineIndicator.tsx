import { View, Text, StyleSheet, Animated } from 'react-native';
import { useEffect, useRef } from 'react';
import { useIsOffline } from '../stores';
import { theme } from '../constants/theme';

export function OfflineIndicator() {
  const isOffline = useIsOffline();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: isOffline ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [isOffline, fadeAnim]);

  if (!isOffline) {
    return null;
  }

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }]}>
      <View style={styles.content}>
        <Text style={styles.icon}>○</Text>
        <Text style={styles.text}>Mode hors-ligne</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: theme.colors.textTertiary,
    paddingTop: 4,
    paddingBottom: 4,
  },
  content: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  icon: {
    fontSize: 8,
    color: theme.colors.textInverse,
  },
  text: {
    fontSize: 12,
    color: theme.colors.textInverse,
    fontWeight: '500',
  },
});
