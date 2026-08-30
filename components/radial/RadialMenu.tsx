import React from 'react';
import { StyleSheet, Text, View, Animated } from 'react-native';
import { MENU_ITEMS, MenuItemType, MENU_RADIUS, CENTER_RADIUS } from '../../constants/menuItems';
import { RadialMenuItem } from './RadialMenuItem';
import { SubMenu } from './SubMenu';
import { SegmentedRing } from './SegmentedRing';
import { MenuState, EdgeProximity } from '../../hooks/useRadialMenu';
import type { MenuBounds } from '../../utils/menuPositioning';

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
  /** Prenom/nom de l'eleve affiche dans le disque central + pill bas d'ecran. */
  studentName?: string | null;
  /** Limites de la zone de rendu (doivent matcher celles passees a openMenu). */
  bounds?: MenuBounds;
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
  studentName,
  bounds,
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

        {/* Disque central blanc : nom de l'eleve, relacher dedans = annulation */}
        <Animated.View
          style={[
            styles.centerDisc,
            {
              opacity: menuOpacity,
              transform: [{ scale: menuScale }],
            },
          ]}
        >
          <Text style={styles.centerDiscText} numberOfLines={2}>
            {studentName || ''}
          </Text>
        </Animated.View>

        {menuState === 'submenu' && activeSubmenu && (
          <SubMenu
            parentItem={activeSubmenu}
            hoveredItem={hoveredItem}
            menuPosition={position}
            edgeProximity={edgeProximity}
            submenuScale={submenuScale}
            submenuOpacity={submenuOpacity}
            bounds={bounds}
          />
        )}
      </View>

      {/* Pill bas d'ecran */}
      {studentName ? (
        <Animated.View style={[styles.bottomPill, { opacity: menuOpacity }]}>
          <Text style={styles.bottomPillText} numberOfLines={1}>
            {studentName} · relâcher au centre pour annuler
          </Text>
        </Animated.View>
      ) : null}
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
  centerDisc: {
    position: 'absolute',
    width: CENTER_RADIUS * 2,
    height: CENTER_RADIUS * 2,
    borderRadius: CENTER_RADIUS,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
  },
  centerDiscText: {
    fontFamily: 'IBMPlexSans_600SemiBold',
    fontSize: 10.5,
    color: '#1F2433',
    textAlign: 'center',
  },
  bottomPill: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
    maxWidth: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  bottomPillText: {
    fontFamily: 'IBMPlexSans_500Medium',
    fontSize: 12.5,
    color: '#1F2433',
  },
});
