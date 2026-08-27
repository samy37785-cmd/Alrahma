import { useState, useRef } from 'react';
import useSpeech from '../../../hooks/useSpeech';
import { useLang } from '../../../context/LangContext';
import { alphabetGroups } from '../../../data';

const stripDiacritics = (s = '') => s.replace(/[ً-ْ]/g, '').trim();

const AR_LETTER_GROUPS = ['ا ب ت ث','ج ح خ د','ذ ر ز س','ش ص ض ط','ظ ع غ ف','ق ك ل م','ن ه و ي'];

const RECORDINGS = [
  { src: '/audio/arabic-alphabet-full.ogg' },
  { src: '/audio/arabic-alphabet-pronunciation.ogg' },
];

export default function AlphabetLearner({ onClose }) {
  const { t, lang } = useLang();
  const al = t.alphabet;
  const copy = {
    en: { reader1: 'Reader 1', reader2: 'Reader 2', pronunciation: 'Pronunciation', names: {}, descriptions: {} },
    ar: { reader1: 'القارئ ١', reader2: 'القارئ ٢', pronunciation: 'النطق:', names: { Fatha: 'الفتحة', Kasra: 'الكسرة', Damma: 'الضمة', Sukun: 'السكون', 'Tanwin Fath': 'تنوين الفتح', 'Tanwin Kasr': 'تنوين الكسر', 'Tanwin Damm': 'تنوين الضم', Shadda: 'الشدة', 'Ta Marbuta': 'التاء المربوطة', 'Alef Maqsura': 'الألف المقصورة', Hamza: 'الهمزة', 'Lam-Alef': 'لام ألف' }, descriptions: { Fatha: 'صوت «ا» قصير — أكثر الحركات شيوعاً', Kasra: 'صوت «إ» قصير — يُكتب تحت الحرف', Damma: 'صوت «ُ» قصير — يشبه واواً صغيرة', Sukun: 'لا حركة — الحرف ساكن', 'Tanwin Fath': 'فتحتان — تضيفان صوت «ان» في النهاية', 'Tanwin Kasr': 'كسرتان — تضيفان صوت «إن» في النهاية', 'Tanwin Damm': 'ضمتان — تضيفان صوت «ٌن» في النهاية', Shadda: 'تضاعف قوة الحرف الساكن', 'Ta Marbuta': 'علامة التأنيث — تُنطق «ة» أو «ت»', 'Alef Maqsura': 'ألف في آخر الكلمة — تشبه ي بلا نقاط', Hamza: 'وقفة حلقية قصيرة', 'Lam-Alef': 'رباط إلزامي بين ل + ا' } },
    it: { reader1: 'Lettore 1', reader2: 'Lettore 2', pronunciation: 'Pronuncia:', names: { Fatha: 'Fatha', Kasra: 'Kasra', Damma: 'Damma', Sukun: 'Sukun', 'Tanwin Fath': 'Tanwin Fath', 'Tanwin Kasr': 'Tanwin Kasr', 'Tanwin Damm': 'Tanwin Damm', Shadda: 'Shadda', 'Ta Marbuta': 'Ta marbuta', 'Alef Maqsura': 'Alef maqsura', Hamza: 'Hamza', 'Lam-Alef': 'Lam-Alef' }, descriptions: { Fatha: '“a” breve — la vocale più comune', Kasra: '“i” breve — si scrive sotto la lettera', Damma: '“u” breve — assomiglia a una piccola و', Sukun: 'Nessuna vocale — la lettera è senza vocale', 'Tanwin Fath': 'Fatha doppia — aggiunge il suono “an” alla fine', 'Tanwin Kasr': 'Kasra doppia — aggiunge il suono “in” alla fine', 'Tanwin Damm': 'Damma doppia — aggiunge il suono “un” alla fine', Shadda: 'Raddoppia la consonante', 'Ta Marbuta': 'Suffisso femminile — suona come “a” o “at”', 'Alef Maqsura': '“a” finale — sembra una ي senza punti', Hamza: 'Colpo di glottide — una breve chiusura della gola', 'Lam-Alef': 'Legatura obbligatoria di ل + ا' } },
    es: { reader1: 'Lector 1', reader2: 'Lector 2', pronunciation: 'Pronunciación:', names: { Fatha: 'Fatha', Kasra: 'Kasra', Damma: 'Damma', Sukun: 'Sukun', 'Tanwin Fath': 'Tanwin fatha', 'Tanwin Kasr': 'Tanwin kasra', 'Tanwin Damm': 'Tanwin damma', Shadda: 'Shadda', 'Ta Marbuta': 'Ta marbuta', 'Alef Maqsura': 'Alef maqsura', Hamza: 'Hamza', 'Lam-Alef': 'Lam-álef' }, descriptions: { Fatha: '“a” corta — la vocal más común', Kasra: '“i” corta — se escribe debajo de la letra', Damma: '“u” corta — parece una و pequeña', Sukun: 'Sin vocal — la letra queda sin vocal', 'Tanwin Fath': 'Fatha doble — añade el sonido “an” al final', 'Tanwin Kasr': 'Kasra doble — añade el sonido “in” al final', 'Tanwin Damm': 'Damma doble — añade el sonido “un” al final', Shadda: 'Duplica la consonante', 'Ta Marbuta': 'Sufijo femenino — suena como “a” o “at”', 'Alef Maqsura': '“a” final — parece una ي sin puntos', Hamza: 'Oclusión glotal — una breve interrupción en la garganta', 'Lam-Alef': 'Ligadura obligatoria de ل + ا' } },
    de: { reader1: 'Rezitator 1', reader2: 'Rezitator 2', pronunciation: 'Aussprache:', names: { Fatha: 'Fatha', Kasra: 'Kasra', Damma: 'Damma', Sukun: 'Sukun', 'Tanwin Fath': 'Tanwin-Fatha', 'Tanwin Kasr': 'Tanwin-Kasra', 'Tanwin Damm': 'Tanwin-Damma', Shadda: 'Schadda', 'Ta Marbuta': 'Ta marbuta', 'Alef Maqsura': 'Alef maqsura', Hamza: 'Hamza', 'Lam-Alef': 'Lam-Alef' }, descriptions: { Fatha: 'Kurzes „a“ — der häufigste Vokal', Kasra: 'Kurzes „i“ — wird unter dem Buchstaben geschrieben', Damma: 'Kurzes „u“ — sieht wie ein kleines و aus', Sukun: 'Kein Vokal — der Buchstabe bleibt vokallos', 'Tanwin Fath': 'Doppelte Fatha — fügt am Ende den Laut „an“ hinzu', 'Tanwin Kasr': 'Doppelte Kasra — fügt am Ende den Laut „in“ hinzu', 'Tanwin Damm': 'Doppelte Damma — fügt am Ende den Laut „un“ hinzu', Shadda: 'Verdoppelt den Konsonanten', 'Ta Marbuta': 'Weibliche Endung — klingt wie „a“ oder „at“', 'Alef Maqsura': 'Abschließendes „a“ — sieht aus wie ein ي ohne Punkte', Hamza: 'Glottisschlag — ein kurzer Verschluss im Hals', 'Lam-Alef': 'Verbindliche Ligatur aus ل + ا' } },
    fr: { reader1: 'Récitant 1', reader2: 'Récitant 2', pronunciation: 'Prononciation :', names: { Fatha: 'Fatha', Kasra: 'Kasra', Damma: 'Damma', Sukun: 'Sukun', 'Tanwin Fath': 'Tanwin fatha', 'Tanwin Kasr': 'Tanwin kasra', 'Tanwin Damm': 'Tanwin damma', Shadda: 'Chadda', 'Ta Marbuta': 'Ta marbuta', 'Alef Maqsura': 'Alef maqsura', Hamza: 'Hamza', 'Lam-Alef': 'Lam-alef' }, descriptions: { Fatha: '« a » bref — la voyelle la plus courante', Kasra: '« i » bref — s’écrit sous la lettre', Damma: '« ou » bref — ressemble à un petit و', Sukun: 'Aucune voyelle — la lettre reste sans voyelle', 'Tanwin Fath': 'Fatha doublée — ajoute le son « an » à la fin', 'Tanwin Kasr': 'Kasra doublée — ajoute le son « in » à la fin', 'Tanwin Damm': 'Damma doublée — ajoute le son « un » à la fin', Shadda: 'Double la consonne', 'Ta Marbuta': 'Suffixe féminin — se prononce « a » ou « at »', 'Alef Maqsura': '« a » final — ressemble à un ي sans points', Hamza: 'Coup de glotte — une brève fermeture dans la gorge', 'Lam-Alef': 'Ligature obligatoire de ل + ا' } },
  }[lang] || {};
  const { speak, listen, sttSupported } = useSpeech();
  const [groupIndex, setGroupIndex] = useState(0);
  const [micLetter, setMicLetter]   = useState(null);
  const [result, setResult]         = useState(null);
  const [playing, setPlaying]       = useState(null);
  const [recIdx, setRecIdx]         = useState(0);
  const audioRef = useRef(null);

  const group   = alphabetGroups[groupIndex];
  const isFirst = groupIndex === 0;
  const isLast  = groupIndex === alphabetGroups.length - 1;

  const goTo = (i) => { setGroupIndex(i); setResult(null); };
  const goPrev = () => goTo(Math.max(0, groupIndex - 1));
  const goNext = () => goTo(Math.min(alphabetGroups.length - 1, groupIndex + 1));

  const playArabic = (letter) => {
    if (letter.audio) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      const a = new Audio(letter.audio);
      audioRef.current = a;
      setPlaying(letter.ar);
      a.onended = () => setPlaying(null);
      a.onerror = () => { setPlaying(null); speak(letter.say, 'ar-SA'); };
      a.play().catch(() => { setPlaying(null); speak(letter.say, 'ar-SA'); });
    } else {
      speak(letter.say, 'ar-SA');
    }
  };

  const testPronunciation = async (letter) => {
    setMicLetter(letter.ar);
    setResult(null);
    try {
      const heard  = await listen('ar-SA');
      const target = stripDiacritics(letter.say);
      const ok =
        stripDiacritics(heard).includes(target) ||
        heard.includes(letter.ar) ||
        target.includes(stripDiacritics(heard));
      setResult({ ar: letter.ar, ok, heard });
    } catch (err) {
      setResult({ ar: letter.ar, ok: false,
        heard: err.message === 'no-speech' ? al.noSpeech : al.micError });
    } finally {
      setMicLetter(null);
    }
  };

  return (
    <div className="alpha">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="alpha__header">
        <div>
          <h4 className="alpha__title">{al.title}</h4>
          <p className="alpha__subtitle">{al.title}</p>
        </div>
        <button className="alpha__close-btn" onClick={onClose} aria-label={al.closeLabel}>&#10005;</button>
      </div>

      {/* ── Progress dots ───────────────────────────────────── */}
      <div className="alpha__dots">
        {alphabetGroups.map((_, i) => (
          <button
            key={i}
            className={i === groupIndex ? 'alpha__dot alpha__dot--active' : 'alpha__dot'}
            onClick={() => goTo(i)}
            aria-label={al.groupPrefix + ' ' + (i + 1)}
          />
        ))}
      </div>
      <p className="alpha__group-label">
        {groupIndex < 7
          ? `${al.groupPrefix} ${groupIndex + 1} — ${AR_LETTER_GROUPS[groupIndex]}`
          : groupIndex === 7 ? al.shortVowels
          : groupIndex === 8 ? al.tanwinShadda
          : al.specialLetters}
      </p>

      {/* ── Full-alphabet recordings ─────────────────────────── */}
      <div className="alpha__recordings">
        <div className="alpha__rec-header">
          <span className="alpha__rec-title">{al.listenFull}</span>
          <div className="alpha__rec-tabs">
            {RECORDINGS.map((r, i) => (
              <button
                key={i}
                className={i === recIdx ? 'alpha__rec-tab alpha__rec-tab--active' : 'alpha__rec-tab'}
                onClick={() => setRecIdx(i)}
              >
                {i === 0 ? copy.reader1 : copy.reader2}
              </button>
            ))}
          </div>
        </div>
        <audio
          controls
          src={RECORDINGS[recIdx].src}
          className="alpha__rec-audio"
          key={recIdx}
        />
      </div>

      {/* ── Letter cards ─────────────────────────────────────── */}
      <div className="alpha__cards">
        {group.map((letter) => (
          <div className="alpha__card" key={letter.ar}>
            <div className="alpha__glyph" dir="rtl" lang="ar">{letter.ar}</div>
            <div className="alpha__card-name">{copy.names[letter.name] || letter.name}</div>
            <div className="alpha__card-it">{copy.pronunciation} {letter.it}</div>
            {letter.desc && <p className="alpha__card-desc">{copy.descriptions[letter.name] || (lang === 'en' ? letter.desc : '')}</p>}

            <div className="alpha__actions">
              <button
                className={playing === letter.ar ? 'alpha__btn alpha__btn--ar alpha__btn--playing' : 'alpha__btn alpha__btn--ar'}
                onClick={() => playArabic(letter)}
                title={al.listenTitle}
              >
                {playing === letter.ar ? '⏸' : '🔊'}
              </button>

              {sttSupported && (
                <button
                  className={micLetter === letter.ar ? 'alpha__btn alpha__btn--mic alpha__btn--listening' : 'alpha__btn alpha__btn--mic'}
                  onClick={() => testPronunciation(letter)}
                  disabled={micLetter !== null}
                  title={al.testPronTitle}
                >
                  {micLetter === letter.ar ? '⏳' : '🎙'}
                </button>
              )}
            </div>

            {result && result.ar === letter.ar && (
              <p className={result.ok ? 'alpha__feedback alpha__feedback--ok' : 'alpha__feedback alpha__feedback--no'}>
                {result.ok ? al.wellDone : '✗ ' + result.heard}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* ── Navigation ───────────────────────────────────────── */}
      <div className="alpha__nav">
        <button className="alpha__nav-btn" onClick={goPrev} disabled={isFirst}>
          {al.prevBtn}
        </button>
        <span className="alpha__nav-count">{groupIndex + 1} / {alphabetGroups.length}</span>
        <button className="alpha__nav-btn alpha__nav-btn--next" onClick={goNext} disabled={isLast}>
          {al.nextBtn}
        </button>
      </div>

    </div>
  );
}