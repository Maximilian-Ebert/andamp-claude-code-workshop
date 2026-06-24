import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default tseslint.config(
  // `tsc` emits compiled .js/.d.ts next to the .ts sources; never lint those.
  {
    ignores: [
      'cdk.out/**',
      '**/*.d.ts',
      'bin/**/*.js',
      'stack/**/*.js',
      'component/**/*.js',
      'test/**/*.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
  {
    files: ['test/**/*.ts'],
    languageOptions: { globals: globals.jest },
  },
  // Must stay last: disables rules that conflict with Prettier and surfaces
  // formatting differences as the `prettier/prettier` lint error.
  prettierRecommended,
);
