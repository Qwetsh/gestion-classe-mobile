import { Dimensions } from 'react-native';
import { MENU_RADIUS, SUBMENU_RADIUS, ITEM_SIZE, MENU_ITEMS, MenuItemType } from '../constants/menuItems';

export interface EdgeProximity {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
}

export interface SubmenuPosition {
  x: number;
  y: number;
}

/**
 * Calculate the adjusted submenu center position relative to menu center,
 * accounting for screen boundaries to prevent overflow.
 */
export function calculateSubmenuPosition(
  parentItem: MenuItemType,
  menuPosition: { x: number; y: number }
): SubmenuPosition {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  // Find parent item index and calculate its angle
  const parentIndex = MENU_ITEMS.findIndex(item => item.id === parentItem.id);
  const parentAngle = (parentIndex * 2 * Math.PI) / MENU_ITEMS.length - Math.PI / 2;

  // Original position based on parent item direction
  let submenuCenterX = Math.cos(parentAngle) * MENU_RADIUS;
  let submenuCenterY = Math.sin(parentAngle) * MENU_RADIUS;

  // Calculate absolute position to check boundaries
  const absoluteX = menuPosition.x + submenuCenterX;
  const absoluteY = menuPosition.y + submenuCenterY;

  // Required space for submenu
  const submenuSpace = SUBMENU_RADIUS + ITEM_SIZE / 2 + 20;

  // Check if submenu would go off-screen and flip if needed
  let flipX = false;
  let flipY = false;

  // Check horizontal bounds
  if (absoluteX - submenuSpace < 0) {
    flipX = submenuCenterX < 0;
  } else if (absoluteX + submenuSpace > screenWidth) {
    flipX = submenuCenterX > 0;
  }

  // Check vertical bounds
  if (absoluteY - submenuSpace < 0) {
    flipY = submenuCenterY < 0;
  } else if (absoluteY + submenuSpace > screenHeight) {
    flipY = submenuCenterY > 0;
  }

  // Apply flips
  if (flipX) {
    submenuCenterX = -submenuCenterX;
  }
  if (flipY) {
    submenuCenterY = -submenuCenterY;
  }

  // Final boundary check (corner cases)
  const finalAbsoluteX = menuPosition.x + submenuCenterX;
  const finalAbsoluteY = menuPosition.y + submenuCenterY;

  if (finalAbsoluteX - submenuSpace < 0) {
    submenuCenterX = submenuSpace - menuPosition.x;
  } else if (finalAbsoluteX + submenuSpace > screenWidth) {
    submenuCenterX = screenWidth - submenuSpace - menuPosition.x;
  }

  if (finalAbsoluteY - submenuSpace < 0) {
    submenuCenterY = submenuSpace - menuPosition.y;
  } else if (finalAbsoluteY + submenuSpace > screenHeight) {
    submenuCenterY = screenHeight - submenuSpace - menuPosition.y;
  }

  return { x: submenuCenterX, y: submenuCenterY };
}

/**
 * Calculate clamped menu position to keep menu within screen bounds.
 * Returns the clamped position and edge proximity info.
 */
export function calculateClampedMenuPosition(
  x: number,
  y: number
): { position: { x: number; y: number }; edgeProximity: EdgeProximity } {
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  // Calculate required margins
  const menuMargin = MENU_RADIUS + ITEM_SIZE / 2 + 10;
  const submenuExtraMargin = SUBMENU_RADIUS + ITEM_SIZE / 2;
  const totalMargin = menuMargin + submenuExtraMargin;

  // Detect edge proximity BEFORE clamping
  const edgeProximity: EdgeProximity = {
    left: x < totalMargin,
    right: x > screenWidth - totalMargin,
    top: y < totalMargin,
    bottom: y > screenHeight - totalMargin,
  };

  // Clamp position
  const clampedX = Math.max(menuMargin, Math.min(screenWidth - menuMargin, x));
  const clampedY = Math.max(menuMargin, Math.min(screenHeight - menuMargin, y));

  return {
    position: { x: clampedX, y: clampedY },
    edgeProximity,
  };
}
