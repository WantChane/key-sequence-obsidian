import { defineConfig, globalIgnores } from 'eslint/config';
import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';

export default defineConfig([
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        activeDocument: 'readonly',
        activeWindow: 'readonly',
      },
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.mjs', 'manifest.json'],
        },
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.json'],
      },
    },
  },
  ...obsidianmd.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/array-type': 'error',
      '@typescript-eslint/consistent-type-assertions': 'error',
      '@typescript-eslint/consistent-type-definitions': 'error',
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true },
      ],
      '@typescript-eslint/explicit-member-accessibility': [
        'error',
        {
          accessibility: 'explicit',
          overrides: {
            accessors: 'explicit',
            constructors: 'off',
            parameterProperties: 'explicit',
          },
        },
      ],
      '@typescript-eslint/member-ordering': [
        'error',
        {
          default: [
            'public-static-field',
            'protected-static-field',
            'private-static-field',
            'public-static-method',
            'protected-static-method',
            'private-static-method',
            'public-instance-field',
            'protected-instance-field',
            'private-instance-field',
            'constructor',
            'public-instance-method',
            'protected-instance-method',
            'private-instance-method',
          ],
        },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'variable',
          format: ['camelCase', 'PascalCase', 'snake_case', 'UPPER_CASE'],
          leadingUnderscore: 'allow',
        },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: 'enumMember', format: ['PascalCase'] },
      ],
      '@typescript-eslint/no-extraneous-class': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-this-alias': ['error', { allowDestructuring: true }],
      '@typescript-eslint/prefer-function-type': 'error',
      '@typescript-eslint/prefer-readonly': 'error',

      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',

      curly: ['error', 'multi-line'],
      eqeqeq: 'error',
      'linebreak-style': ['error', 'unix'],
      'new-parens': 'error',
      'no-caller': 'error',
      'no-cond-assign': ['error', 'always'],
      'no-else-return': 'error',
      'no-invalid-this': 'error',
      'no-new-wrappers': 'error',
      'no-param-reassign': 'error',
      'no-restricted-globals': [
        'error',
        'length',
        'name',
        { name: 'isFinite', message: 'Use the more strict Number.isFinite.' },
        { name: 'isNaN', message: 'Use the more strict Number.isNaN.' },
        {
          name: 'app',
          message:
            'Avoid using the global app object. Instead use the reference provided by your plugin instance.',
        },
        {
          name: 'fetch',
          message:
            'Use the built-in `requestUrl` function instead of `fetch` for network requests in Obsidian.',
        },
        {
          name: 'localStorage',
          message:
            "Prefer `App#saveLocalStorage` / `App#loadLocalStorage` functions to write / read localStorage data that's unique to a vault.",
        },
      ],
      'no-restricted-properties': [
        'error',
        {
          property: 'bind',
          message: 'Native? Use an arrow function. jQuery? Use .on()',
        },
      ],
      'no-return-await': 'error',
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-template-curly-in-string': 'error',
      'no-throw-literal': 'error',
      'object-shorthand': 'error',
      'one-var': ['error', 'never'],
      'prefer-const': ['error', { destructuring: 'all' }],
      'prefer-object-spread': 'error',
      quotes: ['error', 'single', { avoidEscape: true }],
      radix: 'error',
      'spaced-comment': [
        'error',
        'always',
        {
          line: { markers: ['#region', '#endregion'] },
          block: { balanced: true },
        },
      ],

      'import/no-duplicates': 'error',
    },
  },
  globalIgnores([
    'node_modules',
    'dist',
    'esbuild.config.mjs',
    'eslint.config.mjs',
    'main.js',
  ]),
]);
