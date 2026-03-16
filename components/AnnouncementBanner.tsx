import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { supabase } from '../services/supabase';
import { theme } from '../constants/theme';

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

  const visible = announcements.filter(a => !dismissed.has(a.id));
  if (visible.length === 0) return null;

  return (
    <View style={styles.container}>
      {visible.map(a => {
        const config = typeConfig[a.type];
        return (
          <View key={a.id} style={[styles.banner, { backgroundColor: config.bg }]}>
            <Text style={[styles.text, { color: config.color }]}>
              {config.icon}  {a.message}
            </Text>
            <Pressable
              onPress={() => setDismissed(prev => new Set(prev).add(a.id))}
              hitSlop={8}
            >
              <Text style={[styles.dismiss, { color: config.color }]}>✕</Text>
            </Pressable>
          </View>
        );
      })}
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
