const IS_DEV = process.env.APP_VARIANT === 'development';

export default {
  expo: {
    name: IS_DEV ? 'Gestion Classe (Dev)' : 'Gestion Classe',
    slug: 'gestion-classe',
    version: '1.1.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    scheme: IS_DEV ? 'gestion-classe-dev' : 'gestion-classe',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#FAFAFA',
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: IS_DEV ? 'com.gestionclasse.app.dev' : 'com.gestionclasse.app',
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#FAFAFA',
      },
      edgeToEdgeEnabled: true,
      package: IS_DEV ? 'com.gestionclasse.app.dev' : 'com.gestionclasse.app',
    },
    web: {
      favicon: './assets/favicon.png',
      bundler: 'metro',
      output: 'single',
    },
    plugins: ['expo-router', 'expo-sqlite', 'expo-secure-store', 'expo-font'],
    extra: {
      router: {},
      // Renseignés par EAS au moment de la construction ; affichés dans l'app pour savoir quel
      // APK est installé (plusieurs APK ont porté le même numéro de version).
      build: {
        commit: process.env.EAS_BUILD_GIT_COMMIT_HASH ? process.env.EAS_BUILD_GIT_COMMIT_HASH.slice(0, 7) : null,
        profile: process.env.EAS_BUILD_PROFILE || null,
      },
      eas: {
        projectId: '27ce328c-c662-4806-988a-d525279aaace',
      },
    },
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      url: 'https://u.expo.dev/27ce328c-c662-4806-988a-d525279aaace',
    },
  },
};
