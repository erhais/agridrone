module.exports = {
  preset: 'jest-expo',
  testMatch: ['**/__tests__/**/*.test.ts?(x)', '**/?(*.)+(spec|test).ts?(x)'],
  // Les worktrees Git dupliquent package.json/app.json → collision de modules Haste.
  modulePathIgnorePatterns: ['<rootDir>/.claude/worktrees/'],
  // Alias d'import identiques à ceux du bundler (voir tsconfig / babel).
  // `@/assets/*` doit précéder `@/*` pour ne pas être capturé par ce dernier.
  moduleNameMapper: {
    // Les feuilles CSS (NativeWind) ne sont pas parsables par Jest → stub vide.
    '\\.css$': '<rootDir>/test/styleMock.js',
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
};
