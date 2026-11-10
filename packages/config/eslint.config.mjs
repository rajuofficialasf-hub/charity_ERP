// Shared ESLint flat configuration for the CSS ERP workspace.
// The root eslint.config.mjs composes these blocks; packages never keep their own rule sets.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import noLiteralUiText from './eslint-rules/no-literal-ui-text.mjs';

/** Files and folders no rule ever looks at. */
export const ignores = {
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/coverage/**',
    '**/playwright-report/**',
    '**/test-results/**',
    '**/src/generated/**',
    'docs/**',
  ],
};

/** Base rules for every TypeScript file. */
export const base = [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  security.configs.recommended,
  {
    languageOptions: { globals: { ...globals.es2023 } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      eqeqeq: ['error', 'always'],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
];

/** Node processes (api, scripts, configuration files). */
export const node = {
  files: [
    'apps/api/**/*.ts',
    'scripts/**/*.mjs',
    'apps/web/scripts/**/*.mjs',
    '**/*.config.{js,mjs,ts}',
  ],
  languageOptions: { globals: { ...globals.node } },
};

/** React code in the PWA. */
export const react = {
  files: ['apps/web/**/*.{ts,tsx}'],
  plugins: { 'react-hooks': reactHooks },
  languageOptions: { globals: { ...globals.browser } },
  rules: { ...reactHooks.configs.recommended.rules },
};

/**
 * packages/shared runs in the browser offline and on the server, so it must stay pure TypeScript
 * (docs/architecture/SYSTEM_ARCHITECTURE.md, "Layering"): no Node built-ins, Express,
 * Prisma or the web app's framework.
 */
export const sharedPurity = {
  files: ['packages/shared/src/**/*.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          { group: ['node:*'], message: 'packages/shared must not use Node built-ins (ADR-001).' },
          {
            group: ['express', '@prisma/*', 'prisma', 'react-router', 'vite'],
            message: 'packages/shared must stay framework free (ADR-001).',
          },
          { group: ['react', 'react-dom', 'react/*'], message: 'UI code belongs in apps/web.' },
        ],
        paths: ['fs', 'path', 'crypto', 'os', 'child_process', 'http', 'https'].map((name) => ({
          name,
          message: 'packages/shared must not use Node built-ins (ADR-001).',
        })),
      },
    ],
  },
};

/**
 * Pages and components use the asf UI system only (@/ui): the libraries behind it live in its
 * template folder, apps/web/src/ui/templates/<name>/, so a template can be replaced without
 * touching a page (docs/architecture/ADR/ADR-016-asf-ui-system.md). The earlier set and its icons
 * have left the app.
 */
export const templateBoundary = {
  files: ['apps/web/**/*.{ts,tsx}'],
  ignores: ['apps/web/src/ui/templates/**'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['@mui/*', '@emotion/*'],
            message: 'Use the asf UI system (@/ui); MUI and Emotion belong in its template folder.',
          },
          {
            group: ['@css/ui', '@css/ui/*'],
            message: 'The earlier component set has left the app; use the asf UI system (@/ui).',
          },
          {
            group: ['lucide-react'],
            message:
              'Icons come from the asf set: <Icon name="..." /> from @/ui (src/ui/icon-map.md).',
          },
          {
            group: ['react-aria', 'react-aria-components', 'react-stately', '@internationalized/*'],
            message: 'React Aria is not part of the UI system; use @/ui.',
          },
        ],
      },
    ],
  },
};

/**
 * No hard-coded user-facing text in the PWA (docs/ui/I18N.md, "No hard-coded strings: rule and
 * enforcement").
 */
export const i18n = {
  files: ['apps/web/src/**/*.tsx'],
  plugins: { css: { rules: { 'no-literal-ui-text': noLiteralUiText } } },
  rules: { 'css/no-literal-ui-text': 'error' },
};

/** Test files may use dev-only helpers and looser rules. */
export const tests = {
  files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/test/**/*.{ts,tsx}', '**/e2e/**/*.ts'],
  rules: {
    'security/detect-non-literal-fs-filename': 'off',
    'security/detect-object-injection': 'off',
    'security/detect-non-literal-regexp': 'off',
    'css/no-literal-ui-text': 'off',
  },
};

/** Repository maintenance scripts and the dev/test seed only read fixed paths and fixed keys. */
export const scripts = {
  files: [
    'scripts/**/*.mjs',
    'apps/web/scripts/**/*.mjs',
    'apps/api/scripts/**/*.ts',
    'apps/api/seed/**/*.ts',
  ],
  rules: {
    'security/detect-non-literal-fs-filename': 'off',
    'security/detect-object-injection': 'off',
  },
};

export default [
  ignores,
  ...base,
  node,
  react,
  sharedPurity,
  templateBoundary,
  i18n,
  tests,
  scripts,
  prettier,
];
