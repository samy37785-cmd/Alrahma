import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import CheckoutModal from '../components/ui/CheckoutModal';
import useSEO from '../hooks/useSEO';
import { submitEnrollment } from '../api/enrollmentApi';
import { TEACHERS } from '../data';
import { useLang } from '../context/LangContext';
import { PLAN_TEXT } from '../i18n/content';
import { Progress, Step1, Step2, Step3, Step4, Success } from '../components/features/enrollment/EnrollWizard';

const BLANK = {
  name:'', email:'', whatsapp:'', country:'', city:'',
  times:[], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  subjects:[], lang:'en', level:'beginner', ageGroup:'adult', genderPref:'any',
  teacherId:null, teacherName:'',
  plan: null,
};


export default function Enroll() {
  useSEO({
    title: 'Book Free Trial Lessons — Enroll at Al-Rahma Academy',
    description: '2 free one-to-one Quran lessons — no payment, no commitment. Choose your subjects, pick an Al-Azhar certified tutor, and start learning today. 14-day money-back guarantee on all plans.',
    keywords: 'free quran trial lesson, online quran enrollment, book quran lesson, quran class booking',
  });

  const { t } = useLang();
  const e = t.enroll;
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => {
    const tid = Number(searchParams.get('teacher'));
    const found = tid ? TEACHERS.find((t) => t.id === tid) : null;
    return {
      ...BLANK,
      ...(found ? { teacherId: found.id, teacherName: found.nameEn } : {}),
    };
  });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [checkoutPlan, setCheckoutPlan] = useState(null);

  const set = (key, valOrFn) =>
    setForm((prev) => ({
      ...prev,
      [key]: typeof valOrFn === 'function' ? valOrFn(prev[key]) : valOrFn,
    }));

  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PHONE_RE = /^\+?[\d\s\-(). ]{7,20}$/;

  const validate = () => {
    const v = e.validation;
    if (step === 1) {
      if (!form.name.trim()) { setError(v.nameRequired); return false; }
      if (!form.email.trim()) { setError(v.emailRequired); return false; }
      if (!EMAIL_RE.test(form.email.trim())) { setError(v.emailInvalid); return false; }
      if (form.whatsapp && !PHONE_RE.test(form.whatsapp.trim())) {
        setError(v.phoneInvalid); return false;
      }
    }
    if (step === 2 && form.subjects.length === 0) {
      setError(v.subjectRequired); return false;
    }
    if (step === 3 && !form.teacherId) {
      setError(v.teacherRequired); return false;
    }
    setError(''); return true;
  };

  const next = () => { if (validate()) setStep((s) => Math.min(s + 1, 4)); };
  const back = () => { setError(''); setStep((s) => Math.max(s - 1, 1)); };

  const handlePayNow = async () => {
    if (!form.plan) return;
    setLoading(true);
    try {
      await submitEnrollment({ ...form, plan: form.plan.name });
      setCheckoutPlan(form.plan);
    } catch {
      setError(e.validation.submitFailed);
    } finally {
      setLoading(false);
    }
  };

  const handleCheckoutClose = () => {
    setCheckoutPlan(null);
    setDone(true);
  };

  return (
    <>
      <Header />
      <main id="main-content" className="enroll__page">
        <div className="enroll__container">
          {done ? (
            <Success name={form.name} />
          ) : (
            <>
              {/* ── Emotional header ── */}
              <div className="enroll__header">
                <p className="eyebrow" style={{ color: 'var(--gold)' }}>{e.eyebrow}</p>
                <h1>{e.heading}</h1>
                <p className="enroll__tagline">{e.tagline}</p>
              </div>

              {/* ── Social proof quote strip ── */}
              <div className="enroll__trust-strip">
                <div className="enroll__trust-quote">
                  <span className="enroll__trust-quote-mark">&quot;</span>
                  <p>My daughter completed her first Surah in just 3 weeks. I&apos;ve never seen her so proud of herself.</p>
                  <footer>— Fatima K., Manchester</footer>
                </div>
                <div className="enroll__trust-stats">
                  <div className="enroll__trust-stat"><strong>500+</strong><span>Families enrolled</span></div>
                  <div className="enroll__trust-stat"><strong>40+</strong><span>Countries</span></div>
                  <div className="enroll__trust-stat"><strong>4.9★</strong><span>Avg. rating</span></div>
                </div>
              </div>

              <Progress step={step} />

              <div className="enroll__card">
                {step === 1 && <Step1 form={form} set={set} />}
                {step === 2 && <Step2 form={form} set={set} />}
                {step === 3 && <Step3 form={form} set={set} />}
                {step === 4 && <Step4 form={form} set={set} onPayNow={handlePayNow} />}

                {error && <p className="enroll__error">{error}</p>}

                <div className="enroll__nav">
                  {step > 1 && (
                    <button type="button" className="btn btn--ghost" onClick={back}>{e.nav.back}</button>
                  )}
                  {step < 4 && (
                    <button type="button" className="btn btn--green" onClick={next} disabled={loading}>
                      {e.nav.continue}
                    </button>
                  )}
                  {loading && <span className="enroll__spinner">{e.nav.submitting}</span>}
                </div>
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />

      <CheckoutModal plan={checkoutPlan} onClose={handleCheckoutClose} />
    </>
  );
}
