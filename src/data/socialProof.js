/*
 * ⚠️  PLACEHOLDER MARKETING CONTENT — READ BEFORE GOING LIVE  ⚠️
 *
 * The reviews, the "1,200+ students" figure and the other counters below are
 * DEMO DATA, not real. Publishing fabricated testimonials / statistics is both
 * an ethical and a credibility (and potentially legal) risk.
 *
 * Before launch you have two options:
 *   1. Replace TESTIMONIALS / STATS / HAPPY_STUDENTS with REAL numbers and
 *      real student feedback (with their permission), then leave the flag on.
 *   2. If you don't have real data yet, set SHOW_PLACEHOLDER_CONTENT = false.
 *      The Testimonials and Stats sections will then hide themselves instead of
 *      showing invented claims.
 *
 * This single switch is the safety net: it is the only place these claims live.
 */
export const SHOW_PLACEHOLDER_CONTENT = true;

// Animated counters in the StatsBanner. value + suffix; labels come from i18n.
export const STATS = [
  { value: 1200, suffix: '+' },
  { value: 15,   suffix: '+' },
  { value: 5,    suffix: '★' },
  { value: 24,   suffix: '/7' },
];

// Headline figure used on the Testimonials CTA card.
export const HAPPY_STUDENTS = '1,200+';

// Static testimonial data (the quote text itself is translated in
// i18n/content.js → TESTIMONIAL_TEXT, keyed by index).
export const TESTIMONIALS = [
  {
    quote: "My children love their lessons. The tutors are patient, kind and truly knowledgeable. We've seen amazing progress in just a few months.",
    name: 'Aisha R.',
    location: 'Manchester, UK',
    flag: '🇬🇧',
    course: 'Quran Reading & Tajweed',
    avatar: 'AR',
    color: '#0b6e4f',
  },
  {
    quote: 'Flexible timing made it possible for me to study around work. My Tajweed has improved more than I imagined. Highly recommended.',
    name: 'Yusuf K.',
    location: 'Frankfurt, Germany',
    flag: '🇩🇪',
    course: 'Tajweed (Hafs)',
    avatar: 'YK',
    color: '#1a5fa0',
  },
  {
    quote: 'Professional, organized and very welcoming. The free trial convinced our whole family to join. May Allah reward the teachers.',
    name: 'Sarah M.',
    location: 'Texas, USA',
    flag: '🇺🇸',
    course: 'Islamic Studies',
    avatar: 'SM',
    color: '#7a3a8a',
  },
  {
    quote: "Our daughter memorised her first Juz in 3 months. The tutor's patience is incredible — she never gets frustrated and always finds a new way to explain.",
    name: 'Mariam O.',
    location: 'Amsterdam, Netherlands',
    flag: '🇳🇱',
    course: 'Hifz (Quran Memorization)',
    avatar: 'MO',
    color: '#c07020',
  },
  {
    quote: 'I converted 2 years ago and wanted to learn how to read the Quran properly. Starting from zero, I can now read independently. Alhamdulillah.',
    name: 'Thomas B.',
    location: 'Lyon, France',
    flag: '🇫🇷',
    course: 'Noorani Qaida for Adults',
    avatar: 'TB',
    color: '#2a7a50',
  },
  {
    quote: 'La professoressa è pazientissima e molto brava. Mio figlio ha imparato le lettere arabe in poche settimane. Consiglio vivamente!',
    name: 'Fatima C.',
    location: 'Rome, Italy',
    flag: '🇮🇹',
    course: 'Arabic Alphabet for Children',
    avatar: 'FC',
    color: '#a03030',
  },
];
