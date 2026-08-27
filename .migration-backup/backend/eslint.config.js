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
      // Refactoring roadmap B5: env access goes through config/env.js so the
      // app's environment surface stays a single, complete, validated
      // inventory. Phase 2 migrated every direct reader; new ones are a
      // hard error.
      'no-restricted-properties': [
        'error',
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
