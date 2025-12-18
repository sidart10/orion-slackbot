import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import filenames from 'eslint-plugin-filenames';

export default [
  eslint.configs.recommended,
  {
    ignores: ['dist/**', 'node_modules/**', '**/*.js', '!eslint.config.js'],
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsparser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      filenames,
    },
    rules: {
      // Enforce kebab-case filenames in src/ (allow *.test.ts suffix)
      'filenames/match-regex': ['error', '^[a-z0-9]+(?:-[a-z0-9]+)*(?:\\.test)?$', true],

      // TypeScript-specific rules
      '@typescript-eslint/explicit-function-return-type': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',

      // General rules
      // TS already checks undefined names; node globals like `process` will otherwise trip ESLint
      'no-undef': 'off',
      // Use TypeScript's no-unused-vars instead of ESLint's
      'no-unused-vars': 'off',
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
];

