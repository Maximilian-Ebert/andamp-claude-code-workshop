import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginAstro from 'eslint-plugin-astro';
import prettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.astro/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  {
    files: ['**/*.{js,mjs,ts}'],
    languageOptions: { globals: globals.node },
  },
  // eslint-plugin-astro only wires the TS frontmatter parser when it can
  // resolve @typescript-eslint/parser from process.cwd() at load time, which
  // fails under pnpm in editors/LSPs (the CLI gets it via a plugin-relative
  // require). Pin it explicitly so astro frontmatter is parsed as TS everywhere.
  {
    files: ['**/*.astro'],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  // Must stay last: disables rules that conflict with Prettier and surfaces
  // formatting differences as the `prettier/prettier` lint error.
  prettierRecommended,
  // prettier/prettier stays ON for `.astro` files: checking the whole file with
  // prettier-plugin-astro covers the markup, frontmatter, AND `<script>` bodies.
  // But eslint-plugin-astro ALSO exposes each `<script>` as an isolated virtual
  // unit, and eslint-plugin-prettier reformats that bare snippet as a non-module
  // — its `import` throws a phantom "Unexpected token". Disable the rule only for
  // those redundant virtual blocks; the parent .astro check already covers them.
  {
    files: ['**/*.astro/**'],
    rules: { 'prettier/prettier': 'off' },
  },
);
