import { useState } from 'react';
import { TrialProvider } from '../context/TrialContext';
import useSEO from '../hooks/useSEO';
import { useLang } from '../context/LangContext';
import TopBar from '../components/layout/TopBar';
import Header from '../components/layout/Header';
import Hero from '../components/Hero';
import TrustBar from '../components/TrustBar';
import LevelQuiz from '../components/LevelQuiz';
import StatsBanner from '../components/StatsBanner';
import Features from '../components/Features';
import Steps from '../components/Steps';
import Tutors from '../components/Tutors';
import IsnadChain from '../components/IsnadChain';
import Courses from '../components/Courses';
import JoinCTA from '../components/JoinCTA';
import Pricing from '../components/Pricing';
import Testimonials from '../components/Testimonials';
import FAQ from '../components/FAQ';
import Trial from '../components/Trial';
import Newsletter from '../components/Newsletter';
import TrustBadges from '../components/TrustBadges';
import Footer from '../components/layout/Footer';
import WhatsappFab from '../components/ui/WhatsappFab';
import QuickTrialModal from '../components/ui/QuickTrialModal';
import ExitIntentPopup from '../components/ui/ExitIntentPopup';

export default function Home() {
  const { t } = useLang();
  const [trialOpen, setTrialOpen] = useState(false);
  useSEO({
    title: 'Learn the Quran Online — Al-Rahma Academy',
    description: 'One-to-one online Quran, Tajweed and Arabic lessons with Al-Azhar certified tutors. Available 24/7 in English, Italian, French, German and Spanish. 2 free trial lessons — no payment needed. Trusted by 1,200+ families across Europe.',
    keywords: 'learn quran online, online quran classes, quran tutor, tajweed lessons, al-azhar tutor, online islamic studies, quran for children, hifz online',
    schema: {
      '@context': 'https://schema.org',
      '@type': 'EducationalOrganization',
      name: 'Al-Rahma Academy',
      description: 'Online Quran and Islamic education platform with Al-Azhar certified tutors.',
      url: 'https://al-rahmaacademy.com',
      sameAs: ['https://facebook.com/alrahmaacademy', 'https://instagram.com/alrahmaacademy'],
      offers: { '@type': 'Offer', description: '2 free trial lessons, then monthly subscription from €39/month', priceCurrency: 'EUR' },
    },
  });
  return (
    <TrialProvider>
      <TopBar />
      <Header />
      <main id="main-content">
        <Hero onTrialClick={() => setTrialOpen(true)} />
        <TrustBar />
        <LevelQuiz />
        <StatsBanner />
        <Courses />
        <Features />
        <Steps />
        <Tutors />
        <IsnadChain />
        <Testimonials />
        <TrustBadges />
        <Pricing />
        <JoinCTA onTrialClick={() => setTrialOpen(true)} />
        <FAQ />
        <Trial />
        <Newsletter />
      </main>
      <Footer />
      <WhatsappFab />

      {/* Conversion layer */}
      <QuickTrialModal open={trialOpen} onClose={() => setTrialOpen(false)} />
      <ExitIntentPopup />
    </TrialProvider>
  );
}
