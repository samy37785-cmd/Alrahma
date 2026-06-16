import { useState } from 'react';
import Reveal from './ui/Reveal';

const FAQS = [
  {
    q: 'Do I need any prior knowledge to start?',
    a: 'No — absolute beginners are very welcome. We start from the Arabic alphabet (Noorani Qaida) and build from there. Our tutors are experienced in teaching students of all ages and levels.',
  },
  {
    q: 'How does the free trial work?',
    a: 'You fill in the trial form and we match you with a suitable tutor within 24 hours. You get 2 full one-to-one sessions completely free — no payment, no commitment. After the trial you decide if you want to continue.',
  },
  {
    q: 'What platform do you use for lessons?',
    a: 'Lessons are held over Zoom or Skype. Both are free to download and work on any device — desktop, tablet or phone. We can guide you through the setup before your first lesson.',
  },
  {
    q: 'Can I choose a female tutor for my daughter?',
    a: 'Absolutely. We have qualified female tutors available specifically for sisters and children. Just mention this when you fill in the trial form and we will match accordingly.',
  },
  {
    q: 'What if I need to reschedule a lesson?',
    a: 'Flexibility is one of our core values. You can reschedule any lesson with reasonable notice (ideally 24 hours) and we will find a new time that suits you — any day, any time zone.',
  },
  {
    q: 'Do you offer Ijazah certification?',
    a: 'Yes. We have a dedicated Ijazah course for students who wish to receive a formal certification with a connected chain (sanad) back to the Prophet ﷺ. Speak to us about the requirements after the free trial.',
  },
];

export default function FAQ() {
  const [open, setOpen] = useState(null);

  return (
    <section className="faq" id="faq">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">FAQ</p>
          <h2>Frequently Asked Questions</h2>
          <p className="section-sub">Everything you need to know before getting started.</p>
        </Reveal>

        <div className="faq__list">
          {FAQS.map((item, i) => (
            <Reveal className={`faq__item${open === i ? ' faq__item--open' : ''}`} key={i}>
              <button
                className="faq__question"
                onClick={() => setOpen(open === i ? null : i)}
                aria-expanded={open === i}
              >
                <span>{item.q}</span>
                <span className="faq__icon">{open === i ? '−' : '+'}</span>
              </button>
              {open === i && (
                <div className="faq__answer">
                  <p>{item.a}</p>
                </div>
              )}
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
