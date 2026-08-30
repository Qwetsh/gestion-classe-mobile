import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import * as NavigationBar from 'expo-navigation-bar';

// Delai avant de re-masquer la barre apres un swipe de l'utilisateur
const REHIDE_DELAY = 2500;

/**
 * Mode immersif Android : masque la barre de navigation systeme (boutons/geste)
 * pour que l'app occupe tout l'ecran. Un swipe depuis le bord la fait
 * reapparaitre temporairement, puis elle se remasque automatiquement.
 */
export function useImmersiveMode() {
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    let rehideTimer: ReturnType<typeof setTimeout> | null = null;

    const hide = () => {
      NavigationBar.setVisibilityAsync('hidden').catch(() => {});
    };

    hide();

    // Swipe utilisateur => la barre reapparait ; on la remasque apres un court delai
    const visibilitySub = NavigationBar.addVisibilityListener(({ visibility }) => {
      if (visibility === 'visible') {
        if (rehideTimer) clearTimeout(rehideTimer);
        rehideTimer = setTimeout(hide, REHIDE_DELAY);
      }
    });

    // Retour au premier plan => on remasque
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') hide();
    });

    return () => {
      if (rehideTimer) clearTimeout(rehideTimer);
      visibilitySub.remove();
      appStateSub.remove();
    };
  }, []);
}
