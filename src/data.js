// Central site content & configuration — edit here to update the whole site.

export const site = {
  name: 'AL-Rahma',
  tagline: 'Learn the Holy Quran Online',
  email: 'info@al-rahmaacademy.com',
  phoneDisplay: '+20 101 605 4663',
  phoneHref: '+201016054663',
  whatsapp: '201016054663',
  whatsappDisplay: '+20 101 605 4663',
};

export const navLinks = [
  { href: '#top', label: 'Home' },
  { href: '#about', label: 'About' },
  { href: '#courses', label: 'Courses' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#testimonials', label: 'Testimonials' },
  { href: '#contact', label: 'Contact' },
];

export const socials = [
  { label: 'Facebook', icon: 'fa-brands fa-facebook-f', href: 'https://facebook.com/alrahmaacademy' },
  { label: 'Instagram', icon: 'fa-brands fa-instagram', href: 'https://instagram.com/alrahmaacademy' },
  { label: 'Twitter', icon: 'fa-brands fa-x-twitter', href: 'https://twitter.com/alrahmaacademy' },
  { label: 'YouTube', icon: 'fa-brands fa-youtube', href: 'https://youtube.com/@alrahmaacademy' },
];

export const features = [
  {
    icon: '🎓',
    title: 'Free Trial Lessons',
    text: 'Start with two complimentary trial lessons — no commitment, no payment required.',
  },
  {
    icon: '🕒',
    title: 'Flexible Schedule',
    text: 'Classes available 24 hours a day, 7 days a week to fit any time zone.',
  },
  {
    icon: '👩‍🏫',
    title: 'Female Tutors Available',
    text: 'Professional, qualified female instructors for sisters and children.',
  },
];

export const steps = [
  {
    num: 1,
    title: 'Fill the free trial form',
    text: 'Tell us about the student and the course you’re interested in.',
  },
  {
    num: 2,
    title: 'Schedule a trial session',
    text: 'We’ll match you with a tutor and a time that works for you.',
  },
  {
    num: 3,
    title: 'Download the meeting app',
    text: 'Join your lessons easily over Zoom or Skype, from anywhere.',
  },
];

export const courses = [
  {
    media: '📖',
    title: 'Quran Reading (Noorani Qaida)',
    text: 'Learn to read the Quran correctly from the very basics of Arabic letters and sounds.',
  },
  {
    media: '🎙️',
    title: 'Recitation with Tajweed',
    text: 'Master the rules of Tajweed for beautiful and accurate Quranic recitation.',
    resources: [
      {
        type: 'youtube',
        label: 'Watch the course on YouTube',
        url: 'https://youtube.com/playlist?list=PLRpvHZq8NeLacnKt2FKtlTSRLWoFOpBGA',
      },
      {
        type: 'pdf',
        label: 'Read the Tajweed book (PDF)',
        url: 'https://www.islam.gov.bh/wp-content/uploads/2022/03/omdah12.pdf',
      },
    ],
  },
  {
    media: '🧠',
    title: 'Quran Memorization (Hifz)',
    text: 'Structured memorization programs with revision plans for all ages.',
    resources: [
      {
        type: 'link',
        label: 'Memorization & follow-up website',
        url: 'https://quran.ksu.edu.sa/',
      },
      {
        type: 'pdf',
        label: 'Download the Hifz plan schedule (PDF)',
        url: 'https://ia801604.us.archive.org/15/items/wessam_20161022_1623/%D8%AC%D8%AF%D9%88%D9%84%20%D8%AD%D9%81%D8%B8%20%D8%A7%D9%84%D9%82%D8%B1%D8%A2%D9%86%20%D8%A7%D9%84%D9%83%D8%B1%D9%8A%D9%85.pdf',
      },
    ],
  },
  {
    media: '📜',
    title: 'Quran Ijazah Course',
    text: 'Earn a formal certification (Ijazah) with a connected chain of narration.',
  },
  {
    media: '🕌',
    title: 'Islamic Studies',
    text: 'Learn the fundamentals of Aqeedah, Fiqh, Seerah and daily Islamic practice.',
  },
  {
    media: '🔤',
    title: 'Arabic & Italian Alphabet',
    text: 'Learn the letters in Arabic and Italian together, with interactive audio pronunciation in both accents.',
    interactive: 'alphabet',
  },
];

// Interactive alphabet.
// Fields: ar=glyph, name=English, say=Arabic TTS text, it=Italian transliteration,
//         audio=local MP3 path (islamcan.com, downloaded), desc=optional note.
// Audio falls back to Web Speech API when unavailable.
const L = '/audio/letters'; // local folder: public/audio/letters/

export const alphabetGroups = [
  // ── Group 1: ا ب ت ث ──────────────────────────────────────────────────────
  [
    { ar: 'ا', name: 'Alif',  say: 'أَلِف',  it: 'A',     audio: `${L}/alif.mp3` },
    { ar: 'ب', name: 'Ba',    say: 'بَاء',   it: 'B',     audio: `${L}/ba.mp3` },
    { ar: 'ت', name: 'Ta',    say: 'تَاء',   it: 'T',     audio: `${L}/ta.mp3` },
    { ar: 'ث', name: 'Tha',   say: 'ثَاء',   it: 'Th',    audio: `${L}/tha.mp3` },
  ],
  // ── Group 2: ج ح خ د ──────────────────────────────────────────────────────
  [
    { ar: 'ج', name: 'Jeem',  say: 'جِيم',   it: 'G/Gi',  audio: `${L}/jeem.mp3` },
    { ar: 'ح', name: 'Ha',    say: 'حَاء',   it: 'H',     audio: `${L}/ha.mp3` },
    { ar: 'خ', name: 'Kha',   say: 'خَاء',   it: 'Kh',    audio: `${L}/kha.mp3` },
    { ar: 'د', name: 'Dal',   say: 'دَال',   it: 'D',     audio: `${L}/dal.mp3` },
  ],
  // ── Group 3: ذ ر ز س ──────────────────────────────────────────────────────
  [
    { ar: 'ذ', name: 'Dhal',  say: 'ذَال',   it: 'Dh',    audio: `${L}/dhal.mp3` },
    { ar: 'ر', name: 'Ra',    say: 'رَاء',   it: 'R',     audio: `${L}/ra.mp3` },
    { ar: 'ز', name: 'Zain',  say: 'زَاي',   it: 'Z',     audio: `${L}/zain.mp3` },
    { ar: 'س', name: 'Sin',   say: 'سِين',   it: 'S',     audio: `${L}/sin.mp3` },
  ],
  // ── Group 4: ش ص ض ط ──────────────────────────────────────────────────────
  [
    { ar: 'ش', name: 'Shin',  say: 'شِين',   it: 'Sc/Sh', audio: `${L}/shin.mp3` },
    { ar: 'ص', name: 'Sad',   say: 'صَاد',   it: 'S',     audio: `${L}/sad.mp3` },
    { ar: 'ض', name: 'Dad',   say: 'ضَاد',   it: 'D',     audio: `${L}/dad.mp3` },
    { ar: 'ط', name: 'Tah',   say: 'طَاء',   it: 'T',     audio: `${L}/tah.mp3` },
  ],
  // ── Group 5: ظ ع غ ف ──────────────────────────────────────────────────────
  [
    { ar: 'ظ', name: 'Zah',   say: 'ظَاء',   it: 'Z',     audio: `${L}/zah.mp3` },
    { ar: 'ع', name: 'Ain',   say: 'عَين',   it: 'Ain',   audio: `${L}/ain.mp3` },
    { ar: 'غ', name: 'Ghain', say: 'غَين',   it: 'Gh',    audio: `${L}/ghain.mp3` },
    { ar: 'ف', name: 'Fa',    say: 'فَاء',   it: 'F',     audio: `${L}/fa.mp3` },
  ],
  // ── Group 6: ق ك ل م ──────────────────────────────────────────────────────
  [
    { ar: 'ق', name: 'Qaf',   say: 'قَاف',   it: 'Q',     audio: `${L}/qaf.mp3` },
    { ar: 'ك', name: 'Kaf',   say: 'كَاف',   it: 'K',     audio: `${L}/kaf.mp3` },
    { ar: 'ل', name: 'Lam',   say: 'لاَم',   it: 'L',     audio: `${L}/lam.mp3` },
    { ar: 'م', name: 'Meem',  say: 'مِيم',   it: 'M',     audio: `${L}/meem.mp3` },
  ],
  // ── Group 7: ن ه و ي ──────────────────────────────────────────────────────
  [
    { ar: 'ن', name: 'Noon',  say: 'نُون',   it: 'N',     audio: `${L}/noon.mp3` },
    { ar: 'ه', name: 'Heh',   say: 'هَاء',   it: 'H',     audio: `${L}/heh.mp3` },
    { ar: 'و', name: 'Waw',   say: 'وَاو',   it: 'W/U',   audio: `${L}/waw.mp3` },
    { ar: 'ي', name: 'Ya',    say: 'يَاء',   it: 'Y/I',   audio: `${L}/ya.mp3` },
  ],
  // ── Group 8: Short vowels (harakat) ───────────────────────────────────────
  [
    { ar: 'أَ', name: 'Fatha',       say: 'فَتحة',          it: 'A',      desc: 'Short "a" — the most common vowel' },
    { ar: 'أِ', name: 'Kasra',       say: 'كَسرة',          it: 'I',      desc: 'Short "i" — written below the letter' },
    { ar: 'أُ', name: 'Damma',       say: 'ضَمة',           it: 'U',      desc: 'Short "u" — looks like a small و' },
    { ar: 'أْ', name: 'Sukun',       say: 'سُكون',          it: '—',      desc: 'No vowel — the letter is silent/stopped' },
  ],
  // ── Group 9: Tanwin & Shadda ───────────────────────────────────────────────
  [
    { ar: 'أً', name: 'Tanwin Fath', say: 'تَنوين الفَتح',  it: '-an',    desc: 'Double fatha — adds "an" sound at end' },
    { ar: 'أٍ', name: 'Tanwin Kasr', say: 'تَنوين الكَسر',  it: '-in',    desc: 'Double kasra — adds "in" sound at end' },
    { ar: 'أٌ', name: 'Tanwin Damm', say: 'تَنوين الضَم',   it: '-un',    desc: 'Double damma — adds "un" sound at end' },
    { ar: 'أّ', name: 'Shadda',      say: 'شَدة',           it: 'Double', desc: 'Doubles the consonant strength' },
  ],
  // ── Group 10: Special letters & forms ─────────────────────────────────────
  [
    { ar: 'ة', name: 'Ta Marbuta',   say: 'تاء مَربوطة',   it: 'a / at', desc: 'Feminine suffix — sounds like "a" or "at"' },
    { ar: 'ى', name: 'Alef Maqsura', say: 'أَلِف مَقصورة', it: 'a',      desc: 'Final "a" — looks like ي without dots' },
    { ar: 'ء', name: 'Hamza',        say: 'هَمزة',          it: "ʾ",      desc: 'Glottal stop — a brief catch in the throat' },
    { ar: 'لا', name: 'Lam-Alef',   say: 'لا',             it: 'lā',     desc: 'Mandatory ligature of ل + ا' },
  ],
];

export const stats = [
  { value: '4+', label: 'Years of experience' },
  { value: '10+', label: 'Qualified tutors' },
  { value: '200+', label: 'Happy students' },
  { value: '600+', label: 'Teaching hours' },
];

export const plans = [
  {
    name: 'Starter',
    price: '€56',
    featured: false,
    features: ['2 classes / week', '1 hour per class', 'One-to-one tutoring', 'Zoom or Skype'],
  },
  {
    name: 'Standard',
    price: '€84',
    featured: true,
    tag: 'Most popular',
    features: ['3 classes / week', '1 hour per class', 'One-to-one tutoring', 'Progress reports'],
  },
  {
    name: 'Premium',
    price: '€112',
    featured: false,
    features: ['4 classes / week', '1 hour per class', 'One-to-one tutoring', 'Ijazah pathway support'],
  },
];

export const testimonials = [
  {
    quote:
      'My children love their lessons. The tutors are patient, kind and truly knowledgeable. We’ve seen amazing progress in just a few months.',
    name: 'Aisha R.',
    location: 'Manchester, UK',
  },
  {
    quote:
      'Flexible timing made it possible for me to study around work. My Tajweed has improved more than I imagined. Highly recommended.',
    name: 'Yusuf K.',
    location: 'Frankfurt, Germany',
  },
  {
    quote:
      'Professional, organized and very welcoming. The free trial convinced our whole family to join. May Allah reward the teachers.',
    name: 'Sarah M.',
    location: 'Texas, USA',
  },
];

export const courseOptions = [
  'Quran Reading (Noorani Qaida)',
  'Recitation with Tajweed',
  'Quran Memorization (Hifz)',
  'Quran Ijazah',
  'Islamic Studies',
  'Arabic Language',
];
