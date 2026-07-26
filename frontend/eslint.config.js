import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['dist/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // Service workers run in their own global scope (self, caches, clients), not the window/DOM
    // globals used by the rest of the frontend.
    files: ['static/**/*.js'],
    languageOptions: {
      globals: globals.serviceworker,
    },
  },
  {
    // Loaded via importScripts(".../firebase-app-compat.js", ".../firebase-messaging-compat.js"),
    // which injects the `firebase` global at runtime - not a real undeclared-variable bug.
    files: ['static/public/firebase-messaging-sw.js'],
    languageOptions: {
      globals: { firebase: 'readonly' },
    },
  },
  {
    files: ['vite.config.js'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Pragmatic typing (see tsconfig.json): DOM-heavy code intentionally uses `any` in several
    // places instead of narrowing every event target/element type.
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
);
