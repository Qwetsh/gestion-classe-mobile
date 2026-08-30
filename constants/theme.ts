/**
 * Design tokens for Gestion Classe
 * Reskin "Direction B" : neutres clairs, indigo primaire #4F46E5, action verte #059669,
 * IBM Plex Sans partout, aplats sans degrade, une seule ombre douce ou bordure 1px.
 * Cf. design_handoff_reskin_direction_b/README.md.
 */

export const theme = {
  colors: {
    // Neutres
    background: '#F7F7F9',
    surface: '#FFFFFF',
    surfaceHover: '#FAFBFC',
    surfaceSecondary: '#F3F4F7',
    surface3: '#F3F4F7', // inputs, puits
    surfaceDisabled: '#F1F2F5', // cellules desactivees / allees
    segmentTrack: '#EDEEF2', // track des toggles segmentes
    border: '#E5E7EB',
    borderLight: '#F1F5F9',
    borderStrong: '#D4D8E1',

    // Texte (encre)
    text: '#1F2433',
    textSecondary: '#6B7280',
    textTertiary: '#9CA3AF',
    textInverse: '#FFFFFF',

    // Primaire (indigo) = nav / selection
    primary: '#4F46E5',
    primaryLight: '#818CF8',
    primaryDark: '#4338CA',
    primaryStrong: '#4338CA', // pressed
    primarySoft: '#EEF0FF',

    // Action verte (demarrer / terminer / valider)
    action: '#059669',
    actionSoft: '#ECFDF5',

    // Actions (menu radial / semantique)
    participation: '#10B981',
    participationLight: '#34D399',
    participationSoft: '#ECFDF5',
    bavardage: '#F59E0B',
    bavardageLight: '#FBBF24',
    bavardageSoft: '#FFFBEB',
    bavardageText: '#B45309',
    absence: '#EF4444',
    absenceLight: '#FB7185',
    absenceSoft: '#FEF2F2',
    remarque: '#3B82F6',
    remarqueLight: '#60A5FA',
    remarqueSoft: '#EFF6FF',
    sortie: '#8B5CF6',
    sortieLight: '#A78BFA',
    sortieSoft: '#F5F3FF',

    // Etats cellules du plan
    absentBg: '#FEF2F2',
    absentBorder: '#FECACA',
    absentText: '#B91C1C',
    absentBadge: '#EF4444',
    sortieBg: '#F5F3FF',
    sortieBorder: '#DDD6FE',
    sortieText: '#6D28D9',

    // Sous-actions Sortie
    infirmerie: '#F472B6',
    toilettes: '#22D3EE',
    convocation: '#A8A29E',
    exclusion: '#F87171',

    // Etats systeme
    success: '#059669',
    successSoft: '#ECFDF5',
    error: '#EF4444',
    errorSoft: '#FDE8E8',
    danger: '#EF4444',
    dangerSoft: '#FDE8E8',
    warning: '#F59E0B',
    warningSoft: '#FEF1D8',
    offline: '#F59E0B',

    // Menu radial
    menuCenter: 'rgba(255,255,255,0.98)',
    menuPeriphery: 'rgba(15,23,42,0.78)',
    menuOverlay: 'rgba(15,23,42,0.4)',
    sheetBackdrop: 'rgba(15,23,42,0.35)',
  },

  // Polices (familles exactes chargees dans app/_layout.tsx) — IBM Plex Sans partout
  fonts: {
    display: 'IBMPlexSans_700Bold', // titres + grands chiffres
    displayRegular: 'IBMPlexSans_400Regular',
    displaySemibold: 'IBMPlexSans_600SemiBold',
    body: 'IBMPlexSans_400Regular',
    bodyMedium: 'IBMPlexSans_500Medium',
    bodySemibold: 'IBMPlexSans_600SemiBold',
    bodyBold: 'IBMPlexSans_700Bold',
  },

  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
  },

  radius: {
    sm: 8,    // cellules du plan (8-9)
    md: 12,   // controle (bouton/input)
    lg: 16,   // carte
    xl: 16,
    xxl: 20,  // bottom sheets (haut)
    full: 999,
  },

  typography: {
    // Titres — IBM Plex Sans Bold
    h1: { fontFamily: 'IBMPlexSans_700Bold', fontSize: 26, fontWeight: '700' as const, lineHeight: 34, letterSpacing: -0.3 },
    h2: { fontFamily: 'IBMPlexSans_700Bold', fontSize: 22, fontWeight: '700' as const, lineHeight: 30 },
    h3: { fontFamily: 'IBMPlexSans_600SemiBold', fontSize: 18, fontWeight: '600' as const, lineHeight: 26 },

    // Corps
    body: { fontFamily: 'IBMPlexSans_400Regular', fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
    bodyMedium: { fontFamily: 'IBMPlexSans_500Medium', fontSize: 16, fontWeight: '500' as const, lineHeight: 24 },
    bodySmall: { fontFamily: 'IBMPlexSans_400Regular', fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },

    // UI
    label: { fontFamily: 'IBMPlexSans_600SemiBold', fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
    labelSmall: { fontFamily: 'IBMPlexSans_600SemiBold', fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
    caption: { fontFamily: 'IBMPlexSans_400Regular', fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },

    // Donnees
    counter: { fontFamily: 'IBMPlexSans_700Bold', fontSize: 12, fontWeight: '700' as const, lineHeight: 16 },
    studentName: { fontFamily: 'IBMPlexSans_600SemiBold', fontSize: 15, fontWeight: '600' as const, lineHeight: 20 },
    bigNumber: { fontFamily: 'IBMPlexSans_700Bold', fontSize: 40, fontWeight: '700' as const, lineHeight: 48 },
  },

  // Une seule ombre douce, neutre (sinon bordure 1px #E5E7EB).
  shadows: {
    none: {
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    xs: {
      shadowColor: '#141928',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
    },
    sm: {
      shadowColor: '#141928',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 2,
    },
    md: {
      shadowColor: '#141928',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 2,
    },
    lg: {
      shadowColor: '#141928',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 2,
    },
    xl: {
      shadowColor: '#141928',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 2,
    },
    primary: {
      shadowColor: '#141928',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 2,
    },
    success: {
      shadowColor: '#141928',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
      elevation: 2,
    },
  },

  animation: {
    instant: 100,
    fast: 150,
    normal: 250,
    slow: 350,
  },
} as const;

export type Theme = typeof theme;
