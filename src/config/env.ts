const ENV = (process.env.EXPO_PUBLIC_ENV ?? 'dev') as 'dev' | 'prod';

const BASE_URLS: Record<'dev' | 'prod', string> = {
  dev:  'https://api.agridrone.fr',      // à remplacer par l'URL dev quand disponible
  prod: 'https://api.agridrone.fr',      // URL production (même serveur, profil différent)
};

export const config = {
  env: ENV,
  baseURL: BASE_URLS[ENV],
  timeout: 10000,
  isProd: ENV === 'prod',
} as const;
