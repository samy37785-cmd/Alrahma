import { TrialProvider } from '../context/TrialContext';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';
import TopBar from '../components/layout/TopBar';
import Header from '../components/layout/Header';
import Hero from '../components/Hero';
import StatsBanner from '../components/StatsBanner';
import Features from '../components/Features';
import Steps from '../components/Steps';
import Tutors from '../components/Tutors';
import Courses from '../components/Courses';
import JoinCTA from '../components/JoinCTA';
import Pricing from '../components/Pricing';
import Testimonials from '../components/Testimonials';
import FAQ from '../components/FAQ';
import Trial from '../components/Trial';
import Newsletter from '../components/Newsletter';
import Footer from '../components/layout/Footer';
import WhatsappFab from '../components/ui/WhatsappFab';

export default function Home() {
  const { t } = useLang();
  useSEO({ title: t.tagline, description: t.hero.sub });
  return (
    <TrialProvider>
      <TopBar />
      <Header />
      <main id="main-content">
        <Hero />
        <StatsBanner />
        <Courses />
        <Features />
        <Steps />
        <Tutors />
        <Testimonials />
        <Pricing />
        <JoinCTA />
        <FAQ />
        <Trial />
        <Newsletter />
      </main>
      <Footer />
      <WhatsappFab />
    </TrialProvider>
  );
}
