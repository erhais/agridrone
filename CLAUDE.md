@AGENTS.md

# AgriDrone — application mobile

Application mobile React Native / Expo pour l'épandage par drone (cartographie de parcelles, zonage de doses, calibration machine, génération de rapports/photos). Interface en français. App Store id iOS `6785961926`, bundle `fr.agridrone.app`.

## Stack

- **Expo SDK 54** avec **expo-router** (routing par fichiers, `typedRoutes` activé)
- **React 19.1** / **React Native 0.81**
- **TypeScript strict** (`tsconfig` étend `expo/tsconfig.base`, `strict: true`), alias d'import **`@/*` → `src/*`** et **`@/assets/*` → `assets/*`**
- **react-native-maps** (Google Maps) pour la cartographie
- **react-native-reanimated 4** + **react-native-gesture-handler** pour les animations/gestes
- **react-native-webview** (contenu embarqué), **react-native-view-shot** (capture des rapports), **expo-media-library** (enregistrement des photos)
- **expo-secure-store** pour le stockage des tokens
- Thème clair/sombre via `src/constants/theme.ts` + variables CSS dans `src/global.css`
- Build & distribution via **EAS** (`eas.json`)

> ⚠️ Voir `AGENTS.md` : Expo évolue vite. Avant d'écrire du code Expo, vérifier la doc versionnée correspondant au SDK réellement installé (voir `package.json`, actuellement `expo ~54`).

## Commandes

```bash
npm start          # démarre le serveur Expo (Metro)
npm run android    # lance sur Android (expo start --android)
npm run ios        # lance sur iOS
npm run web        # version web
npm run lint       # expo lint
npx tsc --noEmit   # vérification des types (à lancer avant de conclure une tâche)
```

Builds cloud : `eas build --profile <preview|preview-device|production> --platform <android|ios>`.

## Architecture (`src/`)

- **`app/`** — écrans expo-router (`_layout.tsx` racine, `index.tsx`, `explore.tsx`). Toute nouvelle route = un nouveau fichier ici.
- **`components/`** — composants réutilisables : formulaires métier (`Formulaire*.tsx` : semis blé/betterave, engrais, zones), modales (`*Modal.tsx`), composants thémés (`themed-text.tsx`, `themed-view.tsx`) et primitives d'UI (`components/ui/`).
- **`services/`** — couche d'accès aux données et logique métier. Un service par domaine (`agridroneService`, `authService`, `machineProfileService`). C'est ici que se font les appels réseau, jamais directement dans les composants.
- **`hooks/`** — hooks partagés (`useApi.ts`, `use-theme.ts`, `use-color-scheme.ts`).
- **`config/`** — `env.ts` centralise l'URL d'API et la config d'environnement.
- **`constants/`** — `theme.ts` : palette clair/sombre (`Colors.light` / `Colors.dark`) et polices. Ne pas coder de couleurs en dur ailleurs.
- **`utils/`** — helpers purs (`geoUtils.ts`, `calibrationUtils.ts`).

Le dossier `server/` ne contient que la page de politique de confidentialité et sa procédure de déploiement, pas le backend applicatif.

## Conventions

- **Langue** : UI, messages d'erreur et commentaires en **français**.
- **Réseau** : tous les appels HTTP passent par `services/api.ts` (`apiService.get/post/...`). Il gère les headers, le Bearer token, le refresh automatique et lève `ApiError(status, message)`. Ne pas appeler `fetch` directement dans un composant ou un écran — passer par un service qui utilise `api.ts`.
- **Auth** : tokens et identifiants stockés via `expo-secure-store` (voir `authService.ts`). Ne jamais logguer ni stocker un token en clair ailleurs.
- **Imports** : utiliser les alias `@/…` plutôt que des chemins relatifs profonds.
- **Couleurs / thème** : passer par `Colors` de `src/constants/theme.ts` et les hooks de thème (`use-theme`, `use-color-scheme`) ; gérer les deux modes clair et sombre.
- **Config** : lire l'environnement via `config` de `src/config/env.ts`, pas via `process.env` dispersé dans le code.
- **Types** : projet en strict TypeScript — pas de `any` implicite, typer les retours de service (interfaces façon `ParcelleProperties`, `HelloWorldResponse`).
- **Messages d'erreur** : orientés utilisateur, en français, actionnables.

## Points d'attention

- API backend : `https://api.agridrone.fr`.
- Ne pas modifier `app.json` (versions/build numbers), `eas.json` ni les configs natives sans raison explicite — ça touche aux builds de production et à la soumission App Store / Play Store.
- Les gros artefacts à la racine (`.png` de design, dossiers `build/`, `screenshot/`) ne font pas partie du code source ; ne pas les éditer.
- Avant de conclure une modification de code, lancer `npx tsc --noEmit` pour vérifier les types.
