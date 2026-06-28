export const courses = [
  {
    media: '📖',
    title: 'Quran Reading (Noorani Qaida)',
    text: 'Learn to read the Quran correctly from the very basics of Arabic letters and sounds.',
    points: ['Arabic letters & pronunciation', 'Noorani Qaida method step-by-step', 'Read Quran independently'],
    interactive: 'quran',
  },
  {
    media: '🎙️',
    title: 'Recitation with Tajweed',
    text: 'Master the rules of Tajweed for beautiful and accurate Quranic recitation.',
    points: ['All Tajweed rules (Hafs & Warsh)', 'Live correction by certified teacher', 'Audio & video practice materials'],
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
    text: 'Structured memorization programs with repetition tools, memory tests, and revision plans — in 17 languages.',
    points: ['Personalised memorization plan', 'Daily revision & progress tracking', 'Suitable for all ages'],
    interactive: 'quran',
  },
  {
    media: '📜',
    title: 'Quran Ijazah Course',
    text: 'Earn a formal certification (Ijazah) with a connected chain of narration.',
    points: ['Sanad connected to the Prophet ﷺ', 'Matn Al-Jazariyyah & Al-Shatibiyyah', 'Official Ijazah certificate issued'],
    detailPath: '/courses/ijazah',
  },
  {
    media: '🕌',
    title: 'Islamic Studies',
    text: 'Learn the fundamentals of Aqeedah, Fiqh, Seerah and daily Islamic practice.',
    points: ['5 modules — Aqeedah, Fiqh, Seerah, Hadith, Tafsir', 'Authentic primary Islamic sources', 'Taught in your own language'],
    detailPath: '/courses/islamic-studies',
  },
  {
    media: '🔤',
    title: 'Arabic & Italian Alphabet',
    text: 'Learn the letters in Arabic and Italian together, with interactive audio pronunciation in both accents.',
    points: ['28 Arabic letters with audio', 'Interactive in-browser practice', 'Italian phonetic equivalents'],
    interactive: 'alphabet',
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

const L = '/audio/letters';

export const alphabetGroups = [
  [
    { ar: 'ا', name: 'Alif',  say: 'أَلِف',  it: 'A',     audio: `${L}/alif.mp3` },
    { ar: 'ب', name: 'Ba',    say: 'بَاء',   it: 'B',     audio: `${L}/ba.mp3` },
    { ar: 'ت', name: 'Ta',    say: 'تَاء',   it: 'T',     audio: `${L}/ta.mp3` },
    { ar: 'ث', name: 'Tha',   say: 'ثَاء',   it: 'Th',    audio: `${L}/tha.mp3` },
  ],
  [
    { ar: 'ج', name: 'Jeem',  say: 'جِيم',   it: 'G/Gi',  audio: `${L}/jeem.mp3` },
    { ar: 'ح', name: 'Ha',    say: 'حَاء',   it: 'H',     audio: `${L}/ha.mp3` },
    { ar: 'خ', name: 'Kha',   say: 'خَاء',   it: 'Kh',    audio: `${L}/kha.mp3` },
    { ar: 'د', name: 'Dal',   say: 'دَال',   it: 'D',     audio: `${L}/dal.mp3` },
  ],
  [
    { ar: 'ذ', name: 'Dhal',  say: 'ذَال',   it: 'Dh',    audio: `${L}/dhal.mp3` },
    { ar: 'ر', name: 'Ra',    say: 'رَاء',   it: 'R',     audio: `${L}/ra.mp3` },
    { ar: 'ز', name: 'Zain',  say: 'زَاي',   it: 'Z',     audio: `${L}/zain.mp3` },
    { ar: 'س', name: 'Sin',   say: 'سِين',   it: 'S',     audio: `${L}/sin.mp3` },
  ],
  [
    { ar: 'ش', name: 'Shin',  say: 'شِين',   it: 'Sc/Sh', audio: `${L}/shin.mp3` },
    { ar: 'ص', name: 'Sad',   say: 'صَاد',   it: 'S',     audio: `${L}/sad.mp3` },
    { ar: 'ض', name: 'Dad',   say: 'ضَاد',   it: 'D',     audio: `${L}/dad.mp3` },
    { ar: 'ط', name: 'Tah',   say: 'طَاء',   it: 'T',     audio: `${L}/tah.mp3` },
  ],
  [
    { ar: 'ظ', name: 'Zah',   say: 'ظَاء',   it: 'Z',     audio: `${L}/zah.mp3` },
    { ar: 'ع', name: 'Ain',   say: 'عَين',   it: 'Ain',   audio: `${L}/ain.mp3` },
    { ar: 'غ', name: 'Ghain', say: 'غَين',   it: 'Gh',    audio: `${L}/ghain.mp3` },
    { ar: 'ف', name: 'Fa',    say: 'فَاء',   it: 'F',     audio: `${L}/fa.mp3` },
  ],
  [
    { ar: 'ق', name: 'Qaf',   say: 'قَاف',   it: 'Q',     audio: `${L}/qaf.mp3` },
    { ar: 'ك', name: 'Kaf',   say: 'كَاف',   it: 'K',     audio: `${L}/kaf.mp3` },
    { ar: 'ل', name: 'Lam',   say: 'لاَم',   it: 'L',     audio: `${L}/lam.mp3` },
    { ar: 'م', name: 'Meem',  say: 'مِيم',   it: 'M',     audio: `${L}/meem.mp3` },
  ],
  [
    { ar: 'ن', name: 'Noon',  say: 'نُون',   it: 'N',     audio: `${L}/noon.mp3` },
    { ar: 'ه', name: 'Heh',   say: 'هَاء',   it: 'H',     audio: `${L}/heh.mp3` },
    { ar: 'و', name: 'Waw',   say: 'وَاو',   it: 'W/U',   audio: `${L}/waw.mp3` },
    { ar: 'ي', name: 'Ya',    say: 'يَاء',   it: 'Y/I',   audio: `${L}/ya.mp3` },
  ],
  [
    { ar: 'أَ', name: 'Fatha',       say: 'فَتحة',          it: 'A',      desc: 'Short "a" — the most common vowel' },
    { ar: 'أِ', name: 'Kasra',       say: 'كَسرة',          it: 'I',      desc: 'Short "i" — written below the letter' },
    { ar: 'أُ', name: 'Damma',       say: 'ضَمة',           it: 'U',      desc: 'Short "u" — looks like a small و' },
    { ar: 'أْ', name: 'Sukun',       say: 'سُكون',          it: '—',      desc: 'No vowel — the letter is silent/stopped' },
  ],
  [
    { ar: 'أً', name: 'Tanwin Fath', say: 'تَنوين الفَتح',  it: '-an',    desc: 'Double fatha — adds "an" sound at end' },
    { ar: 'أٍ', name: 'Tanwin Kasr', say: 'تَنوين الكَسر',  it: '-in',    desc: 'Double kasra — adds "in" sound at end' },
    { ar: 'أٌ', name: 'Tanwin Damm', say: 'تَنوين الضَم',   it: '-un',    desc: 'Double damma — adds "un" sound at end' },
    { ar: 'أّ', name: 'Shadda',      say: 'شَدة',           it: 'Double', desc: 'Doubles the consonant strength' },
  ],
  [
    { ar: 'ة',  name: 'Ta Marbuta',   say: 'تاء مَربوطة',   it: 'a / at', desc: 'Feminine suffix — sounds like "a" or "at"' },
    { ar: 'ى',  name: 'Alef Maqsura', say: 'أَلِف مَقصورة', it: 'a',      desc: 'Final "a" — looks like ي without dots' },
    { ar: 'ء',  name: 'Hamza',        say: 'هَمزة',          it: 'glottal', desc: 'Glottal stop — a brief catch in the throat' },
    { ar: 'لا', name: 'Lam-Alef',    say: 'لا',             it: 'la',     desc: 'Mandatory ligature of ل + ا' },
  ],
];
