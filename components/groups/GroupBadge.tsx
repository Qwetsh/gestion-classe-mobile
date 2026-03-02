import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getGroupColor } from '../../constants/groups';

interface GroupBadgeProps {
  groupNumber: number;
  size?: 'small' | 'medium' | 'large';
  style?: object;
}

/**
 * Badge displaying group number with color coding
 * Used on student cells in the seating chart
 */
export function GroupBadge({ groupNumber, size = 'small', style }: GroupBadgeProps) {
  const color = getGroupColor(groupNumber);
  const dimensions = SIZE_MAP[size];

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: color,
          width: dimensions.size,
          height: dimensions.size,
          borderRadius: dimensions.size / 2,
        },
        style,
      ]}
    >
      <Text style={[styles.text, { fontSize: dimensions.fontSize }]}>
        {groupNumber}
      </Text>
    </View>
  );
}

const SIZE_MAP = {
  small: { size: 16, fontSize: 10 },
  medium: { size: 24, fontSize: 14 },
  large: { size: 32, fontSize: 18 },
};

const styles = StyleSheet.create({
  badge: {
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
