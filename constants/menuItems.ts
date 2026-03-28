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
    color: '#34D399',
  },
  {
    id: 'bavardage',
    label: 'Bavardage',
    icon: '💬',
    color: '#FBBF24',
  },
  {
    id: 'sortie',
    label: 'Sortie',
    icon: '🚪',
    color: '#A78BFA',
    subItems: [
      {
        id: 'infirmerie',
        label: 'Infirmerie',
        icon: '🏥',
        color: '#F472B6',
      },
      {
        id: 'toilettes',
        label: 'Toilettes',
        icon: '🚻',
        color: '#22D3EE',
      },
      {
        id: 'convocation',
        label: 'Convocation',
        icon: '📋',
        color: '#A8A29E',
      },
      {
        id: 'exclusion',
        label: 'Exclusion',
        icon: '⛔',
        color: '#F87171',
      },
    ],
  },
  {
    id: 'remarque',
    label: 'Remarque',
    icon: '📝',
    color: '#60A5FA',
  },
  {
    id: 'absence',
    label: 'Absence',
    icon: '❌',
    color: '#FB7185',
  },
];

export const MENU_RADIUS = 120;
export const ITEM_SIZE = 70;
export const SUBMENU_RADIUS = 100;
export const LONG_PRESS_DURATION = 250;
