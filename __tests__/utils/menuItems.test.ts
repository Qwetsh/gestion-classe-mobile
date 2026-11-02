import {
  MENU_ITEMS,
  MENU_RADIUS,
  SUBMENU_RADIUS,
  ITEM_SIZE,
  LONG_PRESS_DURATION,
  COPY_MENU_ITEM,
  buildMenuItems,
} from '../../constants/menuItems';

describe('buildMenuItems (raccourci « Copie »)', () => {
  it('returns the regular menu when no assessment is being scanned', () => {
    expect(buildMenuItems(false)).toBe(MENU_ITEMS);
  });

  it('adds « Copie » to the Sortie submenu only, keeping the 4 directions in order', () => {
    const items = buildMenuItems(true);
    expect(items.map(i => i.id)).toEqual(MENU_ITEMS.map(i => i.id));
    const sortie = items.find(i => i.id === 'sortie')!;
    const original = MENU_ITEMS.find(i => i.id === 'sortie')!;
    expect(sortie.subItems!.map(i => i.id)).toEqual([...original.subItems!.map(i => i.id), COPY_MENU_ITEM.id]);
  });

  it('never mutates the shared MENU_ITEMS', () => {
    buildMenuItems(true);
    expect(MENU_ITEMS.find(i => i.id === 'sortie')!.subItems!.some(i => i.id === 'copie')).toBe(false);
  });
});

describe('Menu Items Configuration', () => {
  it('should have exactly 4 primary items (remarque moved to toolbar)', () => {
    expect(MENU_ITEMS).toHaveLength(4);
  });

  it('should contain all required action types', () => {
    const ids = MENU_ITEMS.map(item => item.id);
    expect(ids).toContain('participation');
    expect(ids).toContain('bavardage');
    expect(ids).toContain('sortie');
    expect(ids).toContain('absence');
    expect(ids).not.toContain('remarque');
  });

  it('should be ordered participation/bavardage/sortie/absence (haut/droite/bas/gauche)', () => {
    expect(MENU_ITEMS.map(item => item.id)).toEqual([
      'participation',
      'bavardage',
      'sortie',
      'absence',
    ]);
  });

  it('should have unique IDs', () => {
    const ids = MENU_ITEMS.map(item => item.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have labels and colors for all items', () => {
    for (const item of MENU_ITEMS) {
      expect(item.label).toBeTruthy();
      expect(item.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(item.icon).toBeTruthy();
    }
  });

  describe('Sortie submenu', () => {
    const sortieItem = MENU_ITEMS.find(item => item.id === 'sortie')!;

    it('should exist', () => {
      expect(sortieItem).toBeDefined();
    });

    it('should have exactly 4 sub-items', () => {
      expect(sortieItem.subItems).toHaveLength(4);
    });

    it('should contain all sortie subtypes', () => {
      const subIds = sortieItem.subItems!.map(item => item.id);
      expect(subIds).toContain('infirmerie');
      expect(subIds).toContain('toilettes');
      expect(subIds).toContain('convocation');
      expect(subIds).toContain('exclusion');
    });

    it('should have unique sub-item IDs', () => {
      const subIds = sortieItem.subItems!.map(item => item.id);
      expect(new Set(subIds).size).toBe(subIds.length);
    });

    it('should have labels and colors for all sub-items', () => {
      for (const subItem of sortieItem.subItems!) {
        expect(subItem.label).toBeTruthy();
        expect(subItem.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
        expect(subItem.icon).toBeTruthy();
      }
    });
  });

  it('only sortie should have sub-items', () => {
    for (const item of MENU_ITEMS) {
      if (item.id === 'sortie') {
        expect(item.subItems).toBeDefined();
        expect(item.subItems!.length).toBeGreaterThan(0);
      } else {
        expect(item.subItems).toBeUndefined();
      }
    }
  });
});

describe('Menu Constants', () => {
  it('should have valid radii', () => {
    expect(MENU_RADIUS).toBeGreaterThan(0);
    expect(SUBMENU_RADIUS).toBeGreaterThan(0);
    expect(MENU_RADIUS).toBeGreaterThan(SUBMENU_RADIUS);
  });

  it('should have valid item size', () => {
    expect(ITEM_SIZE).toBeGreaterThan(0);
    expect(ITEM_SIZE).toBeLessThan(MENU_RADIUS);
  });

  it('should have reasonable long press duration', () => {
    expect(LONG_PRESS_DURATION).toBeGreaterThanOrEqual(150);
    expect(LONG_PRESS_DURATION).toBeLessThanOrEqual(500);
  });
});
