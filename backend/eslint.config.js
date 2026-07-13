import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['node_modules', 'logs'] },

  {
    files: ['**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      // Phase 0 guardrail (refactoring roadmap B5): env access belongs in
      // config/ modules so validateEnv.js can stay provably complete. Kept
      // at "warn" until Phase 2 centralizes the remaining direct readers,
      // then flipped to "error".
      'no-restricted-properties': [
        'warn',
        {
          object: 'process',
          property: 'env',
          message:
            'Read environment variables through a config/ module (see config/validateEnv.js) instead of process.env directly.',
        },
      ],
    },
  },

  {
    // Legitimate direct env access: the config layer itself, the process
    // entrypoint, one-off CLI scripts, and tests (which set env vars).
    files: ['config/**', 'scripts/**', 'tests/**', 'server.js', 'seed.js',
      'importCourses.js', 'updateResources.js', 'backfillReferralCodes.js'],
    rules: {
      'no-restricted-properties': 'off',
    },
  },
];
