import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import About from '../components/features/marketing/About';
import useSEO from '../hooks/useSEO';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useLang } from '../context/LangContext';
import { pickItMetaDescription } from '../i18n/itMetaDescriptions';

export default function AboutPage() {
  const { t, lang } = useLang();
  useSEO({ title: t.about.eyebrow, description: pickItMetaDescription('about', lang, t.about.description) });

  return (
    <>
      <Header />
      <main className="about-page" id="main-content">
        <Breadcrumbs items={[{ label: t.nav.academy, to: '/academy' }, { label: t.about.eyebrow }]} />
        <About />
      </main>
      <Footer />
    </>
  );
}
