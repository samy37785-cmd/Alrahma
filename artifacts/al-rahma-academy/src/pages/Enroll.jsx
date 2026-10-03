import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import useSEO from '../hooks/useSEO';
import { submitEnrollment } from '../api/enrollmentApi';
import { TEACHERS, plans } from '../data';
import { useLang } from '../context/LangContext';
import { PLAN_TEXT } from '../i18n/content';
import { pickEnrollSeo } from '../i18n/enroll/seo';
import { Progress, Step1, Step2, Step3, Step4, Success } from '../components/features/enrollment/EnrollWizard';
import { trackEvent } from '../analytics/ga';

const BLANK = {
  name:'', email:'', whatsapp:'', country:'', city:'',
  // Starts empty: the visitor's timezone is resolved after mount (see the effect
  // in Enroll), never at module load, so the prerendered HTML never freezes the
  // build machine's timezone.
  times:[], timezone: '',
  subjects:[], lang:'en', level:'beginner', ageGroup:'adult', genderPref:'any',
  teacherId:null, teacherName:'',
  plan: null,
};


export default function Enroll() {
  const { t, lang } = useLang();
  const e = t.enroll;
  const seo = pickEnrollSeo(lang);

  useSEO({
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
  });
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState(() => {
    const tid = Number(searchParams.get('teacher'));
    const found = tid ? TEACHERS.find((t) => t.id === tid) : null;
    const planName = searchParams.get('plan');
    const foundPlan = planName ? plans.find((p) => p.name === planName) : null;
    return {
      ...BLANK,
      ...(found ? { teacherId: found.id, teacherName: found.nameEn } : {}),
      ...(foundPlan ? { plan: foundPlan } : {}),
    };
  });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [bookingRef, setBookingRef] = useState('');

  // Resolve the visitor's timezone after mount only. Skipped under
  // navigator.webdriver (the build-time prerender) so the static HTML keeps the
  // neutral empty value. Never overwrites a value that is already set, and an
  // unavailable Intl leaves it empty. Safe to run twice (StrictMode).
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.webdriver) return;
    let tz = '';
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { tz = ''; }
    if (!tz) return;
    setForm((prev) => (prev.timezone ? prev : { ...prev, timezone: tz }));
  }, []);

  // Analytics (consent-gated inside trackEvent): the step number only —
  // never any form value.
  useEffect(() => { trackEvent('enroll_view'); }, []);
  const firstStepRender = useRef(true);
  useEffect(() => {
    if (firstStepRender.current) { firstStepRender.current = false; return; }
    trackEvent('enroll_step_view', { step });
  }, [step]);

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
      if (!form.whatsapp.trim()) { setError(v.whatsappRequired); return false; }
      if (!PHONE_RE.test(form.whatsapp.trim())) {
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

  const handleSubmitBooking = async () => {
    // Guards against a double-click (or a fast double-tap on mobile)
    // creating two booking requests: loading is already true for the
    // duration of the in-flight request, so a re-entrant call here is a
    // no-op instead of firing a second POST. The button is also visually
    // disabled while loading (see Step4's `disabled={loading}` below), but
    // this guard doesn't rely on the DOM disabled state alone.
    if (!form.plan || loading) return;
    setLoading(true);
    try {
      const res = await submitEnrollment({ ...form, plan: form.plan.name });
      setBookingRef(res?.bookingRef || '');
      setDone(true);
    } catch {
      setError(e.validation.submitFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* French SEO Publication Wave (2026-09-30): Enroll never had a
          visible breadcrumb bar by product design (a focused multi-step
          booking flow, not a content page under a hub), which was fine
          while this route was unpublished — but scripts/prerender.mjs's
          waitForHydratedSeo() requires a real BreadcrumbList JSON-LD on
          every non-Home route (entry.route !== '/'), with no exemption
          list; a build attempt confirmed this empirically (timed out
          waiting on exactly this page, the same single blocker
          Quran.jsx's own comment already describes and fixes the same
          way). Rendering <Breadcrumbs> inside .sr-only keeps the wizard's
          visual design unchanged while giving screen readers a real trail
          (closing a pre-existing a11y gap) and writing the JSON-LD every
          other prerendered page already gets.
          fr-gated (lang === 'fr'), not unconditional: only fr is actually
          published here, and frenchBatch1cEnArRegression.test.jsx's own
          byte-for-byte baseline exists specifically to guarantee French
          work never changes en/ar's rendered output, even invisibly —
          confirmed by a real test run (the baseline's body/JSON-LD hashes
          for Enroll's en/ar states changed the moment this was rendered
          unconditionally). */}
      {lang === 'fr' && (
        <div className="sr-only">
          <Breadcrumbs items={[{ label: t.nav.trial }]} />
        </div>
      )}
      <Header />
      <main id="main-content" className="enroll__page">
        <div className="enroll__container">
          {done ? (
            <Success name={form.name} plan={form.plan} bookingRef={bookingRef} />
          ) : (
            <>
              {/* ── Emotional header ── */}
              <div className="enroll__header">
                <p className="eyebrow" style={{ color: 'var(--gold)' }}>{e.eyebrow}</p>
                <h1>{e.heading}</h1>
                <p className="enroll__tagline">{e.tagline}</p>
              </div>

              <Progress step={step} />

              <div className="enroll__card">
                {step === 1 && <Step1 form={form} set={set} />}
                {step === 2 && <Step2 form={form} set={set} />}
                {step === 3 && <Step3 form={form} set={set} />}
                {step === 4 && <Step4 form={form} set={set} onSubmitBooking={handleSubmitBooking} submitting={loading} />}

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
    </>
  );
}
