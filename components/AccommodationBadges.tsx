import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { theme } from '../constants/theme';
import { accommodationTags, type StudentAccommodations } from '../utils/accommodations';

interface Props {
  student: StudentAccommodations | null | undefined;
  /** `xs` : sièges du plan de classe (très compact) ; `sm` : listes. */
  size?: 'xs' | 'sm';
  style?: StyleProp<ViewStyle>;
}

/**
 * Pastilles « PAP » / « PPRE » / « PAI ». Ne rend rien si l'élève n'a aucun dispositif.
 * Aucun détail n'est affiché : seulement le type de dispositif.
 */
export const AccommodationBadges = React.memo(function AccommodationBadges({ student, size = 'sm', style }: Props) {
  const tags = accommodationTags(student);
  if (tags.length === 0) return null;
  const xs = size === 'xs';
  return (
    <View style={[styles.row, xs && styles.rowXs, style]} pointerEvents="none">
      {tags.map(tag => (
        <View key={tag} style={[styles.badge, xs && styles.badgeXs]}>
          <Text style={[styles.text, xs && styles.textXs]}>{tag}</Text>
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
  },
  rowXs: {
    gap: 2,
  },
  badge: {
    backgroundColor: theme.colors.primarySoft,
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  badgeXs: {
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  text: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 9,
    lineHeight: 11,
    color: theme.colors.primary,
    letterSpacing: 0.2,
  },
  textXs: {
    fontSize: 7,
    lineHeight: 8,
  },
});
