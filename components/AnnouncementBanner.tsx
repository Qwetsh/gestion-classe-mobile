import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { supabase } from '../services/supabase';
import { theme } from '../constants/theme';

const AUTO_DISMISS_MS = 5000;
const SWIPE_THRESHOLD = 80;

interface Announcement {
  id: string;
  message: string;
  type: 'info' | 'warning' | 'success';
}

const typeConfig = {
  info: { bg: theme.colors.primarySoft, color: theme.colors.primary, icon: 'ℹ️' },
  warning: { bg: '#fef3c7', color: '#d97706', icon: '⚠️' },
  success: { bg: theme.colors.participationSoft, color: theme.colors.participation, icon: '✅' },
};

function AnnouncementItem({
  announcement,
  onDismiss,
}: {
  announcement: Announcement;
  onDismiss: (id: string) => void;
}) {
  const config = typeConfig[announcement.type];
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(1);

  const dismiss = useCallback(() => {
    onDismiss(announcement.id);
  }, [announcement.id, onDismiss]);

  const animateOut = useCallback((direction: number) => {
    translateX.value = withTiming(direction * 300, { duration: 200 });
    opacity.value = withTiming(0, { duration: 200 }, () => {
      runOnJS(dismiss)();
    });
  }, [translateX, opacity, dismiss]);

  // Auto-dismiss after 5s
  useEffect(() => {
    const timer = setTimeout(() => {
      animateOut(1);
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [animateOut]);

  const panGesture = Gesture.Pan()
    .activeOffsetX([-15, 15])
    .onUpdate((e) => {
      translateX.value = e.translationX;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > SWIPE_THRESHOLD) {
        const direction = e.translationX > 0 ? 1 : -1;
        translateX.value = withTiming(direction * 300, { duration: 150 });
        opacity.value = withTiming(0, { duration: 150 }, () => {
          runOnJS(dismiss)();
        });
      } else {
        translateX.value = withTiming(0, { duration: 150 });
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.banner, { backgroundColor: config.bg }, animatedStyle]}>
        <Text style={[styles.text, { color: config.color }]}>
          {config.icon}  {announcement.message}
        </Text>
        <Pressable
          onPress={() => animateOut(1)}
          hitSlop={8}
        >
          <Text style={[styles.dismiss, { color: config.color }]}>✕</Text>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

export function AnnouncementBanner() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!supabase) return;
    supabase
      .from('announcements')
      .select('id, message, type')
      .eq('active', true)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setAnnouncements(data);
      });
  }, []);

  const handleDismiss = useCallback((id: string) => {
    setDismissed(prev => new Set(prev).add(id));
  }, []);

  const visible = announcements.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <View style={styles.container}>
      {visible.map(a => (
        <AnnouncementItem
          key={a.id}
          announcement={a}
          onDismiss={handleDismiss}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 4,
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm + 2,
    borderRadius: theme.radius.lg,
  },
  text: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    marginRight: theme.spacing.sm,
  },
  dismiss: {
    fontSize: 16,
    fontWeight: '600',
    opacity: 0.7,
  },
});
