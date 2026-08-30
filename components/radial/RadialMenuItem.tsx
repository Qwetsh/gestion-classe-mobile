import React, { useEffect, useRef } from 'react';
import { StyleSheet, Text, Animated } from 'react-native';
import { MenuItemType, ITEM_SIZE, SUBMENU_ITEM_SIZE } from '../../constants/menuItems';
import { RadialIcon } from './RadialIcon';

interface RadialMenuItemProps {
  item: MenuItemType;
  index: number;
  totalItems: number;
  radius: number;
  isHovered: boolean;
  menuScale: Animated.Value;
  menuOpacity: Animated.Value;
  /**
   * 'quadrant' : icone + label poses sur le quadrant du SegmentedRing (menu principal).
   * 'circle'   : cercle 58px plein de la couleur de l'action (sous-menu Sortie).
   */
  variant?: 'quadrant' | 'circle';
}

export function RadialMenuItem({
  item,
  index,
  totalItems,
  radius,
  isHovered,
  menuScale,
  menuOpacity,
  variant = 'quadrant',
}: RadialMenuItemProps) {
  const angle = (index * 2 * Math.PI) / totalItems - Math.PI / 2;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;

  // Separate animated value for hover effect
  const hoverScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(hoverScale, {
      toValue: isHovered ? 1.15 : 1,
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

  if (variant === 'circle') {
    return (
      <Animated.View
        style={[
          styles.circleContainer,
          animatedStyle,
          {
            backgroundColor: item.color,
            shadowColor: '#000',
            shadowOpacity: isHovered ? 0.35 : 0.15,
            shadowRadius: isHovered ? 10 : 4,
            elevation: isHovered ? 8 : 3,
          },
        ]}
      >
        <RadialIcon name={item.icon} size={20} color="#FFFFFF" strokeWidth={2} />
        <Text style={styles.circleLabel} numberOfLines={1}>
          {item.label}
        </Text>
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.quadrantContainer, animatedStyle]} pointerEvents="none">
      <RadialIcon
        name={item.icon}
        size={22}
        color="#FFFFFF"
        strokeWidth={isHovered ? 2.2 : 1.9}
      />
      <Text style={styles.quadrantLabel} numberOfLines={1}>
        {item.label}
      </Text>
      {item.id === 'participation' && (
        <Text style={styles.bonusHint} numberOfLines={1}>
          maintenir = bonus
        </Text>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  quadrantContainer: {
    position: 'absolute',
    width: ITEM_SIZE + 20,
    marginLeft: -(ITEM_SIZE + 20) / 2,
    marginTop: -ITEM_SIZE / 2,
    left: 0,
    top: 0,
    height: ITEM_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 3,
  },
  quadrantLabel: {
    fontFamily: 'IBMPlexSans_600SemiBold',
    fontSize: 10.5,
    color: '#FFFFFF',
    textAlign: 'center',
  },
  bonusHint: {
    fontFamily: 'IBMPlexSans_400Regular',
    fontSize: 9,
    color: 'rgba(255,255,255,0.75)',
    textAlign: 'center',
  },
  circleContainer: {
    position: 'absolute',
    width: SUBMENU_ITEM_SIZE,
    height: SUBMENU_ITEM_SIZE,
    marginLeft: -SUBMENU_ITEM_SIZE / 2,
    marginTop: -SUBMENU_ITEM_SIZE / 2,
    left: 0,
    top: 0,
    borderRadius: SUBMENU_ITEM_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 1,
    shadowOffset: { width: 0, height: 2 },
  },
  circleLabel: {
    fontFamily: 'IBMPlexSans_600SemiBold',
    fontSize: 8,
    color: '#FFFFFF',
    textAlign: 'center',
    maxWidth: SUBMENU_ITEM_SIZE - 6,
  },
});
