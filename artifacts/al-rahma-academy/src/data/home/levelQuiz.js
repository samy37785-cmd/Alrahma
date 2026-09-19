// Home Content Foundation (2026-09-18): structural (language-agnostic) data
// for the Home page's LevelQuiz section, extracted from the inline `STEPS`/
// `RECOMMENDATIONS` consts that used to live in
// src/components/features/marketing/LevelQuiz.jsx. Only ids, icons, and
// routing paths live here -- all per-language text moved to
// src/i18n/home/levelQuiz.js, keyed by the same ids so the two stay linked.

export const LEVEL_QUIZ_STEPS = [
  { id: 'arabic', icon: '🌙', optionIds: ['none', 'basic', 'fluent'] },
  { id: 'goal', icon: '🎯', optionIds: ['read', 'memorize', 'ijazah', 'islamic'] },
  { id: 'who', icon: '👤', optionIds: ['child', 'teen', 'adult', 'family'] },
];

export const LEVEL_QUIZ_RECOMMENDATIONS = [
  { id: 'read', path: '/courses/quran' },
  { id: 'memorize', path: '/courses/quran' },
  { id: 'ijazah', path: '/courses/ijazah' },
  { id: 'islamic', path: '/courses' },
];
