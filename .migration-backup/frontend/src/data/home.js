export const features = [
  { icon: '🎓', title: 'Free Trial Lessons',       text: 'Start with two complimentary trial lessons — no commitment, no payment required.' },
  { icon: '🕌', title: 'Al-Azhar Certified Tutors', text: 'All tutors are graduates of Al-Azhar University and hold a verified Ijazah with an authentic chain of knowledge.' },
  { icon: '🕒', title: 'Flexible Schedule',          text: 'Classes available 24 hours a day, 7 days a week to fit any time zone.' },
  { icon: '👩‍🏫', title: 'Female Tutors Available',  text: 'Professional, qualified female instructors for sisters and children.' },
  { icon: '🌍', title: 'Multilingual Instruction',   text: 'Lessons delivered in English, Italian or French — maximum understanding for every European student.' },
  { icon: '👤', title: 'One-to-One Only',            text: 'Every class is exclusively between you and your tutor — no group sessions, full personal attention.' },
];

export const steps = [
  { num: 1, title: 'Fill the free trial form',    text: "Tell us about the student and the course you're interested in." },
  { num: 2, title: 'Schedule a trial session',    text: "We'll match you with a tutor and a time that works for you." },
  { num: 3, title: 'Join your secure session',    text: 'Your tutor sends a secure video link 30 minutes before class — one click to join from any device.' },
];


export const plans = [
  {
    name: 'Noorani',
    arabicName: 'نوراني',
    tagline: 'Begin your light',
    originalPrice: '€75',
    price: '€56',
    pricePerHour: '€7',
    discountPct: 25,
    featured: false,
    sessionsPerWeek: 2,
    sessionsPerMonth: 8,
    features: ['2 classes / week', '8 sessions / month', '1 hour per class', 'One-to-one tutoring', 'Zoom or Skype'],
  },
  {
    name: 'Huffaz',
    arabicName: 'حُفَّاظ',
    tagline: 'Carry the Quran',
    originalPrice: '€112',
    price: '€84',
    pricePerHour: '€7',
    discountPct: 25,
    featured: true,
    tag: 'Most popular',
    sessionsPerWeek: 3,
    sessionsPerMonth: 12,
    features: ['3 classes / week', '12 sessions / month', '1 hour per class', 'One-to-one tutoring', 'Progress reports'],
  },
  {
    name: 'Ijazah',
    arabicName: 'إجازة',
    tagline: 'Earn your chain',
    originalPrice: '€149',
    price: '€112',
    pricePerHour: '€7',
    discountPct: 25,
    featured: false,
    sessionsPerWeek: 4,
    sessionsPerMonth: 16,
    features: ['4 classes / week', '16 sessions / month', '1 hour per class', 'One-to-one tutoring', 'Ijazah pathway support'],
  },
];
