# Gestion Classe Mobile

Application mobile-first pour enseignants francais permettant d'enregistrer les actions eleves en < 2 secondes via un menu radial tactile.

## Stack Technique

- **Framework:** Expo SDK 54 + React Native
- **Navigation:** Expo Router (file-based routing)
- **State Management:** Zustand
- **Stockage Local:** Expo SQLite
- **Auth:** Expo SecureStore + Supabase Auth
- **Haptics:** Expo Haptics

## Structure du Projet

```
gestion-classe-mobile/
├── app/                    # Routes (Expo Router)
│   ├── _layout.tsx         # Layout racine
│   ├── index.tsx           # Redirect initial
│   ├── (auth)/             # Groupe auth
│   │   ├── _layout.tsx
│   │   └── login.tsx
│   └── (main)/             # Groupe principal
│       ├── _layout.tsx
│       └── index.tsx
├── components/             # Composants reutilisables
│   └── ui/                 # Composants UI de base
├── hooks/                  # Hooks personnalises
├── services/               # Logique metier
│   ├── database/           # SQLite local
│   └── supabase/           # API Supabase
├── stores/                 # Zustand stores
├── types/                  # Types TypeScript
├── utils/                  # Utilitaires
└── constants/              # Constantes et theme
```

## Commandes

```bash
# Installer les dependances
npm install

# Lancer en mode dev (Expo Go)
npx expo start

# Lancer sur Android
npx expo start --android

# Lancer sur iOS
npx expo start --ios

# Lancer sur web
npx expo start --web

# Build APK (via EAS)
eas build --platform android --profile preview
```

## Configuration

1. Copier `.env.example` vers `.env`
2. Remplir les variables Supabase

```bash
cp .env.example .env
```

## Conventions

- **Fichiers composants:** PascalCase (`RadialMenu.tsx`)
- **Fichiers utilitaires:** camelCase (`haptics.ts`)
- **Fonctions:** camelCase (`getStudentById()`)
- **Types/Interfaces:** PascalCase (`Student`, `ClassSession`)
- **Constantes:** SCREAMING_SNAKE (`MENU_RADIUS`)

## Documentation

- [PRD](../_bmad-output/planning-artifacts/prd.md)
- [Architecture](../_bmad-output/planning-artifacts/architecture.md)
- [UX Design](../_bmad-output/planning-artifacts/ux-design-specification.md)
