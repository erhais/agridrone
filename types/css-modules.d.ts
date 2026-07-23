// Déclaration des CSS modules pour la vérification de types hors Expo
// (en CI, expo-env.d.ts — gitignoré — n'est pas généré ; voir animated-icon.web.tsx).
declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
