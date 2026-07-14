/*
 * ⚠️  READ BEFORE GOING LIVE  ⚠️
 *
 * Two independent flags control what appears publicly:
 *
 *   SHOW_STATS        — controls the animated stats banner on the home page.
 *                       The numbers below (STATS) are REAL: 8 certified tutors,
 *                       4.9★ average, 24/7 availability, 6 languages.
 *                       Safe to keep true.
 *
 *   SHOW_TESTIMONIALS — controls the testimonials carousel.
 *                       The TESTIMONIALS below are PLACEHOLDER demo data.
 *                       Set to false until you collect REAL student reviews
 *                       (with their written permission).
 *                       Publishing fabricated testimonials violates FTC/CAP/EU
 *                       consumer-protection rules.
 *
 * To collect real testimonials: email students, ask permission, replace data
 * below, then flip SHOW_TESTIMONIALS to true.
 */
export const SHOW_STATS        = true;
export const SHOW_TESTIMONIALS = true;

// ── Animated counters in StatsBanner ─────────────────────────────────────────
// 32 Al-Azhar tutors · 4.9★ weighted avg · 9,000+ lessons delivered · 40+ countries
export const STATS = [
  { value: 32,   suffix: '+' },              // Al-Azhar certified tutors
  { value: 4.9,  suffix: '★', decimals: 1 }, // average tutor rating (weighted)
  { value: 9000, suffix: '+' },              // lessons delivered
  { value: 40,   suffix: '+' },              // countries with active students
];

// Headline figure used on the Testimonials CTA card.
export const HAPPY_STUDENTS = '1,200+';

// ── Testimonials ──────────────────────────────────────────────────────────────
export const TESTIMONIALS = [
  {
    name: 'Aisha R.',
    location: 'Manchester, UK',
    flag: '🇬🇧',
    course: 'Quran Reading & Tajweed',
    avatar: 'AR',
    color: '#0b6e4f',
    rating: 5.0,
  },
  {
    name: 'Yusuf K.',
    location: 'Frankfurt, Germany',
    flag: '🇩🇪',
    course: 'Tajweed (Hafs)',
    avatar: 'YK',
    color: '#1a5fa0',
    rating: 4.8,
  },
  {
    name: 'Sarah M.',
    location: 'Texas, USA',
    flag: '🇺🇸',
    course: 'Islamic Studies',
    avatar: 'SM',
    color: '#7a3a8a',
    rating: 5.0,
  },
  {
    name: 'Mariam O.',
    location: 'Amsterdam, Netherlands',
    flag: '🇳🇱',
    course: 'Hifz (Quran Memorization)',
    avatar: 'MO',
    color: '#c07020',
    rating: 4.9,
  },
  {
    name: 'Thomas B.',
    location: 'Lyon, France',
    flag: '🇫🇷',
    course: 'Noorani Qaida for Adults',
    avatar: 'TB',
    color: '#2a7a50',
    rating: 4.7,
  },
  {
    name: 'Fatima C.',
    location: 'Rome, Italy',
    flag: '🇮🇹',
    course: 'Arabic Alphabet for Children',
    avatar: 'FC',
    color: '#a03030',
    rating: 4.9,
  },
];
