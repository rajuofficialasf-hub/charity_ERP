// Shared ESLint flat configuration for the CSS ERP workspace.
// The root eslint.config.mjs composes these blocks; packages never keep their own rule sets.
import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import security from 'eslint-plugin-security';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Files and folders no rule ever looks at. */
export const ignores = {
  ignores: [
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/coverage/**',
    '**/playwright-report/**',
    '**/test-results/**',
    '**/src/generated/**',
    '**/public/sw.js',
    '**/next-env.d.ts',
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

/** React code in the PWA and the design system. */
export const react = {
  files: ['apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
  plugins: { 'react-hooks': reactHooks },
  languageOptions: { globals: { ...globals.browser } },
  rules: { ...reactHooks.configs.recommended.rules },
};

/** Next.js specific rules for apps/web. */
export const next = {
  files: ['apps/web/**/*.{ts,tsx}'],
  plugins: { '@next/next': nextPlugin },
  rules: {
    ...nextPlugin.configs.recommended.rules,
    ...nextPlugin.configs['core-web-vitals'].rules,
  },
  settings: { next: { rootDir: 'apps/web' } },
};

/**
 * packages/shared runs in the browser offline and on the server, so it must stay pure TypeScript
 * (ADR-001, SYSTEM_ARCHITECTURE section 3): no Node built-ins, Nest, Next or Prisma.
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
            group: ['@nestjs/*', 'next', 'next/*', '@prisma/*', 'prisma'],
            message: 'packages/shared must stay framework free (ADR-001).',
          },
          { group: ['react', 'react-dom', 'react/*'], message: 'UI code belongs in packages/ui.' },
        ],
        paths: ['fs', 'path', 'crypto', 'os', 'child_process', 'http', 'https'].map((name) => ({
          name,
          message: 'packages/shared must not use Node built-ins (ADR-001).',
        })),
      },
    ],
  },
};

/** Test files may use dev-only helpers and looser rules. */
export const tests = {
  files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}', '**/test/**/*.{ts,tsx}', '**/e2e/**/*.ts'],
  rules: {
    'security/detect-non-literal-fs-filename': 'off',
    'security/detect-object-injection': 'off',
    'security/detect-non-literal-regexp': 'off',
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

export default [ignores, ...base, node, react, next, sharedPurity, tests, scripts, prettier];
