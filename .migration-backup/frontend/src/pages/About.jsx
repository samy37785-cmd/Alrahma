import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import About from '../components/features/marketing/About';
import useSEO from '../hooks/useSEO';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { useLang } from '../context/LangContext';

export default function AboutPage() {
  const { t } = useLang();
  useSEO({ title: t.about.eyebrow, description: t.about.description });

  return (
    <>
      <Header />
      <main className="about-page" id="main-content">
        <Breadcrumbs items={[{ label: 'Academy', to: '/academy' }, { label: t.about.eyebrow }]} />
        <About />
      </main>
      <Footer />
    </>
  );
}
