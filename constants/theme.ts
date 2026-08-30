/**
 * Design tokens for Gestion Classe
 * Reskin "identite web" : neutres clairs, indigo primaire, serif Playfair (romain) + Inter,
 * aplats sans degrade, une seule ombre douce. Cf. design_handoff_mobile_reskin/README.md.
 *
 * NOTE : on conserve toutes les cles existantes (gradients, shadows.primary/success...) pour
 * ne casser aucun ecran ; leurs USAGES sont retires ecran par ecran lors du reskin (R2+).
 */

export const theme = {
  colors: {
    // Neutres - cible web (famille gris neutre, plus "slate")
    background: '#F4F5F8',
    surface: '#FFFFFF',
    surfaceHover: '#FAFBFC',
    surfaceSecondary: '#F3F4F7',
    surface3: '#F3F4F7', // inputs, segments, puits
    border: '#E5E7EB',
    borderLight: '#F1F5F9',
    borderStrong: '#D4D8E1',

    // Texte (encre)
    text: '#1F2433',
    textSecondary: '#6B7280',
    textTertiary: '#9CA3AF',
    textInverse: '#FFFFFF',

    // Primaire (indigo) = action / nav active
    primary: '#6366F1',
    primaryLight: '#818CF8',
    primaryDark: '#4F46E5',
    primaryStrong: '#4F46E5', // pressed
    primarySoft: '#EEF0FF',

    // Actions (menu radial / semantique)
    participation: '#10B981',
    participationLight: '#34D399',
    participationSoft: '#ECFDF5',
    bavardage: '#F59E0B',
    bavardageLight: '#FBBF24',
    bavardageSoft: '#FFFBEB',
    absence: '#EF4444',
    absenceLight: '#F87171',
    absenceSoft: '#FEF2F2',
    remarque: '#3B82F6',
    remarqueLight: '#60A5FA',
    remarqueSoft: '#EFF6FF',
    sortie: '#8B5CF6',
    sortieLight: '#A78BFA',
    sortieSoft: '#F5F3FF',

    // Sous-actions Sortie
    infirmerie: '#EC4899',
    toilettes: '#06B6D4',
    convocation: '#78716C',
    exclusion: '#DC2626',

    // Etats systeme
    success: '#10B981',
    successSoft: '#E4F6ED',
    error: '#EF4444',
    errorSoft: '#FDE8E8',
    danger: '#EF4444',
    dangerSoft: '#FDE8E8',
    warning: '#F59E0B',
    warningSoft: '#FEF1D8',
    offline: '#F59E0B',

    // Menu radial (re-style en R4)
    menuCenter: 'rgba(255,255,255,0.98)',
    menuPeriphery: 'rgba(255,255,255,0.85)',
    menuOverlay: 'rgba(15,23,42,0.4)',

    // Glassmorphism (deprecie - retire au reskin)
    glass: 'rgba(255,255,255,0.7)',
    glassBorder: 'rgba(255,255,255,0.5)',
  },

  // Polices (familles exactes chargees dans app/_layout.tsx)
  fonts: {
    display: 'PlayfairDisplay_500Medium',       // titres + grands chiffres (romain)
    displayRegular: 'PlayfairDisplay_400Regular',
    displaySemibold: 'PlayfairDisplay_600SemiBold', // ClassChip
    body: 'Inter_400Regular',
    bodyMedium: 'Inter_500Medium',
    bodySemibold: 'Inter_600SemiBold',
    bodyBold: 'Inter_700Bold',
  },

  // Degrades : DEPRECIES (aplats vises). Conserves le temps de retirer les usages (R2+).
  gradients: {
    primary: ['#6366F1', '#8B5CF6'],
    success: ['#10B981', '#34D399'],
    warm: ['#F59E0B', '#F97316'],
    cool: ['#3B82F6', '#6366F1'],
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
    sm: 8,
    md: 11,   // controle (bouton/input)
    lg: 16,   // carte
    xl: 16,   // aplati (etait 24)
    xxl: 16,  // aplati (etait 32)
    full: 9999,
  },

  typography: {
    // Titres - serif Playfair romain
    h1: { fontFamily: 'PlayfairDisplay_500Medium', fontSize: 28, fontWeight: '500' as const, lineHeight: 36, letterSpacing: -0.5 },
    h2: { fontFamily: 'PlayfairDisplay_500Medium', fontSize: 22, fontWeight: '500' as const, lineHeight: 30 },
    h3: { fontFamily: 'PlayfairDisplay_500Medium', fontSize: 18, fontWeight: '500' as const, lineHeight: 26 },

    // Corps - Inter
    body: { fontFamily: 'Inter_400Regular', fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
    bodyMedium: { fontFamily: 'Inter_500Medium', fontSize: 16, fontWeight: '500' as const, lineHeight: 24 },
    bodySmall: { fontFamily: 'Inter_400Regular', fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },

    // UI - Inter
    label: { fontFamily: 'Inter_600SemiBold', fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
    labelSmall: { fontFamily: 'Inter_600SemiBold', fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
    caption: { fontFamily: 'Inter_400Regular', fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },

    // Donnees - Inter / tabular
    counter: { fontFamily: 'Inter_700Bold', fontSize: 12, fontWeight: '700' as const, lineHeight: 16 },
    studentName: { fontFamily: 'Inter_600SemiBold', fontSize: 15, fontWeight: '600' as const, lineHeight: 20 },

    // Grand chiffre (KPI, note) - Playfair romain, tabular-nums (a appliquer au usage)
    bigNumber: { fontFamily: 'PlayfairDisplay_500Medium', fontSize: 40, fontWeight: '500' as const, lineHeight: 48 },
  },

  // Une seule ombre douce, neutre (pas d'empilement, pas d'ombres colorees).
  // Les cles sm/md/lg/xl + primary/success rendent toutes la meme ombre douce.
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
    // Ombres colorees DEPRECIEES -> rendues neutres (usages retires au reskin)
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
