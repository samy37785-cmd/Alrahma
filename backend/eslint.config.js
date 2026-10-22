import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules', 'logs'] },

  {
    // .mjs too: the test runners and the migration tooling are .mjs, and a
    // file no config object matches is only parsed, never checked by a rule.
    files: ['**/*.js', '**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    },
  },
];
