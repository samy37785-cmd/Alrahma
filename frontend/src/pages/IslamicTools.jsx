import { Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import WhatsappFab from '../components/ui/WhatsappFab';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';
import { TOOLS_TEXT, pick } from '../i18n/content';
import '../styles/islamic-tools.css';

const PRAYER_TOOL_CARDS = [
  {
    icon: '🕌',
    to: '/tools/prayer-times',
    titleEn: 'Prayer Times',
    titleAr: 'مواقيت الصلاة',
    descEn: 'Accurate prayer times for your location with live countdown, prayer alerts, and a full monthly timetable.',
    descAr: 'مواقيت صلاة دقيقة لموقعك مع عداد تنازلي مباشر، ومنبه الصلاة، وجدول شهري كامل.',
  },
  {
    icon: '🧭',
    to: '/tools/qibla',
    titleEn: 'Qibla Direction',
    titleAr: 'اتجاه القبلة',
    descEn: 'Find the Qibla direction from anywhere in the world with bearing degrees and a live compass for mobile.',
    descAr: 'اعرف اتجاه القبلة من أي مكان في العالم بالدرجات والمسافة، مع بوصلة حية على الهاتف.',
  },
  {
    icon: '📅',
    to: '/tools/islamic-calendar',
    titleEn: 'Islamic Calendar',
    titleAr: 'التقويم الإسلامي',
    descEn: "Today's Hijri date with countdowns to Ramadan, Eid al-Fitr, Eid al-Adha, and a full Hijri months reference.",
    descAr: 'التاريخ الهجري لليوم مع العد التنازلي لرمضان والعيدين، ومرجع أشهر السنة الهجرية.',
  },
  {
    icon: '🌟',
    to: '/tools/verse-of-the-day',
    titleEn: 'Verse of the Day',
    titleAr: 'آية اليوم',
    descEn: 'A handpicked Quran verse for each day of the month with English translation.',
    descAr: 'آية قرآنية مختارة لكل يوم من أيام الشهر مع ترجمتها بالإنجليزية.',
  },
];

export default function IslamicTools() {
  const { lang } = useLang();
  const tx = pick(TOOLS_TEXT, lang);
  const isAr = lang === 'ar';

  useSEO({
    title: isAr ? 'أدوات الصلاة الإسلامية' : 'Prayer & Islamic Tools',
    description: isAr
      ? 'مواقيت الصلاة، اتجاه القبلة، التقويم الهجري، وآية اليوم — أدوات إسلامية مجانية من أكاديمية الرحمة.'
      : 'Prayer times, Qibla direction, Islamic calendar, and Verse of the Day — free Islamic tools from Al-Rahma Academy.',
  });

  return (
    <>
      <Header />
      <main id="main-content">
        <Breadcrumbs items={[
          { label: isAr ? 'الأدوات' : 'Tools', to: '/tools' },
          { label: isAr ? 'أدوات الصلاة' : 'Prayer Tools' },
        ]} />

        <section className="it__hero">
          <div className="container it__hero-inner">
            <p className="eyebrow">{tx.eyebrow}</p>
            <h1>{isAr ? 'أدوات الصلاة الإسلامية' : 'Prayer & Islamic Tools'}</h1>
            <p className="it__hero-sub">
              {isAr
                ? 'أربع أدوات إسلامية مجانية لمساعدتك على العبادة أينما كنت — مواقيت الصلاة، القبلة، التقويم الهجري، وآية اليوم.'
                : 'Four free Islamic tools to help you worship wherever you are — prayer times, Qibla, Islamic calendar, and Verse of the Day.'}
            </p>
          </div>
        </section>

        <section className="hub-cards section">
          <div className="container">
            <div className="hub-cards__grid hub-cards__grid--4">
              {PRAYER_TOOL_CARDS.map((card) => (
                <Link key={card.to} to={card.to} className="hub-card">
                  <span className="hub-card__icon">{card.icon}</span>
                  <h3 className="hub-card__title">{isAr ? card.titleAr : card.titleEn}</h3>
                  <p className="hub-card__desc">{isAr ? card.descAr : card.descEn}</p>
                  <span className="hub-card__link">{isAr ? 'افتح ←' : 'Open →'}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </main>
      <Footer />
      <WhatsappFab />
    </>
  );
}
