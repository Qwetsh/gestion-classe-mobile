import React from 'react';
import { StyleSheet, View, Animated } from 'react-native';
import { MenuItemType, SUBMENU_RADIUS } from '../../constants/menuItems';
import { RadialMenuItem } from './RadialMenuItem';
import { EdgeProximity, calculateSubmenuPosition } from '../../utils/menuPositioning';

interface SubMenuProps {
  parentItem: MenuItemType;
  hoveredItem: MenuItemType | null;
  menuPosition: { x: number; y: number };
  edgeProximity: EdgeProximity;
  submenuScale: Animated.Value;
  submenuOpacity: Animated.Value;
}

export function SubMenu({
  parentItem,
  hoveredItem,
  menuPosition,
  edgeProximity,
  submenuScale,
  submenuOpacity,
}: SubMenuProps) {
  if (!parentItem.subItems) return null;

  // Use shared utility for position calculation
  const submenuPos = calculateSubmenuPosition(parentItem, menuPosition);

  return (
    <View
      style={[
        styles.container,
        {
          left: submenuPos.x,
          top: submenuPos.y,
        },
      ]}
    >
      <Animated.View style={[styles.background, { opacity: submenuOpacity }]} />

      {parentItem.subItems.map((subItem, index) => (
        <RadialMenuItem
          key={subItem.id}
          item={subItem}
          index={index}
          totalItems={parentItem.subItems!.length}
          radius={SUBMENU_RADIUS}
          isHovered={hoveredItem?.id === subItem.id}
          menuScale={submenuScale}
          menuOpacity={submenuOpacity}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  background: {
    position: 'absolute',
    width: SUBMENU_RADIUS * 2 + 80,
    height: SUBMENU_RADIUS * 2 + 80,
    borderRadius: SUBMENU_RADIUS + 40,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
  },
});
