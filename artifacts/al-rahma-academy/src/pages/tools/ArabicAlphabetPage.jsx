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
  const copy = {
    en: { title: 'Arabic Alphabet', description: 'Learn the 28 Arabic letters with audio pronunciation and interactive exercises — free from Al-Rahma Academy.', tools: 'Tools', eyebrow: 'Learn Arabic', hero: 'Learn all 28 Arabic letters with correct pronunciation, mic practice, and full alphabet recordings.' },
    ar: { title: 'الأبجدية العربية', description: 'تعلّم الحروف العربية الـ٢٨ مع النطق الصوتي والتدريبات التفاعلية — مجاناً من أكاديمية الرحمة.', tools: 'الأدوات', eyebrow: 'تعلّم العربية', hero: 'تعلّم الحروف العربية الـ٢٨ مع النطق الصحيح، والتدريب بالميكروفون، وتسجيلات الأبجدية كاملة.' },
    it: { title: 'Alfabeto arabo', description: 'Impara le 28 lettere arabe con pronuncia audio ed esercizi interattivi — gratis con Al-Rahma Academy.', tools: 'Strumenti', eyebrow: 'Impara l’arabo', hero: 'Impara tutte le 28 lettere arabe con la pronuncia corretta, esercizi al microfono e registrazioni dell’alfabeto completo.' },
    es: { title: 'Alfabeto árabe', description: 'Aprende las 28 letras árabes con pronunciación en audio y ejercicios interactivos — gratis con Al-Rahma Academy.', tools: 'Herramientas', eyebrow: 'Aprende árabe', hero: 'Aprende las 28 letras árabes con la pronunciación correcta, práctica con micrófono y grabaciones del alfabeto completo.' },
    de: { title: 'Arabisches Alphabet', description: 'Lerne die 28 arabischen Buchstaben mit Audioaussprache und interaktiven Übungen — kostenlos bei der Al-Rahma Academy.', tools: 'Werkzeuge', eyebrow: 'Arabisch lernen', hero: 'Lerne alle 28 arabischen Buchstaben mit korrekter Aussprache, Mikrofonübungen und vollständigen Alphabetaufnahmen.' },
    fr: { title: 'Alphabet arabe', description: 'Apprenez les 28 lettres arabes avec leur prononciation audio et des exercices interactifs — gratuitement avec Al-Rahma Academy.', tools: 'Outils', eyebrow: 'Apprendre l’arabe', hero: 'Apprenez les 28 lettres arabes avec une prononciation correcte, des exercices au microphone et les enregistrements de l’alphabet complet.' },
  }[lang] || {};

  useSEO({
    title: copy.title,
    description: copy.description,
  });

  return (
    <>
      <Header />
      <main id="main-content">
        <Breadcrumbs
          items={[
            { label: copy.tools, to: '/tools' },
            { label: copy.title },
          ]}
        />

        <section className="hub-hero">
          <div className="container hub-hero__inner">
            <span className="eyebrow">{copy.eyebrow}</span>
            <h1>{copy.title}</h1>
            <p className="hub-hero__sub">{copy.hero}</p>
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
