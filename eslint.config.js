import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import reactCompiler from 'eslint-plugin-react-compiler';
import eslintConfigPrettier from 'eslint-config-prettier';

const tsRecommendedRules = tsPlugin.configs?.recommended?.rules || {};
const reactHooksRecommendedRules = reactHooks.configs?.recommended?.rules || {};
const reactRefreshRecommendedRules = reactRefresh.configs?.recommended?.rules || {};
const prettierRules = eslintConfigPrettier?.rules || {};

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '*.config.js', 'coverage/**'],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
        project: './tsconfig.app.json',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'react-compiler': reactCompiler,
    },
    rules: {
      ...tsRecommendedRules,
      ...reactHooksRecommendedRules,
      ...reactRefreshRecommendedRules,
      ...prettierRules,
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'react-refresh/only-export-components': 'warn',
      'react-compiler/react-compiler': 'warn',
      'no-empty-pattern': 'off',
    },
  },
  {
    files: ['*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    rules: {
      ...prettierRules,
    },
  },
  {
    files: ['server/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      ...prettierRules,
      'no-empty-pattern': 'off',
    },
  },
];
