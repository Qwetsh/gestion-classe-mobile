import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Animated } from 'react-native';
import { MenuItemType, ITEM_SIZE } from '../../constants/menuItems';

interface RadialMenuItemProps {
  item: MenuItemType;
  index: number;
  totalItems: number;
  radius: number;
  isHovered: boolean;
  menuScale: Animated.Value;
  menuOpacity: Animated.Value;
}

export function RadialMenuItem({
  item,
  index,
  totalItems,
  radius,
  isHovered,
  menuScale,
  menuOpacity,
}: RadialMenuItemProps) {
  const angle = (index * 2 * Math.PI) / totalItems - Math.PI / 2;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;

  // Separate animated value for hover effect
  const hoverScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(hoverScale, {
      toValue: isHovered ? 1.2 : 1,
      damping: 18,
      stiffness: 280,
      useNativeDriver: true,
    }).start();
  }, [isHovered, hoverScale]);

  const animatedStyle = {
    opacity: menuOpacity,
    transform: [
      {
        translateX: menuScale.interpolate({
          inputRange: [0, 1],
          outputRange: [0, x],
        }),
      },
      {
        translateY: menuScale.interpolate({
          inputRange: [0, 1],
          outputRange: [0, y],
        }),
      },
      {
        scale: Animated.multiply(
          menuScale.interpolate({
            inputRange: [0, 1],
            outputRange: [0.3, 1],
          }),
          hoverScale
        ),
      },
    ],
  };

  return (
    <Animated.View
      style={[
        styles.itemContainer,
        animatedStyle,
        {
          backgroundColor: isHovered ? item.color : `${item.color}20`,
          borderColor: isHovered ? `${item.color}` : 'rgba(255,255,255,0.15)',
          borderWidth: 1.5,
          shadowColor: isHovered ? item.color : '#000',
          shadowOpacity: isHovered ? 0.4 : 0.1,
          shadowRadius: isHovered ? 12 : 4,
          elevation: isHovered ? 8 : 3,
        },
      ]}
    >
      <Text style={[styles.icon, isHovered && styles.iconHovered]}>{item.icon}</Text>
      <Text
        style={[
          styles.label,
          isHovered && styles.labelHovered,
          { color: isHovered ? '#FFFFFF' : 'rgba(255,255,255,0.9)' },
        ]}
        numberOfLines={1}
      >
        {item.label}
      </Text>
      {item.subItems && (
        <View style={[styles.submenuIndicator, isHovered && styles.submenuIndicatorHovered]}>
          <Text style={styles.submenuArrow}>›</Text>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  itemContainer: {
    position: 'absolute',
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    borderRadius: ITEM_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
  },
  icon: {
    fontSize: 22,
    marginBottom: 2,
  },
  iconHovered: {
    fontSize: 26,
  },
  label: {
    fontSize: 9,
    fontWeight: '600',
    textAlign: 'center',
    maxWidth: ITEM_SIZE - 8,
  },
  labelHovered: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  submenuIndicator: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  submenuIndicatorHovered: {
    backgroundColor: 'rgba(255,255,255,0.5)',
  },
  submenuArrow: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});
