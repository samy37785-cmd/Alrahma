import { TrialProvider } from '../context/TrialContext';
import useSEO from '../hooks/useSEO';
import TopBar from '../components/layout/TopBar';
import Header from '../components/layout/Header';
import Hero from '../components/Hero';
import Features from '../components/Features';
import Steps from '../components/Steps';
import Courses from '../components/Courses';
import About from '../components/About';
import Pricing from '../components/Pricing';
import Testimonials from '../components/Testimonials';
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
        <Features />
        <Steps />
        <Courses />
        <About />
        <Pricing />
        <Testimonials />
        <Trial />
        <Newsletter />
      </main>
      <Footer />
      <WhatsappFab />
    </TrialProvider>
  );
}
