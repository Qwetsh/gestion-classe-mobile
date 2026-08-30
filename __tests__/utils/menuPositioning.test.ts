import { Dimensions } from 'react-native';
import {
  calculateClampedMenuPosition,
  calculateSubmenuPosition,
} from '../../utils/menuPositioning';
import { MENU_ITEMS, MENU_RADIUS, ITEM_SIZE, SUBMENU_RADIUS } from '../../constants/menuItems';

// Use realistic phone dimensions (Samsung S25: 1080x2340)
const SCREEN_W = 1080;
const SCREEN_H = 2340;

jest.mock('react-native', () => ({
  Dimensions: {
    get: jest.fn(() => ({ width: SCREEN_W, height: SCREEN_H })),
  },
}));

const mockDimensions = Dimensions.get as jest.Mock;

describe('calculateClampedMenuPosition', () => {
  beforeEach(() => {
    mockDimensions.mockReturnValue({ width: SCREEN_W, height: SCREEN_H });
  });

  const menuMargin = MENU_RADIUS + ITEM_SIZE / 2 + 10; // 165
  const submenuExtra = SUBMENU_RADIUS + ITEM_SIZE / 2;  // 135
  const totalMargin = menuMargin + submenuExtra;          // 300

  it('should not clamp position when center of screen', () => {
    const result = calculateClampedMenuPosition(540, 1170);

    expect(result.position.x).toBe(540);
    expect(result.position.y).toBe(1170);
    expect(result.edgeProximity).toEqual({
      left: false,
      right: false,
      top: false,
      bottom: false,
    });
  });

  it('should clamp X to left edge', () => {
    const result = calculateClampedMenuPosition(10, 1170);

    expect(result.position.x).toBe(menuMargin);
    expect(result.edgeProximity.left).toBe(true);
  });

  it('should clamp X to right edge', () => {
    const result = calculateClampedMenuPosition(SCREEN_W - 5, 1170);

    expect(result.position.x).toBe(SCREEN_W - menuMargin);
    expect(result.edgeProximity.right).toBe(true);
  });

  it('should clamp Y to top edge', () => {
    const result = calculateClampedMenuPosition(540, 5);

    expect(result.position.y).toBe(menuMargin);
    expect(result.edgeProximity.top).toBe(true);
  });

  it('should clamp Y to bottom edge', () => {
    const result = calculateClampedMenuPosition(540, SCREEN_H - 5);

    expect(result.position.y).toBe(SCREEN_H - menuMargin);
    expect(result.edgeProximity.bottom).toBe(true);
  });

  it('should detect corner proximity (top-left)', () => {
    const result = calculateClampedMenuPosition(5, 5);

    expect(result.edgeProximity.left).toBe(true);
    expect(result.edgeProximity.top).toBe(true);
    expect(result.edgeProximity.right).toBe(false);
    expect(result.edgeProximity.bottom).toBe(false);
  });

  it('should detect corner proximity (bottom-right)', () => {
    const result = calculateClampedMenuPosition(SCREEN_W - 5, SCREEN_H - 5);

    expect(result.edgeProximity.right).toBe(true);
    expect(result.edgeProximity.bottom).toBe(true);
    expect(result.edgeProximity.left).toBe(false);
    expect(result.edgeProximity.top).toBe(false);
  });

  it('should detect edge proximity BEFORE clamping (within totalMargin but outside menuMargin)', () => {
    // totalMargin=300, menuMargin=165. Position at 200 is between the two.
    const result = calculateClampedMenuPosition(200, 1170);

    // 200 < totalMargin → left proximity detected
    expect(result.edgeProximity.left).toBe(true);
    // 200 > menuMargin → position is NOT clamped
    expect(result.position.x).toBe(200);
  });

  it('should clamp correctly on very small screen', () => {
    mockDimensions.mockReturnValue({ width: 300, height: 500 });

    const result = calculateClampedMenuPosition(10, 10);

    // On a small screen, menuMargin (165) > position → gets clamped
    expect(result.position.x).toBe(menuMargin);
    expect(result.position.y).toBe(menuMargin);
    expect(result.edgeProximity.left).toBe(true);
    expect(result.edgeProximity.top).toBe(true);
  });
});

describe('calculateSubmenuPosition', () => {
  beforeEach(() => {
    mockDimensions.mockReturnValue({ width: SCREEN_W, height: SCREEN_H });
  });

  const sortieItem = MENU_ITEMS.find(item => item.id === 'sortie')!;

  it('should return a position offset from menu center', () => {
    const result = calculateSubmenuPosition(sortieItem, { x: 540, y: 1170 });

    // Submenu should be offset by approximately MENU_RADIUS in the direction of the parent
    const distance = Math.sqrt(result.x * result.x + result.y * result.y);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThanOrEqual(MENU_RADIUS * 2);
  });

  it('should flip submenu when it would go off left edge', () => {
    // Menu near left edge
    const resultNearEdge = calculateSubmenuPosition(sortieItem, { x: 30, y: 400 });
    const resultCenter = calculateSubmenuPosition(sortieItem, { x: 200, y: 400 });

    // Near edge, the submenu should be pushed/flipped to stay on screen
    const absoluteXNearEdge = 30 + resultNearEdge.x;
    const submenuSpace = SUBMENU_RADIUS + ITEM_SIZE / 2 + 20;
    expect(absoluteXNearEdge).toBeGreaterThanOrEqual(submenuSpace - 1);
  });

  it('should flip submenu when it would go off right edge', () => {
    const result = calculateSubmenuPosition(sortieItem, { x: SCREEN_W - 20, y: 1170 });
    const absoluteX = (SCREEN_W - 20) + result.x;
    const submenuSpace = SUBMENU_RADIUS + ITEM_SIZE / 2 + 20;
    expect(absoluteX).toBeLessThanOrEqual(SCREEN_W - submenuSpace + 1);
  });

  it('should flip submenu when it would go off top edge', () => {
    const result = calculateSubmenuPosition(sortieItem, { x: 540, y: 30 });
    const absoluteY = 30 + result.y;
    const submenuSpace = SUBMENU_RADIUS + ITEM_SIZE / 2 + 20;
    expect(absoluteY).toBeGreaterThanOrEqual(submenuSpace - 1);
  });

  it('should flip submenu when it would go off bottom edge', () => {
    const result = calculateSubmenuPosition(sortieItem, { x: 540, y: SCREEN_H - 20 });
    const absoluteY = (SCREEN_H - 20) + result.y;
    const submenuSpace = SUBMENU_RADIUS + ITEM_SIZE / 2 + 20;
    expect(absoluteY).toBeLessThanOrEqual(SCREEN_H - submenuSpace + 1);
  });

  it('should handle all menu items', () => {
    for (const item of MENU_ITEMS) {
      const result = calculateSubmenuPosition(item, { x: 540, y: 1170 });
      expect(typeof result.x).toBe('number');
      expect(typeof result.y).toBe('number');
      expect(isNaN(result.x)).toBe(false);
      expect(isNaN(result.y)).toBe(false);
    }
  });
});
