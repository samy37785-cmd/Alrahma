import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import About from '../components/About';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';

export default function AboutPage() {
  const { t } = useLang();
  useSEO({ title: t.about.eyebrow, description: t.about.description });

  return (
    <>
      <Header />
      <main className="about-page" id="main-content">
        <About />
      </main>
      <Footer />
    </>
  );
}
