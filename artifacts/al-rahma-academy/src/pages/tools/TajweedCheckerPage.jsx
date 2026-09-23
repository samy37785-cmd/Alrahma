import '../../styles/islamic-tools.css';
import { useState, useRef, useCallback } from 'react';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import useSEO from '../../hooks/useSEO';
import { useLang } from '../../context/LangContext';
import { TAJWEED_CHECKER_TEXT } from '../../i18n/tools/tajweedChecker';

// Short practice verses with transliteration
const VERSES = [
  {
    arabic: 'بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ',
    transliteration: 'Bismillāhi r-raḥmāni r-raḥīm',
    translation: 'In the name of Allah, the Most Gracious, the Most Merciful',
    ref: 'Al-Fatiha 1:1',
  },
  {
    arabic: 'الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ',
    transliteration: 'Al-ḥamdu lillāhi rabbi l-ʿālamīn',
    translation: 'All praise is due to Allah, Lord of all the worlds',
    ref: 'Al-Fatiha 1:2',
  },
  {
    arabic: 'الرَّحْمَٰنِ الرَّحِيمِ',
    transliteration: 'Ar-raḥmāni r-raḥīm',
    translation: 'The Most Gracious, the Most Merciful',
    ref: 'Al-Fatiha 1:3',
  },
  {
    arabic: 'مَالِكِ يَوْمِ الدِّينِ',
    transliteration: 'Māliki yawmi d-dīn',
    translation: 'Master of the Day of Judgment',
    ref: 'Al-Fatiha 1:4',
  },
  {
    arabic: 'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ',
    transliteration: 'Iyyāka naʿbudu wa-iyyāka nastaʿīn',
    translation: 'You alone we worship, and You alone we ask for help',
    ref: 'Al-Fatiha 1:5',
  },
  {
    arabic: 'اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ',
    transliteration: 'Ihdinā ṣ-ṣirāṭa l-mustaqīm',
    translation: 'Guide us to the straight path',
    ref: 'Al-Fatiha 1:6',
  },
];

// Rough Arabic → Latin normalisation for comparison
function normaliseArabic(str) {
  return str
    .replace(/[ً-ٰٟ]/g, '') // strip harakat/tashkeel
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a, b) {
  const na = normaliseArabic(a).replace(/\s/g, '');
  const nb = normaliseArabic(b).replace(/\s/g, '');
  if (!na || !nb) return 0;
  let matches = 0;
  const shorter = na.length < nb.length ? na : nb;
  const longer  = na.length < nb.length ? nb : na;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) matches++;
  }
  return matches / longer.length;
}

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

export default function TajweedCheckerPage() {
  const { lang } = useLang();
  const t = TAJWEED_CHECKER_TEXT[lang] || TAJWEED_CHECKER_TEXT.en;
  useSEO({ title: t.seo.title, description: t.seo.description });

  const [verseIdx, setVerseIdx] = useState(0);
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [score, setScore] = useState(null);
  const [error, setError] = useState('');
  const recRef = useRef(null);
  const verse = VERSES[verseIdx];

  // Language Closure Phase 3 (policy approved by محمود): each VERSES entry's
  // `translation` is a full English sentence (e.g. "In the name of Allah,
  // the Most Gracious, the Most Merciful") that was shown unconditionally,
  // regardless of `lang` — an earlier, since-superseded decision documented
  // in i18n/tools/tajweedChecker.js's own comment explicitly kept VERSES
  // untouched as "the same fixed reference content for every UI language."
  // The real, authoritative Arabic text (`verse.arabic`) was already
  // correct and already rendered unconditionally above — no Quran text is
  // invented here, only the English gloss is hidden on the Arabic page.
  // `transliteration` (Latin) and `ref` ("Al-Fatiha 1:1") are untouched —
  // out of scope for this phase, tracked separately per the audit.
  const showTranslation = lang !== 'ar';

  const startListening = useCallback(() => {
    if (!SpeechRec) {
      setError(t.errors.noSpeechInline);
      return;
    }
    setError('');
    setTranscript('');
    setScore(null);
    const rec = new SpeechRec();
    rec.lang = 'ar-SA';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recRef.current = rec;

    rec.onstart = () => setListening(true);
    rec.onend   = () => setListening(false);
    rec.onerror = (e) => {
      setListening(false);
      if (e.error !== 'no-speech') {
        setError(t.errors.recognitionError.replace('{error}', e.error));
      }
    };
    rec.onresult = (e) => {
      const said = e.results[0][0].transcript;
      setTranscript(said);
      const pct = Math.round(similarity(verse.arabic, said) * 100);
      setScore(pct);
    };
    rec.start();
  }, [verse.arabic, t]);

  const stopListening = () => { recRef.current?.stop(); setListening(false); };

  const scoreColor = score === null ? '' : score >= 80 ? '#1a9e72' : score >= 50 ? '#d4af37' : '#c0392b';
  const scoreFeedback = score === null ? '' : score >= 80
    ? t.feedback.excellent
    : score >= 50
    ? t.feedback.good
    : t.feedback.keepPractising;

  return (
    <>
      <Header />
      <main id="main-content">
        <Breadcrumbs
          items={[
            { label: t.breadcrumbs.tools, to: '/tools' },
            { label: t.breadcrumbs.current },
          ]}
        />

        <section className="hub-hero">
          <div className="container hub-hero__inner">
            <span className="eyebrow">🎙️ {t.eyebrow}</span>
            <h1>{t.hero.title}</h1>
            <p className="hub-hero__sub">{t.hero.sub}</p>
          </div>
        </section>

        <section className="container" style={{ maxWidth: 700, paddingBottom: 80 }}>

          {/* Verse selector */}
          <div className="tajweed__verse-nav">
            {VERSES.map((v, i) => (
              <button
                key={i}
                type="button"
                className={`tajweed__verse-tab${verseIdx === i ? ' active' : ''}`}
                onClick={() => { setVerseIdx(i); setTranscript(''); setScore(null); }}
              >
                {i + 1}
              </button>
            ))}
          </div>

          {/* Current verse card */}
          <div className="tajweed__card">
            <p className="tajweed__ref">{verse.ref}</p>
            <p className="tajweed__arabic" lang="ar" dir="rtl">{verse.arabic}</p>
            <p className="tajweed__transliteration">{verse.transliteration}</p>
            {showTranslation && <p className="tajweed__translation">{verse.translation}</p>}
          </div>

          {/* Controls */}
          <div className="tajweed__controls">
            {!listening ? (
              <button
                type="button"
                className="btn btn--green btn--lg"
                onClick={startListening}
                disabled={!SpeechRec}
              >
                🎙️ {t.startReciting}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn--red btn--lg"
                onClick={stopListening}
              >
                <span className="tajweed__pulse" aria-hidden="true" />
                {t.stop}
              </button>
            )}
          </div>

          {listening && (
            <p className="tajweed__hint" aria-live="polite">
              🎙️ {t.listeningHint}
            </p>
          )}

          {error && <p className="tajweed__error" role="alert">{error}</p>}

          {/* Result */}
          {transcript && (
            <div className="tajweed__result">
              <p className="tajweed__label">{t.whatIHeard}</p>
              <p className="tajweed__heard" dir="rtl" lang="ar">{transcript}</p>

              {score !== null && (
                <>
                  <div className="tajweed__score-ring" style={{ '--score-color': scoreColor }}>
                    <svg viewBox="0 0 80 80">
                      <circle cx="40" cy="40" r="34" fill="none" stroke="#e9ecef" strokeWidth="8" />
                      <circle
                        cx="40" cy="40" r="34" fill="none"
                        stroke={scoreColor} strokeWidth="8"
                        strokeDasharray={`${2 * Math.PI * 34 * score / 100} ${2 * Math.PI * 34}`}
                        strokeLinecap="round"
                        transform="rotate(-90 40 40)"
                      />
                    </svg>
                    <span className="tajweed__score-num" style={{ color: scoreColor }}>{score}%</span>
                  </div>
                  <p className="tajweed__feedback" style={{ color: scoreColor }}>{scoreFeedback}</p>
                  <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => { setTranscript(''); setScore(null); }}
                    style={{ marginTop: 12 }}
                  >
                    {t.tryAgain}
                  </button>
                </>
              )}
            </div>
          )}

          {!SpeechRec && (
            <p className="tajweed__error" style={{ marginTop: 16 }}>
              {t.errors.noSpeechBanner}
            </p>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
