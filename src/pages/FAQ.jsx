import { useState } from 'react';
import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import useSEO from '../hooks/useSEO';

const faqs = [
  {
    q: 'Do you offer free trial Quran lessons?',
    a: 'Yes. Al-Rahma Academy offers 2 completely free trial classes with no payment or commitment required. Book directly from our website by filling in the free trial form on the home page.',
  },
  {
    q: 'Are female Quran tutors available?',
    a: 'Yes. We have a dedicated team of certified female tutors available for sisters and children. Simply indicate your preference when filling in the booking form and we will match you accordingly.',
  },
  {
    q: 'Can complete beginners with no Arabic background join?',
    a: 'Absolutely. Our Noorani Qaida programme starts from the very first Arabic letter. No prior knowledge of Arabic is needed. We welcome students of all levels, from young children to adults.',
  },
  {
    q: 'Which platforms are used for the online lessons?',
    a: 'All lessons are delivered live via Zoom or Skype. Every class is one-to-one between the student and the tutor — not group sessions — giving full individual attention.',
  },
  {
    q: 'Are your tutors certified from Al-Azhar?',
    a: 'Yes. All our tutors are graduates of Al-Azhar University in Egypt and hold a verified Ijazah certificate with a chain of narration traced back to the Prophet (peace be upon him). Every tutor goes through a quality check before teaching.',
  },
  {
    q: 'Can lessons be conducted in Italian or French?',
    a: 'Yes. Our tutors can deliver lessons in English, Italian or French to ensure maximum understanding for European students. Simply mention your preferred language when booking.',
  },
  {
    q: 'How much do the monthly plans cost?',
    a: 'Plans start from €56 per month for 2 classes per week (Starter). The Standard plan offers 3 classes per week for €84/month, and the Premium plan offers 4 classes per week for €112/month. All plans include one-to-one tutoring.',
  },
  {
    q: 'Do you teach students across Europe?',
    a: 'Yes. Al-Rahma Academy serves Muslim communities across Europe including Italy, France, the UK, Germany, Belgium and beyond. All lessons are online so there are no geographical restrictions.',
  },
  {
    q: 'Can children and adults get an Ijazah certificate?',
    a: 'Yes. We offer a structured Ijazah pathway for students who reach the required level. This is available for both children and adults and results in a formal certificate with a verified chain of narration.',
  },
  {
    q: 'What courses do you offer?',
    a: 'We offer: Quran Reading (Noorani Qaida), Recitation with Tajweed, Quran Memorization (Hifz), Ijazah Certification, Islamic Studies, and Arabic Language. All courses are available one-to-one for all ages.',
  },
  {
    q: 'How do I book a free trial?',
    a: 'Simply go to the home page and fill in the free trial form. Tell us about the student, the preferred course, and your available times. We will match you with a tutor and confirm your session within 24 hours.',
  },
  {
    q: 'Is there a long-term contract?',
    a: 'No. There is no long-term contract. You can cancel or change your plan at any time. We believe in earning your commitment through the quality of our teaching, not through lock-in clauses.',
  },
];

export default function FAQ() {
  useSEO({ title: 'Frequently Asked Questions', description: 'Everything you need to know about AL-Rahma Academy — pricing, scheduling, teaching methods, and how to get started.' });
  const [open, setOpen] = useState(null);

  return (
    <div className="faq-page">
      <header className="quran__bar">
        <div className="container quran__bar-inner">
          <Brand />
          <Link to="/" className="btn btn--ghost btn--sm">Back to site</Link>
        </div>
      </header>

      <main className="container faq-page__main">
        <div className="faq-page__header">
          <p className="eyebrow">Got questions?</p>
          <h1>Frequently Asked Questions</h1>
          <p className="faq-page__sub">Everything you need to know about Al-Rahma Academy and our online Quran courses.</p>
        </div>

        <div className="faq-list">
          {faqs.map((item, i) => (
            <div
              key={i}
              className={open === i ? 'faq-item faq-item--open' : 'faq-item'}
            >
              <button
                className="faq-item__q"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
              >
                <span>{item.q}</span>
                <span className="faq-item__icon">{open === i ? '−' : '+'}</span>
              </button>
              {open === i && (
                <div className="faq-item__a">
                  <p>{item.a}</p>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="faq-cta">
          <p>Still have a question?</p>
          <a href="/#trial" className="btn btn--green">Book a Free Trial</a>
          <a
            href="https://wa.me/201016054663"
            className="btn btn--ghost"
            target="_blank"
            rel="noopener noreferrer"
          >
            WhatsApp Us
          </a>
        </div>
      </main>
    </div>
  );
}
