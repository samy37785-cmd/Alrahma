import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import '../../styles/islamic-tools.css';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import WhatsappFab from '../../components/ui/WhatsappFab';
import useSEO from '../../hooks/useSEO';
import { useLang } from '../../context/LangContext';
import { getVerse } from '../../api/quran';
import { DAILY_VERSE_KEYS } from '../../utils/islamicToolsUtils';

const clean = (html = '') =>
  html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();

export default function VerseOfTheDayPage() {
  const { lang } = useLang();
  const copy = {
    en: { title: 'Verse of the Day', description: 'A handpicked Quran verse every day with English translation — start your day with the words of Allah.', tools: 'Tools', prayerTools: 'Prayer Tools', eyebrow: 'Islamic Tools', hero: 'A carefully chosen verse for each day of the month with translation. Begin your day with the words of Allah.', loadError: 'Could not load the verse. Check your connection.', copy: '📋 Copy', copied: '✓ Copied!', share: '🔗 Share', shared: '✓ Shared!', whatsapp: 'Share on WhatsApp', read: '📖 Read full chapter', readLabel: 'Read in context', hint: '📸 Screenshot the card above to share it on Instagram or WhatsApp Stories', cta: 'Want to learn to recite verses like this with a certified Al-Azhar tutor?', trial: 'Book a Free Trial Lesson →', note: 'No credit card · Cancel anytime', related: 'Related tools', also: 'Also try:', prayer: 'Prayer Times', qibla: 'Qibla Direction', calendar: 'Islamic Calendar', adhkar: 'Daily Adhkar', today: "Today's Verse", quran: 'Quran', learn: 'Learn Quran at alrahma.academy' },
    ar: { title: 'آية اليوم', description: 'آية قرآنية يومية مختارة مع ترجمتها — ابدأ يومك بكلام الله.', tools: 'الأدوات', prayerTools: 'أدوات الصلاة', eyebrow: 'الأدوات الإسلامية', hero: 'آية قرآنية مختارة لكل يوم من أيام الشهر مع ترجمتها. ابدأ يومك بكلام الله.', loadError: 'تعذّر تحميل الآية. تحقّق من اتصالك.', copy: '📋 نسخ', copied: '✓ تم النسخ!', share: '🔗 مشاركة', shared: '✓ تمت المشاركة!', whatsapp: 'شارك على واتساب', read: '📖 اقرأ السورة كاملة', readLabel: 'اقرأ في السياق', hint: '📸 التقط صورة للبطاقة أعلاه وشاركها على إنستغرام أو حالات واتساب', cta: 'هل تريد تعلّم تلاوة آيات كهذه مع معلم معتمد من الأزهر؟', trial: 'ابدأ درساً تجريبياً مجانياً ←', note: 'لا حاجة لبطاقة ائتمان · ألغِ في أي وقت', related: 'أدوات مرتبطة', also: 'استكشف أيضاً:', prayer: 'مواقيت الصلاة', qibla: 'اتجاه القبلة', calendar: 'التقويم الإسلامي', adhkar: 'الأذكار اليومية', today: 'آية اليوم', quran: 'القرآن', learn: 'تعلّم القرآن مع أكاديمية الرحمة' },
    it: { title: 'Versetto del giorno', description: 'Un versetto del Corano scelto ogni giorno con traduzione — inizia la giornata con le parole di Allah.', tools: 'Strumenti', prayerTools: 'Strumenti per la preghiera', eyebrow: 'Strumenti islamici', hero: 'Un versetto scelto con cura per ogni giorno del mese, con traduzione. Inizia la giornata con le parole di Allah.', loadError: 'Impossibile caricare il versetto. Controlla la connessione.', copy: '📋 Copia', copied: '✓ Copiato!', share: '🔗 Condividi', shared: '✓ Condiviso!', whatsapp: 'Condividi su WhatsApp', read: '📖 Leggi la sura completa', readLabel: 'Leggi nel contesto', hint: '📸 Fai uno screenshot della scheda per condividerla su Instagram o nelle Storie di WhatsApp', cta: 'Vuoi imparare a recitare versetti come questo con un insegnante certificato di Al-Azhar?', trial: 'Prenota una lezione di prova gratuita →', note: 'Nessuna carta di credito · Annulla quando vuoi', related: 'Strumenti correlati', also: 'Prova anche:', prayer: 'Orari di preghiera', qibla: 'Direzione della Qibla', calendar: 'Calendario islamico', adhkar: 'Adhkar quotidiani', today: 'Versetto del giorno', quran: 'Corano', learn: 'Impara il Corano con Al-Rahma Academy' },
    es: { title: 'Versículo del día', description: 'Un versículo del Corán seleccionado cada día con traducción — comienza el día con las palabras de Allah.', tools: 'Herramientas', prayerTools: 'Herramientas de oración', eyebrow: 'Herramientas islámicas', hero: 'Un versículo cuidadosamente elegido para cada día del mes, con traducción. Comienza tu día con las palabras de Allah.', loadError: 'No se pudo cargar el versículo. Comprueba tu conexión.', copy: '📋 Copiar', copied: '✓ ¡Copiado!', share: '🔗 Compartir', shared: '✓ ¡Compartido!', whatsapp: 'Compartir en WhatsApp', read: '📖 Leer la sura completa', readLabel: 'Leer en contexto', hint: '📸 Haz una captura de la tarjeta para compartirla en Instagram o en los estados de WhatsApp', cta: '¿Quieres aprender a recitar versículos como este con un profesor certificado de Al-Azhar?', trial: 'Reserva una clase de prueba gratuita →', note: 'Sin tarjeta de crédito · Cancela cuando quieras', related: 'Herramientas relacionadas', also: 'Prueba también:', prayer: 'Horarios de oración', qibla: 'Dirección de la Qibla', calendar: 'Calendario islámico', adhkar: 'Adhkar diarios', today: 'Versículo del día', quran: 'Corán', learn: 'Aprende el Corán con Al-Rahma Academy' },
    de: { title: 'Vers des Tages', description: 'Jeden Tag ein ausgewählter Koranvers mit Übersetzung — beginne deinen Tag mit den Worten Allahs.', tools: 'Werkzeuge', prayerTools: 'Gebetswerkzeuge', eyebrow: 'Islamische Werkzeuge', hero: 'Ein sorgfältig ausgewählter Vers für jeden Tag des Monats mit Übersetzung. Beginne deinen Tag mit den Worten Allahs.', loadError: 'Der Vers konnte nicht geladen werden. Prüfe deine Verbindung.', copy: '📋 Kopieren', copied: '✓ Kopiert!', share: '🔗 Teilen', shared: '✓ Geteilt!', whatsapp: 'Über WhatsApp teilen', read: '📖 Ganze Sure lesen', readLabel: 'Im Kontext lesen', hint: '📸 Mache einen Screenshot der Karte und teile ihn auf Instagram oder in WhatsApp-Statusmeldungen', cta: 'Möchtest du lernen, Verse wie diesen mit einem zertifizierten Al-Azhar-Lehrer zu rezitieren?', trial: 'Kostenlose Probestunde buchen →', note: 'Keine Kreditkarte · Jederzeit kündbar', related: 'Verwandte Werkzeuge', also: 'Auch ausprobieren:', prayer: 'Gebetszeiten', qibla: 'Qibla-Richtung', calendar: 'Islamischer Kalender', adhkar: 'Tägliche Adhkar', today: 'Vers des Tages', quran: 'Koran', learn: 'Lerne den Koran mit Al-Rahma Academy' },
    fr: { title: 'Verset du jour', description: 'Un verset du Coran choisi chaque jour avec sa traduction — commencez la journée par les paroles d’Allah.', tools: 'Outils', prayerTools: 'Outils de prière', eyebrow: 'Outils islamiques', hero: 'Un verset soigneusement choisi pour chaque jour du mois, avec sa traduction. Commencez votre journée avec les paroles d’Allah.', loadError: 'Impossible de charger le verset. Vérifiez votre connexion.', copy: '📋 Copier', copied: '✓ Copié !', share: '🔗 Partager', shared: '✓ Partagé !', whatsapp: 'Partager sur WhatsApp', read: '📖 Lire la sourate entière', readLabel: 'Lire dans son contexte', hint: '📸 Faites une capture de la carte pour la partager sur Instagram ou dans les statuts WhatsApp', cta: 'Voulez-vous apprendre à réciter des versets comme celui-ci avec un professeur certifié d’Al-Azhar ?', trial: 'Réserver un cours d’essai gratuit →', note: 'Sans carte bancaire · Annulez à tout moment', related: 'Outils associés', also: 'À découvrir aussi :', prayer: 'Heures de prière', qibla: 'Direction de la Qibla', calendar: 'Calendrier islamique', adhkar: 'Adhkar quotidiens', today: 'Verset du jour', quran: 'Coran', learn: 'Apprenez le Coran avec Al-Rahma Academy' },
  }[lang] || {};

  useSEO({
    title: copy.title,
    description: copy.description,
  });

  const [verse,      setVerse]      = useState(null);
  const [verseError, setVerseError] = useState(false);
  const [copied,     setCopied]     = useState(false);
  const [shared,     setShared]     = useState(false);
  const cardRef = useRef(null);

  const verseKey = DAILY_VERSE_KEYS[(new Date().getDate() - 1) % DAILY_VERSE_KEYS.length];

  useEffect(() => {
    setVerseError(false);
    getVerse(verseKey, 20).then(setVerse).catch(() => setVerseError(true));
  }, [verseKey]);

  const arabic = verse?.text_uthmani || '';
  const trans  = verse?.translations?.[0] ? clean(verse.translations[0].text) : '';
  const [s, v] = verseKey.split(':');

  const handleCopy = async () => {
    const text = `${arabic}\n\n"${trans}"\n— ${copy.quran} ${verseKey}\n\nalrahma.academy`;
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleShare = async () => {
    const url  = `${window.location.origin}/tools/quran-reader#s=${s}&v=${v}`;
    const text = `${copy.today} (${verseKey})\n\n${arabic}\n\n"${trans}"\n\n${copy.learn}`;
    if (navigator.share) {
      try { await navigator.share({ title: `${copy.quran} ${verseKey}`, text, url }); setShared(true); setTimeout(() => setShared(false), 2500); }
      catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`).catch(() => {});
      setShared(true);
      setTimeout(() => setShared(false), 2500);
    }
  };

  const waUrl = `https://wa.me/?text=${encodeURIComponent(`🌿 ${copy.today} (${verseKey})\n\n${arabic}\n\n"${trans}"\n\n📖 ${copy.learn}: ${window.location.origin}`)}`;

  return (
    <>
      <Header />
      <main id="main-content" className="it__main">
        <Breadcrumbs items={[
          { label: copy.tools, to: '/tools' },
          { label: copy.prayerTools, to: '/tools/prayer' },
          { label: copy.title },
        ]} />

        <section className="it__hero">
          <div className="container it__hero-inner">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h1>{copy.title}</h1>
            <p className="it__hero-sub">{copy.hero}</p>
          </div>
        </section>

        <div className="container it__body">
          <div className="it__verse-page">

            {/* ── Shareable verse card ── */}
            <div className="votd-card" ref={cardRef}>
              <p className="votd-card__brand">Al-Rahma Academy · {copy.title}</p>

              <div className="votd-card__divider" aria-hidden="true">
                <span className="votd-card__diamond">◆</span>
              </div>

              {verse ? (
                <>
                  <p className="votd-card__arabic" dir="rtl" lang="ar">
                    {arabic}
                    <span className="votd-card__vnum"> ﴿{v}﴾</span>
                  </p>
                  {trans && (
                    <p className="votd-card__trans">
                      <span className="votd-card__quote">&quot;</span>
                      {trans}
                      <span className="votd-card__quote">&quot;</span>
                    </p>
                  )}
                  <p className="votd-card__ref">{copy.quran} · {verseKey}</p>
                </>
              ) : !verseError ? (
                <div className="it__spin"><div className="it__spinner" /></div>
              ) : (
                <p className="it__empty" style={{ padding: '2rem' }}>
                  {copy.loadError}
                </p>
              )}
            </div>

            {/* ── Share actions ── */}
            {verse && (
              <div className="votd-actions">
                <button
                  className={`votd-btn votd-btn--copy${copied ? ' done' : ''}`}
                  onClick={handleCopy}
                  aria-label={copy.copy}
                >
                  {copied ? copy.copied : copy.copy}
                </button>

                <button
                  className={`votd-btn votd-btn--share${shared ? ' done' : ''}`}
                  onClick={handleShare}
                  aria-label={copy.share}
                >
                  {shared ? copy.shared : copy.share}
                </button>

                <a
                  className="votd-btn votd-btn--wa"
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={copy.whatsapp}
                >
                  💬 WhatsApp
                </a>

                <Link
                  className="votd-btn votd-btn--quran"
                  to={`/tools/quran-reader#s=${s}&v=${v}`}
                  aria-label={copy.readLabel}
                >
                  {copy.read}
                </Link>
              </div>
            )}

            {/* ── Screenshot tip ── */}
            {verse && (
              <p className="votd-hint">
                {copy.hint}
              </p>
            )}

            {/* ── Enrollment CTA ── */}
            <div className="votd-enroll-cta">
              <p className="votd-enroll-cta__text">
                {copy.cta}
              </p>
              <Link to="/enroll" className="btn btn--gold">
                {copy.trial}
              </Link>
              <span className="votd-enroll-cta__note">
                {copy.note}
              </span>
            </div>
          </div>

          <nav className="it__also-try" aria-label={copy.related}>
            <span className="it__also-try__label">{copy.also}</span>
            <Link to="/tools/prayer-times">🕌 {copy.prayer}</Link>
            <Link to="/tools/qibla">🧭 {copy.qibla}</Link>
            <Link to="/tools/islamic-calendar">📅 {copy.calendar}</Link>
            <Link to="/tools/adhkar">📿 {copy.adhkar}</Link>
          </nav>
        </div>
      </main>
      <Footer />
      <WhatsappFab />
    </>
  );
}
