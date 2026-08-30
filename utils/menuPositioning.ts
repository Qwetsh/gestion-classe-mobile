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
 * Limites de la zone dans laquelle le menu doit rester entierement visible.
 * Les coordonnees du menu sont relatives a cette zone (ex : contentWrapper de
 * l'ecran de seance, qui commence sous le header). Sans bounds fournis, on
 * retombe sur les dimensions de l'ecran (comportement historique + tests).
 */
export interface MenuBounds {
  width: number;
  height: number;
}

function resolveBounds(bounds?: MenuBounds): MenuBounds {
  if (bounds && bounds.width > 0 && bounds.height > 0) return bounds;
  const { width, height } = Dimensions.get('window');
  return { width, height };
}

/** Clamp sur un axe, en centrant si la zone est trop etroite pour le menu. */
function clampAxis(value: number, margin: number, size: number): number {
  if (margin * 2 >= size) return size / 2;
  return Math.max(margin, Math.min(size - margin, value));
}

/**
 * Calculate the adjusted submenu center position relative to menu center,
 * accounting for boundaries to prevent overflow.
 */
export function calculateSubmenuPosition(
  parentItem: MenuItemType,
  menuPosition: { x: number; y: number },
  bounds?: MenuBounds
): SubmenuPosition {
  const { width: areaWidth, height: areaHeight } = resolveBounds(bounds);

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

  // Check if submenu would go off-area and flip if needed
  let flipX = false;
  let flipY = false;

  // Check horizontal bounds
  if (absoluteX - submenuSpace < 0) {
    flipX = submenuCenterX < 0;
  } else if (absoluteX + submenuSpace > areaWidth) {
    flipX = submenuCenterX > 0;
  }

  // Check vertical bounds
  if (absoluteY - submenuSpace < 0) {
    flipY = submenuCenterY < 0;
  } else if (absoluteY + submenuSpace > areaHeight) {
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
  } else if (finalAbsoluteX + submenuSpace > areaWidth) {
    submenuCenterX = areaWidth - submenuSpace - menuPosition.x;
  }

  if (finalAbsoluteY - submenuSpace < 0) {
    submenuCenterY = submenuSpace - menuPosition.y;
  } else if (finalAbsoluteY + submenuSpace > areaHeight) {
    submenuCenterY = areaHeight - submenuSpace - menuPosition.y;
  }

  return { x: submenuCenterX, y: submenuCenterY };
}

/**
 * Calculate clamped menu position to keep menu within the given bounds.
 * Returns the clamped position and edge proximity info.
 */
export function calculateClampedMenuPosition(
  x: number,
  y: number,
  bounds?: MenuBounds
): { position: { x: number; y: number }; edgeProximity: EdgeProximity } {
  const { width: areaWidth, height: areaHeight } = resolveBounds(bounds);

  // Calculate required margins
  const menuMargin = MENU_RADIUS + ITEM_SIZE / 2 + 10;
  const submenuExtraMargin = SUBMENU_RADIUS + ITEM_SIZE / 2;
  const totalMargin = menuMargin + submenuExtraMargin;

  // Detect edge proximity BEFORE clamping
  const edgeProximity: EdgeProximity = {
    left: x < totalMargin,
    right: x > areaWidth - totalMargin,
    top: y < totalMargin,
    bottom: y > areaHeight - totalMargin,
  };

  // Clamp position (centre l'axe si la zone est plus etroite que le menu)
  const clampedX = clampAxis(x, menuMargin, areaWidth);
  const clampedY = clampAxis(y, menuMargin, areaHeight);

  return {
    position: { x: clampedX, y: clampedY },
    edgeProximity,
  };
}
