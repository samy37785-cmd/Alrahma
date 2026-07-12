// 5 well-known, authentic hadith excerpts (Sahih al-Bukhari / Sahih Muslim only).
// Arabic text is locale-independent (one copy for every UI language) — the
// translated gloss + source citation live in i18n `dashboard.wisdomQuotes.<id>`.
export const DAILY_WISDOM = [
  { id: 'intentions', arabic: 'إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى' },
  { id: 'learnTeach', arabic: 'خَيْرُكُمْ مَنْ تَعَلَّمَ الْقُرْآنَ وَعَلَّمَهُ' },
  { id: 'loveForBrother', arabic: 'لَا يُؤْمِنُ أَحَدُكُمْ حَتَّى يُحِبَّ لِأَخِيهِ مَا يُحِبُّ لِنَفْسِهِ' },
  { id: 'speakGoodOrSilent', arabic: 'مَنْ كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الْآخِرِ فَلْيَقُلْ خَيْرًا أَوْ لِيَصْمُتْ' },
  { id: 'strongBeliever', arabic: 'الْمُؤْمِنُ الْقَوِيُّ خَيْرٌ وَأَحَبُّ إِلَى اللَّهِ مِنَ الْمُؤْمِنِ الضَّعِيفِ، وَفِي كُلٍّ خَيْرٌ' },
];

// Same quote all day, rotates once every calendar day — no persistence needed.
export function getDailyWisdom(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - start) / 86400000);
  return DAILY_WISDOM[dayOfYear % DAILY_WISDOM.length];
}