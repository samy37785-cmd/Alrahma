import '../../styles/tasbeeh.css';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import WhatsappFab from '../../components/ui/WhatsappFab';
import useSEO from '../../hooks/useSEO';
import Tasbeeh from '../../components/features/tools/Tasbeeh';
import { useLang } from '../../context/LangContext';
import { TASBEEH_TEXT } from '../../i18n/tools/tasbeeh';

export default function TasbeehPage() {
  const { lang } = useLang();
  const t = TASBEEH_TEXT[lang] || TASBEEH_TEXT.en;

  useSEO({ title: t.seo.title, description: t.seo.description });

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
            <span className="eyebrow">{t.eyebrow}</span>
            <h1>{t.hero.title}</h1>
            <p className="hub-hero__sub">{t.hero.sub}</p>
          </div>
        </section>

        <div className="container" style={{ paddingBottom: '4rem' }}>
          <Tasbeeh />
        </div>
      </main>
      <Footer />
      <WhatsappFab />
    </>
  );
}
