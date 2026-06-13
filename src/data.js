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

// Interactive alphabet: each letter has the Arabic glyph, a Latin name,
// `say` = vocalized Arabic for text-to-speech, and `it` = Italian transliteration.
// Grouped into small sets (4 letters) for easy, focused learning.
export const alphabetGroups = [
  [
    { ar: 'ا', name: 'Alif', say: 'أَلِف', it: 'A' },
    { ar: 'ب', name: 'Ba', say: 'بَاء', it: 'B' },
    { ar: 'ت', name: 'Ta', say: 'تَاء', it: 'T' },
    { ar: 'ث', name: 'Tha', say: 'ثَاء', it: 'Th' },
  ],
  [
    { ar: 'ج', name: 'Jim', say: 'جِيم', it: 'G/Gi' },
    { ar: 'ح', name: 'Ha', say: 'حَاء', it: 'Ḥ' },
    { ar: 'خ', name: 'Kha', say: 'خَاء', it: 'Kh' },
    { ar: 'د', name: 'Dal', say: 'دَال', it: 'D' },
  ],
  [
    { ar: 'ذ', name: 'Dhal', say: 'ذَال', it: 'Dh' },
    { ar: 'ر', name: 'Ra', say: 'رَاء', it: 'R' },
    { ar: 'ز', name: 'Zay', say: 'زَاي', it: 'Z' },
    { ar: 'س', name: 'Sin', say: 'سِين', it: 'S' },
  ],
  [
    { ar: 'ش', name: 'Shin', say: 'شِين', it: 'Sc/Sh' },
    { ar: 'ص', name: 'Sad', say: 'صَاد', it: 'Ṣ' },
    { ar: 'ض', name: 'Dad', say: 'ضَاد', it: 'Ḍ' },
    { ar: 'ط', name: 'Ta', say: 'طَاء', it: 'Ṭ' },
  ],
  [
    { ar: 'ظ', name: 'Za', say: 'ظَاء', it: 'Ẓ' },
    { ar: 'ع', name: 'Ain', say: 'عَين', it: 'ʿ' },
    { ar: 'غ', name: 'Ghain', say: 'غَين', it: 'Gh' },
    { ar: 'ف', name: 'Fa', say: 'فَاء', it: 'F' },
  ],
  [
    { ar: 'ق', name: 'Qaf', say: 'قَاف', it: 'Q' },
    { ar: 'ك', name: 'Kaf', say: 'كَاف', it: 'K' },
    { ar: 'ل', name: 'Lam', say: 'لاَم', it: 'L' },
    { ar: 'م', name: 'Mim', say: 'مِيم', it: 'M' },
  ],
  [
    { ar: 'ن', name: 'Nun', say: 'نُون', it: 'N' },
    { ar: 'ه', name: 'Ha', say: 'هَاء', it: 'H' },
    { ar: 'و', name: 'Waw', say: 'وَاو', it: 'W/U' },
    { ar: 'ي', name: 'Ya', say: 'يَاء', it: 'Y/I' },
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
