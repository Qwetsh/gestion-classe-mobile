import { useCallback, useRef, useState, useEffect } from 'react';
import { Animated } from 'react-native';
import { MENU_ITEMS, MenuItemType, MENU_RADIUS, SUBMENU_RADIUS } from '../constants/menuItems';
import {
  triggerLightFeedback,
  triggerMediumFeedback,
  triggerSuccessFeedback,
} from '../utils/haptics';
import {
  EdgeProximity,
  calculateClampedMenuPosition,
  calculateSubmenuPosition,
} from '../utils/menuPositioning';

export type MenuState = 'closed' | 'open' | 'submenu';
export type { EdgeProximity } from '../utils/menuPositioning';

export interface RadialMenuSelection {
  itemId: string;
  parentId?: string; // For submenu items
  label: string;
}

const SUBMENU_HOVER_DELAY = 300;

export function useRadialMenu(onSelect?: (selection: RadialMenuSelection) => void) {
  const [menuState, setMenuState] = useState<MenuState>('closed');
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedItem, setSelectedItem] = useState<MenuItemType | null>(null);
  const [hoveredItem, setHoveredItem] = useState<MenuItemType | null>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<MenuItemType | null>(null);
  const [edgeProximity, setEdgeProximity] = useState<EdgeProximity>({
    left: false,
    right: false,
    top: false,
    bottom: false,
  });

  // Refs for values needed in callbacks (to avoid stale closures)
  const lastHoveredIdRef = useRef<string | null>(null);
  const submenuTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const menuStateRef = useRef<MenuState>('closed');
  const menuPositionRef = useRef({ x: 0, y: 0 });
  const activeSubmenuRef = useRef<MenuItemType | null>(null);
  const onSelectRef = useRef(onSelect);

  // Keep onSelect ref updated
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  // Animated values
  const menuScale = useRef(new Animated.Value(0)).current;
  const menuOpacity = useRef(new Animated.Value(0)).current;
  const submenuScale = useRef(new Animated.Value(0)).current;
  const submenuOpacity = useRef(new Animated.Value(0)).current;

  // Keep refs in sync with state
  useEffect(() => {
    menuStateRef.current = menuState;
  }, [menuState]);

  useEffect(() => {
    menuPositionRef.current = menuPosition;
  }, [menuPosition]);

  useEffect(() => {
    activeSubmenuRef.current = activeSubmenu;
  }, [activeSubmenu]);

  const clearSubmenuTimeout = useCallback(() => {
    if (submenuTimeoutRef.current) {
      clearTimeout(submenuTimeoutRef.current);
      submenuTimeoutRef.current = null;
    }
  }, []);

  const openMenu = useCallback((x: number, y: number) => {
    // Use shared utility for position clamping
    const { position, edgeProximity: edges } = calculateClampedMenuPosition(x, y);

    setEdgeProximity(edges);
    setMenuPosition(position);
    menuPositionRef.current = position;
    setMenuState('open');
    menuStateRef.current = 'open';
    setSelectedItem(null);
    setHoveredItem(null);
    setActiveSubmenu(null);
    activeSubmenuRef.current = null;
    lastHoveredIdRef.current = null;
    clearSubmenuTimeout();

    // Reset animated values first
    menuScale.setValue(0);
    menuOpacity.setValue(0);

    Animated.parallel([
      Animated.spring(menuScale, {
        toValue: 1,
        damping: 15,
        stiffness: 300,
        mass: 0.5,
        useNativeDriver: true,
      }),
      Animated.timing(menuOpacity, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    triggerMediumFeedback();
  }, [menuScale, menuOpacity, clearSubmenuTimeout]);

  const closeMenu = useCallback(() => {
    clearSubmenuTimeout();

    Animated.parallel([
      Animated.spring(menuScale, {
        toValue: 0,
        damping: 20,
        stiffness: 400,
        useNativeDriver: true,
      }),
      Animated.timing(menuOpacity, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.spring(submenuScale, {
        toValue: 0,
        damping: 20,
        stiffness: 400,
        useNativeDriver: true,
      }),
      Animated.timing(submenuOpacity, {
        toValue: 0,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    setTimeout(() => {
      setMenuState('closed');
      menuStateRef.current = 'closed';
      setActiveSubmenu(null);
      activeSubmenuRef.current = null;
      setHoveredItem(null);
      lastHoveredIdRef.current = null;
    }, 150);
  }, [menuScale, menuOpacity, submenuScale, submenuOpacity, clearSubmenuTimeout]);

  const openSubmenu = useCallback((item: MenuItemType) => {
    setActiveSubmenu(item);
    activeSubmenuRef.current = item;
    setMenuState('submenu');
    menuStateRef.current = 'submenu';
    setHoveredItem(null);
    lastHoveredIdRef.current = null;

    // Reset submenu animated values
    submenuScale.setValue(0);
    submenuOpacity.setValue(0);

    Animated.parallel([
      Animated.spring(submenuScale, {
        toValue: 1,
        damping: 15,
        stiffness: 300,
        mass: 0.5,
        useNativeDriver: true,
      }),
      Animated.timing(submenuOpacity, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    triggerLightFeedback();
  }, [submenuScale, submenuOpacity]);

  const getItemAtPosition = useCallback((
    touchX: number,
    touchY: number,
    items: MenuItemType[],
    centerX: number,
    centerY: number,
    radius: number
  ): MenuItemType | null => {
    const dx = touchX - centerX;
    const dy = touchY - centerY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Very forgiving radius detection
    const minRadius = 25;
    const maxRadius = radius * 2.5;

    if (distance < minRadius || distance > maxRadius) {
      return null;
    }

    // Calculate angle (in radians, 0 at top, clockwise)
    let angle = Math.atan2(dx, -dy);
    if (angle < 0) angle += 2 * Math.PI;

    // Determine which item based on angle
    const itemCount = items.length;
    const anglePerItem = (2 * Math.PI) / itemCount;
    const itemIndex = Math.floor((angle + anglePerItem / 2) % (2 * Math.PI) / anglePerItem);

    return items[itemIndex] || null;
  }, []);

  const handleTouchMove = useCallback((touchX: number, touchY: number) => {
    const currentMenuState = menuStateRef.current;
    if (currentMenuState === 'closed') return;

    const currentPosition = menuPositionRef.current;
    const currentActiveSubmenu = activeSubmenuRef.current;

    let currentItems: MenuItemType[];
    let centerX: number;
    let centerY: number;
    let radius: number;

    if (currentMenuState === 'submenu' && currentActiveSubmenu?.subItems) {
      currentItems = currentActiveSubmenu.subItems;
      // Use shared utility for submenu position (synced with visual)
      const submenuPos = calculateSubmenuPosition(currentActiveSubmenu, currentPosition);
      centerX = currentPosition.x + submenuPos.x;
      centerY = currentPosition.y + submenuPos.y;
      radius = SUBMENU_RADIUS;
    } else {
      currentItems = MENU_ITEMS;
      centerX = currentPosition.x;
      centerY = currentPosition.y;
      radius = MENU_RADIUS;
    }

    const item = getItemAtPosition(touchX, touchY, currentItems, centerX, centerY, radius);

    if (item && item.id !== lastHoveredIdRef.current) {
      lastHoveredIdRef.current = item.id;
      setHoveredItem(item);
      triggerLightFeedback();

      clearSubmenuTimeout();

      if (item.subItems && item.subItems.length > 0 && currentMenuState === 'open') {
        submenuTimeoutRef.current = setTimeout(() => {
          openSubmenu(item);
        }, SUBMENU_HOVER_DELAY);
      }
    } else if (!item && lastHoveredIdRef.current) {
      lastHoveredIdRef.current = null;
      setHoveredItem(null);
      clearSubmenuTimeout();
    }
  }, [getItemAtPosition, openSubmenu, clearSubmenuTimeout]);

  const handleSelection = useCallback((touchX: number, touchY: number) => {
    const currentMenuState = menuStateRef.current;
    if (currentMenuState === 'closed') return;

    clearSubmenuTimeout();

    const currentPosition = menuPositionRef.current;
    const currentActiveSubmenu = activeSubmenuRef.current;

    let currentItems: MenuItemType[];
    let centerX: number;
    let centerY: number;
    let radius: number;

    if (currentMenuState === 'submenu' && currentActiveSubmenu?.subItems) {
      currentItems = currentActiveSubmenu.subItems;
      // Use shared utility for submenu position (synced with visual)
      const submenuPos = calculateSubmenuPosition(currentActiveSubmenu, currentPosition);
      centerX = currentPosition.x + submenuPos.x;
      centerY = currentPosition.y + submenuPos.y;
      radius = SUBMENU_RADIUS;
    } else {
      currentItems = MENU_ITEMS;
      centerX = currentPosition.x;
      centerY = currentPosition.y;
      radius = MENU_RADIUS;
    }

    const item = getItemAtPosition(touchX, touchY, currentItems, centerX, centerY, radius);

    if (item) {
      if (item.subItems && item.subItems.length > 0 && currentMenuState !== 'submenu') {
        openSubmenu(item);
        return;
      }

      const selection: RadialMenuSelection = {
        itemId: item.id,
        parentId: currentMenuState === 'submenu' ? currentActiveSubmenu?.id : undefined,
        label: currentMenuState === 'submenu' && currentActiveSubmenu
          ? `${currentActiveSubmenu.label} > ${item.label}`
          : item.label,
      };

      setSelectedItem(item);
      triggerSuccessFeedback();

      // Call the onSelect callback
      if (onSelectRef.current) {
        onSelectRef.current(selection);
      }

      closeMenu();
    } else {
      closeMenu();
    }
  }, [getItemAtPosition, openSubmenu, closeMenu, clearSubmenuTimeout]);

  return {
    menuState,
    menuPosition,
    selectedItem,
    hoveredItem,
    activeSubmenu,
    edgeProximity,
    menuScale,
    menuOpacity,
    submenuScale,
    submenuOpacity,
    openMenu,
    closeMenu,
    handleTouchMove,
    handleSelection,
  };
}
