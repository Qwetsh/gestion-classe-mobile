export type MenuItemType = {
  id: string;
  label: string;
  icon: string;
  color: string;
  subItems?: MenuItemType[];
};

export const MENU_ITEMS: MenuItemType[] = [
  {
    id: 'participation',
    label: 'Implication',
    icon: '✋',
    color: '#4CAF50',
  },
  {
    id: 'bavardage',
    label: 'Bavardage',
    icon: '💬',
    color: '#FF9800',
  },
  {
    id: 'sortie',
    label: 'Sortie',
    icon: '🚪',
    color: '#9C27B0',
    subItems: [
      {
        id: 'infirmerie',
        label: 'Infirmerie',
        icon: '🏥',
        color: '#E91E63',
      },
      {
        id: 'toilettes',
        label: 'Toilettes',
        icon: '🚻',
        color: '#00BCD4',
      },
      {
        id: 'convocation',
        label: 'Convocation',
        icon: '📋',
        color: '#795548',
      },
      {
        id: 'exclusion',
        label: 'Exclusion',
        icon: '⛔',
        color: '#B71C1C',
      },
    ],
  },
  {
    id: 'remarque',
    label: 'Remarque',
    icon: '📝',
    color: '#2196F3',
  },
  {
    id: 'absence',
    label: 'Absence',
    icon: '❌',
    color: '#F44336',
  },
];

export const MENU_RADIUS = 120;
export const ITEM_SIZE = 70;
export const SUBMENU_RADIUS = 100;
export const LONG_PRESS_DURATION = 250;
