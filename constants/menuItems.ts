// Menu radial 4 directions (reskin Direction B, maquette 7a) :
// participation (haut), bavardage (droite), sortie (bas), absence (gauche).
// La remarque est deplacee dans la toolbar de l'ecran de seance.
// `icon` = nom d'icone lucide, rendu par components/radial/RadialIcon.

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
    icon: 'hand',
    color: '#34D399',
  },
  {
    id: 'bavardage',
    label: 'Malus',
    icon: 'message-circle',
    color: '#FBBF24',
  },
  {
    id: 'sortie',
    label: 'Sortie',
    icon: 'log-out',
    color: '#A78BFA',
    subItems: [
      {
        id: 'infirmerie',
        label: 'Infirmerie',
        icon: 'cross',
        color: '#F472B6',
      },
      {
        id: 'toilettes',
        label: 'Toilettes',
        icon: 'door-open',
        color: '#22D3EE',
      },
      {
        id: 'convocation',
        label: 'Convocation',
        icon: 'clipboard-list',
        color: '#A8A29E',
      },
      {
        id: 'exclusion',
        label: 'Exclusion',
        icon: 'ban',
        color: '#F87171',
      },
    ],
  },
  {
    id: 'absence',
    label: 'Absence',
    icon: 'x-circle',
    color: '#FB7185',
  },
];

export const MENU_RADIUS = 120;
export const ITEM_SIZE = 70;
export const SUBMENU_RADIUS = 100;
export const SUBMENU_ITEM_SIZE = 58;
/** Rayon du disque central blanc (70px de diametre) : relacher dedans = annulation. */
export const CENTER_RADIUS = 35;
export const LONG_PRESS_DURATION = 400;
/** Mode expert : pause >= 250 ms => menu normal ; deplacement > seuil avant => flick. */
export const FLICK_PAUSE_DURATION = 250;
export const FLICK_DISTANCE_THRESHOLD = 30;
