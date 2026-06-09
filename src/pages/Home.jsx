import { TrialProvider } from '../context/TrialContext';
import TopBar from '../components/TopBar';
import Header from '../components/Header';
import Hero from '../components/Hero';
import Features from '../components/Features';
import Steps from '../components/Steps';
import Courses from '../components/Courses';
import About from '../components/About';
import Pricing from '../components/Pricing';
import Testimonials from '../components/Testimonials';
import Trial from '../components/Trial';
import Newsletter from '../components/Newsletter';
import Footer from '../components/Footer';
import WhatsappFab from '../components/WhatsappFab';

export default function Home() {
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
