import '../../styles/tasbeeh.css';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import WhatsappFab from '../../components/ui/WhatsappFab';
import useSEO from '../../hooks/useSEO';
import Tasbeeh from '../../components/features/tools/Tasbeeh';
import { useLang } from '../../context/LangContext';

export default function TasbeehPage() {
  const { lang } = useLang();
  const isAr = lang === 'ar';

  useSEO({
    title: isAr ? 'مسبحة رقمية' : 'Tasbeeh Counter',
    description: isAr
      ? 'مسبحة رقمية مجانية: سبحان الله، الحمد لله، الله أكبر، لا إله إلا الله. تتبع أذكارك اليومية.'
      : 'Free digital tasbeeh counter. Count SubhanAllah, Alhamdulillah, AllahuAkbar and more with progress tracking.',
  });

  return (
    <>
      <Header />
      <main id="main-content">
        <Breadcrumbs
          items={[
            { label: isAr ? 'الأدوات' : 'Tools', to: '/tools' },
            { label: isAr ? 'المسبحة' : 'Tasbeeh Counter' },
          ]}
        />

        <section className="hub-hero">
          <div className="container hub-hero__inner">
            <span className="eyebrow">{isAr ? 'الأذكار' : 'Dhikr'}</span>
            <h1>{isAr ? 'المسبحة الرقمية' : 'Digital Tasbeeh Counter'}</h1>
            <p className="hub-hero__sub">
              {isAr
                ? 'عدّد أذكارك بسهولة — سبحان الله، الحمد لله، الله أكبر، وغيرها.'
                : 'Count your dhikr digitally — SubhanAllah, Alhamdulillah, AllahuAkbar and more.'}
            </p>
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
