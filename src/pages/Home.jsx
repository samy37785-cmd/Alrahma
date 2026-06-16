import { TrialProvider } from '../context/TrialContext';
import useSEO from '../hooks/useSEO';
import TopBar from '../components/layout/TopBar';
import Header from '../components/layout/Header';
import Hero from '../components/Hero';
import StatsBanner from '../components/StatsBanner';
import Features from '../components/Features';
import Steps from '../components/Steps';
import Tutors from '../components/Tutors';
import Courses from '../components/Courses';
import About from '../components/About';
import JoinCTA from '../components/JoinCTA';
import Pricing from '../components/Pricing';
import Testimonials from '../components/Testimonials';
import FAQ from '../components/FAQ';
import Trial from '../components/Trial';
import Newsletter from '../components/Newsletter';
import Footer from '../components/layout/Footer';
import WhatsappFab from '../components/ui/WhatsappFab';

export default function Home() {
  useSEO({
    title: 'Learn the Holy Quran Online',
    description: 'Join AL-Rahma Academy and learn to read the Quran with Tajweed from certified teachers. Flexible online classes for all ages. Book a free trial today.',
  });
  return (
    <TrialProvider>
      <TopBar />
      <Header />
      <main>
        <Hero />
        <StatsBanner />
        <Features />
        <Steps />
        <Tutors />
        <Courses />
        <JoinCTA />
        <About />
        <Pricing />
        <Testimonials />
        <FAQ />
        <Trial />
        <Newsletter />
      </main>
      <Footer />
      <WhatsappFab />
    </TrialProvider>
  );
}
