import '../styles/trust-engage.css';
import { TrialProvider } from '../context/TrialContext';
import { QuickTrialProvider, useQuickTrial } from '../context/QuickTrialContext';
import { useLang } from '../context/LangContext';
import useSEO from '../hooks/useSEO';
import { buildFaqPageSchema } from '../utils/schema';
import TopBar from '../components/layout/TopBar';
import Header from '../components/layout/Header';
import Hero from '../components/features/marketing/Hero';
import TrustBar from '../components/features/marketing/TrustBar';
import LevelQuiz from '../components/features/marketing/LevelQuiz';
import Features from '../components/features/marketing/Features';
import Steps from '../components/features/marketing/Steps';
import Tutors from '../components/features/marketing/Tutors';
import IsnadChain from '../components/features/marketing/IsnadChain';
import Courses from '../components/features/marketing/Courses';
import JoinCTA from '../components/features/marketing/JoinCTA';
import Pricing from '../components/features/marketing/Pricing';
import FAQ from '../components/features/marketing/FAQ';
import Trial from '../components/features/marketing/Trial';
import Newsletter from '../components/features/marketing/Newsletter';
import TrustBadges from '../components/features/marketing/TrustBadges';
import Footer from '../components/layout/Footer';
import DeferredSection from '../components/ui/DeferredSection';
import WhatsappFab from '../components/ui/WhatsappFab';
import ExitIntentPopup from '../components/ui/ExitIntentPopup';
import { pickHomeSeo } from '../i18n/home/seo';

// App.jsx provides the site-wide quick-trial form; a Home rendered on its own
// (tests) brings its own, so the hero button always has a form to open.
export default function Home() {
  return useQuickTrial() ? <HomePage /> : <QuickTrialProvider><HomePage /></QuickTrialProvider>;
}

function HomePage() {
  const { openQuickTrial } = useQuickTrial();
  const { t, lang } = useLang();
  const seo = pickHomeSeo(lang);
  useSEO({
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    // Built from the same t.faq.items array <FAQ /> renders below, so this
    // can never drift from the actual visible questions/answers again.
    schema: buildFaqPageSchema(t.faq.items),
  });
  return (
    <TrialProvider>
      <TopBar />
      <Header />
      <main id="main-content">
        <Hero onTrialClick={() => openQuickTrial()} />
        <TrustBar />
        <LevelQuiz />
        {/* Below-the-fold: deferred until they're about to scroll into view
            (see DeferredSection) so first render doesn't pay to mount all
            ~16 sections of the landing page at once. */}
        <DeferredSection><Courses /></DeferredSection>
        <DeferredSection><Features /></DeferredSection>
        <DeferredSection><Steps /></DeferredSection>
        <DeferredSection><Tutors /></DeferredSection>
        <DeferredSection><IsnadChain /></DeferredSection>
        <DeferredSection><TrustBadges /></DeferredSection>
        <DeferredSection><Pricing /></DeferredSection>
        <DeferredSection><JoinCTA onTrialClick={() => openQuickTrial()} /></DeferredSection>
        <DeferredSection><FAQ /></DeferredSection>
        <DeferredSection><Trial /></DeferredSection>
        <DeferredSection><Newsletter /></DeferredSection>
      </main>
      <Footer />
      <WhatsappFab />

      {/* Conversion layer (the quick-trial form itself: QuickTrialProvider) */}
      <ExitIntentPopup />
    </TrialProvider>
  );
}
