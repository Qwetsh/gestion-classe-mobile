import React from 'react';
import { StyleSheet, View, Animated } from 'react-native';
import { MENU_ITEMS, MenuItemType, MENU_RADIUS } from '../../constants/menuItems';
import { RadialMenuItem } from './RadialMenuItem';
import { SubMenu } from './SubMenu';
import { SegmentedRing } from './SegmentedRing';
import { MenuState, EdgeProximity } from '../../hooks/useRadialMenu';

interface RadialMenuProps {
  visible: boolean;
  menuState: MenuState;
  position: { x: number; y: number };
  hoveredItem: MenuItemType | null;
  activeSubmenu: MenuItemType | null;
  edgeProximity: EdgeProximity;
  menuScale: Animated.Value;
  menuOpacity: Animated.Value;
  submenuScale: Animated.Value;
  submenuOpacity: Animated.Value;
  bonusFillProgress: Animated.Value;
}

export function RadialMenu({
  visible,
  menuState,
  position,
  hoveredItem,
  activeSubmenu,
  edgeProximity,
  menuScale,
  menuOpacity,
  submenuScale,
  submenuOpacity,
  bonusFillProgress,
}: RadialMenuProps) {
  if (!visible && menuState === 'closed') return null;

  const hoveredIndex = hoveredItem
    ? MENU_ITEMS.findIndex((item) => item.id === hoveredItem.id)
    : activeSubmenu
      ? MENU_ITEMS.findIndex((item) => item.id === activeSubmenu.id)
      : null;

  return (
    <Animated.View
      style={[
        styles.overlay,
        { opacity: menuOpacity },
      ]}
      pointerEvents="none"
    >
      <View
        style={[
          styles.menuContainer,
          {
            left: position.x,
            top: position.y,
          },
        ]}
      >
        <SegmentedRing
          menuScale={menuScale}
          menuOpacity={menuOpacity}
          hoveredIndex={hoveredIndex != null && hoveredIndex >= 0 ? hoveredIndex : null}
          bonusFillProgress={bonusFillProgress}
        />

        {MENU_ITEMS.map((item, index) => (
          <RadialMenuItem
            key={item.id}
            item={item}
            index={index}
            totalItems={MENU_ITEMS.length}
            radius={MENU_RADIUS}
            isHovered={
              (menuState === 'open' && hoveredItem?.id === item.id) ||
              (menuState === 'submenu' && activeSubmenu?.id === item.id)
            }
            menuScale={menuScale}
            menuOpacity={menuOpacity}
          />
        ))}

        {menuState === 'submenu' && activeSubmenu && (
          <SubMenu
            parentItem={activeSubmenu}
            hoveredItem={hoveredItem}
            menuPosition={position}
            edgeProximity={edgeProximity}
            submenuScale={submenuScale}
            submenuOpacity={submenuOpacity}
          />
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  menuContainer: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
