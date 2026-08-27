import { useNavigate } from 'react-router-dom';
import Header from '../../components/layout/Header';
import Footer from '../../components/layout/Footer';
import Breadcrumbs from '../../components/ui/Breadcrumbs';
import WhatsappFab from '../../components/ui/WhatsappFab';
import useSEO from '../../hooks/useSEO';
import AlphabetLearner from '../../components/features/tools/AlphabetLearner';
import { useLang } from '../../context/LangContext';

export default function ArabicAlphabetPage() {
  const navigate = useNavigate();
  const { lang } = useLang();
  const isAr = lang === 'ar';

  useSEO({
    title: isAr ? 'تعلم الحروف العربية' : 'Arabic Alphabet',
    description: isAr
      ? 'تعلم الحروف العربية الـ٢٨ مع النطق الصوتي والتفاعل — مجاناً من أكاديمية الرحمة.'
      : 'Learn the 28 Arabic letters with audio pronunciation and interactive exercises — free from Al-Rahma Academy.',
  });

  return (
    <>
      <Header />
      <main id="main-content">
        <Breadcrumbs
          items={[
            { label: isAr ? 'الأدوات' : 'Tools', to: '/tools' },
            { label: isAr ? 'الحروف العربية' : 'Arabic Alphabet' },
          ]}
        />

        <section className="hub-hero">
          <div className="container hub-hero__inner">
            <span className="eyebrow">{isAr ? 'تعلم العربية' : 'Learn Arabic'}</span>
            <h1>{isAr ? 'الأبجدية العربية' : 'Arabic Alphabet'}</h1>
            <p className="hub-hero__sub">
              {isAr
                ? 'تعلم الحروف العربية الـ٢٨ مع النطق الصحيح، التدريب على الميكروفون، وأصوات القراءة.'
                : 'Learn all 28 Arabic letters with correct pronunciation, mic practice, and full alphabet recordings.'}
            </p>
          </div>
        </section>

        <div className="container qlc__alphabet-wrap" style={{ paddingBottom: '4rem' }}>
          <AlphabetLearner onClose={() => navigate('/tools')} />
        </div>
      </main>
      <Footer />
      <WhatsappFab />
    </>
  );
}
