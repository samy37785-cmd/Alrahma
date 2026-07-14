import { useState } from 'react';
import '../styles/trust-engage.css';
import { TrialProvider } from '../context/TrialContext';
import useSEO from '../hooks/useSEO';
import TopBar from '../components/layout/TopBar';
import Header from '../components/layout/Header';
import Hero from '../components/features/marketing/Hero';
import TrustBar from '../components/features/marketing/TrustBar';
import LevelQuiz from '../components/features/marketing/LevelQuiz';
import StatsBanner from '../components/features/marketing/StatsBanner';
import Features from '../components/features/marketing/Features';
import Steps from '../components/features/marketing/Steps';
import Tutors from '../components/features/marketing/Tutors';
import IsnadChain from '../components/features/marketing/IsnadChain';
import Courses from '../components/features/marketing/Courses';
import JoinCTA from '../components/features/marketing/JoinCTA';
import Pricing from '../components/features/marketing/Pricing';
import Testimonials from '../components/features/marketing/Testimonials';
import FAQ from '../components/features/marketing/FAQ';
import Trial from '../components/features/marketing/Trial';
import Newsletter from '../components/features/marketing/Newsletter';
import TrustBadges from '../components/features/marketing/TrustBadges';
import Footer from '../components/layout/Footer';
import DeferredSection from '../components/ui/DeferredSection';
import WhatsappFab from '../components/ui/WhatsappFab';
import QuickTrialModal from '../components/ui/QuickTrialModal';
import ExitIntentPopup from '../components/ui/ExitIntentPopup';

export default function Home() {
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
        {/* Below-the-fold: deferred until they're about to scroll into view
            (see DeferredSection) so first render doesn't pay to mount all
            ~16 sections of the landing page at once. */}
        <DeferredSection><Courses /></DeferredSection>
        <DeferredSection><Features /></DeferredSection>
        <DeferredSection><Steps /></DeferredSection>
        <DeferredSection><Tutors /></DeferredSection>
        <DeferredSection><IsnadChain /></DeferredSection>
        <DeferredSection><Testimonials /></DeferredSection>
        <DeferredSection><TrustBadges /></DeferredSection>
        <DeferredSection><Pricing /></DeferredSection>
        <DeferredSection><JoinCTA onTrialClick={() => setTrialOpen(true)} /></DeferredSection>
        <DeferredSection><FAQ /></DeferredSection>
        <DeferredSection><Trial /></DeferredSection>
        <DeferredSection><Newsletter /></DeferredSection>
      </main>
      <Footer />
      <WhatsappFab />

      {/* Conversion layer */}
      <QuickTrialModal open={trialOpen} onClose={() => setTrialOpen(false)} />
      <ExitIntentPopup />
    </TrialProvider>
  );
}
