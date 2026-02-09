/**
 * Design tokens for Gestion Classe
 * Modern UI with soft shadows, gradients, and clean aesthetics
 */

export const theme = {
  colors: {
    // Neutres - Plus doux et modernes
    background: '#F8FAFC',
    surface: '#FFFFFF',
    surfaceHover: '#F1F5F9',
    surfaceSecondary: '#F8FAFC',
    border: '#E2E8F0',
    borderLight: '#F1F5F9',

    // Texte
    text: '#0F172A',
    textSecondary: '#64748B',
    textTertiary: '#94A3B8',
    textInverse: '#FFFFFF',

    // Couleur primaire moderne (bleu-violet)
    primary: '#6366F1',
    primaryLight: '#818CF8',
    primaryDark: '#4F46E5',
    primarySoft: '#EEF2FF',

    // Actions (menu radial) - Couleurs plus douces
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
    successSoft: '#ECFDF5',
    error: '#EF4444',
    errorSoft: '#FEF2F2',
    warning: '#F59E0B',
    warningSoft: '#FFFBEB',
    offline: '#F59E0B',

    // Menu radial
    menuCenter: 'rgba(255,255,255,0.98)',
    menuPeriphery: 'rgba(255,255,255,0.85)',
    menuOverlay: 'rgba(15,23,42,0.4)',

    // Glassmorphism
    glass: 'rgba(255,255,255,0.7)',
    glassBorder: 'rgba(255,255,255,0.5)',
  },

  // Gradients pour boutons et accents
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
    md: 12,
    lg: 16,
    xl: 24,
    xxl: 32,
    full: 9999,
  },

  typography: {
    // Titres - Plus bold et modernes
    h1: { fontSize: 28, fontWeight: '700' as const, lineHeight: 36 },
    h2: { fontSize: 22, fontWeight: '700' as const, lineHeight: 30 },
    h3: { fontSize: 18, fontWeight: '600' as const, lineHeight: 26 },

    // Corps
    body: { fontSize: 16, fontWeight: '400' as const, lineHeight: 24 },
    bodyMedium: { fontSize: 16, fontWeight: '500' as const, lineHeight: 24 },
    bodySmall: { fontSize: 14, fontWeight: '400' as const, lineHeight: 20 },

    // UI
    label: { fontSize: 14, fontWeight: '600' as const, lineHeight: 20 },
    labelSmall: { fontSize: 12, fontWeight: '600' as const, lineHeight: 16 },
    caption: { fontSize: 12, fontWeight: '400' as const, lineHeight: 16 },

    // Donnees
    counter: { fontSize: 12, fontWeight: '700' as const, lineHeight: 16 },
    studentName: { fontSize: 15, fontWeight: '600' as const, lineHeight: 20 },

    // Large numbers
    bigNumber: { fontSize: 32, fontWeight: '700' as const, lineHeight: 40 },
  },

  shadows: {
    none: {
      shadowColor: 'transparent',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0,
      shadowRadius: 0,
      elevation: 0,
    },
    xs: {
      shadowColor: '#64748B',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04,
      shadowRadius: 2,
      elevation: 1,
    },
    sm: {
      shadowColor: '#64748B',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
      elevation: 2,
    },
    md: {
      shadowColor: '#64748B',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
    lg: {
      shadowColor: '#64748B',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.12,
      shadowRadius: 16,
      elevation: 8,
    },
    xl: {
      shadowColor: '#64748B',
      shadowOffset: { width: 0, height: 12 },
      shadowOpacity: 0.16,
      shadowRadius: 24,
      elevation: 12,
    },
    // Ombres colorées pour les boutons
    primary: {
      shadowColor: '#6366F1',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 8,
    },
    success: {
      shadowColor: '#10B981',
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.3,
      shadowRadius: 16,
      elevation: 8,
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
