// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    // dist/* (build), et .claude/worktrees (copies de travail qui dupliquent
    // les modules → faux positifs et collisions).
    ignores: ["dist/*", ".claude/**"],
  },
  {
    // Fichiers de test : les mocks inline (Picker, DateTimePicker…) sont des
    // composants anonymes et les factories jest.mock utilisent require().
    files: ["**/__tests__/**/*", "**/*.test.{ts,tsx}"],
    rules: {
      "react/display-name": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  }
]);
