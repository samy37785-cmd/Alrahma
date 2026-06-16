import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import CheckoutModal from '../components/ui/CheckoutModal';
import useSEO from '../hooks/useSEO';
import { submitEnrollment } from '../api/client';
import { TEACHERS } from '../data';
import { plans } from '../data';
import { useLang } from '../context/LangContext';

/* ── Static data ────────────────────────────────────────────────── */
const COUNTRIES = [
  'United Kingdom','Italy','France','Germany','Spain','Netherlands',
  'Belgium','Switzerland','Austria','Sweden','Denmark','Norway',
  'United States','Canada','Australia','New Zealand',
  'Egypt','Saudi Arabia','UAE','Qatar','Kuwait','Jordan','Morocco',
  'Tunisia','Algeria','Turkey','Other',
];
const TIME_SLOTS = [
  { id: 'morning',   label: 'Morning',   sub: '6 am – 12 pm' },
  { id: 'afternoon', label: 'Afternoon', sub: '12 pm – 5 pm'  },
  { id: 'evening',   label: 'Evening',   sub: '5 pm – 10 pm'  },
  { id: 'night',     label: 'Late Night',sub: '10 pm – 2 am'  },
  { id: 'weekends',  label: 'Weekends',  sub: 'Sat & Sun only' },
];
const SUBJECTS = [
  { id: 'quran',   icon: '📖', label: 'Quran Reading'     },
  { id: 'tajweed', icon: '🎙️', label: 'Tajweed'           },
  { id: 'hifz',    icon: '🧠', label: 'Memorization (Hifz)' },
  { id: 'ijazah',  icon: '📜', label: 'Ijazah Course'     },
  { id: 'arabic',  icon: '🔤', label: 'Arabic Language'   },
  { id: 'islamic', icon: '🕌', label: 'Islamic Studies'   },
  { id: 'tafsir',  icon: '🌟', label: 'Quranic Tafsir'    },
  { id: 'seerah',  icon: '📿', label: 'Prophetic Seerah'  },
];
const INST_LANGS = [
  { code: 'en', flag: '🇬🇧', label: 'English'  },
  { code: 'ar', flag: '🇪🇬', label: 'Arabic'   },
  { code: 'it', flag: '🇮🇹', label: 'Italian'  },
  { code: 'fr', flag: '🇫🇷', label: 'French'   },
  { code: 'de', flag: '🇩🇪', label: 'German'   },
  { code: 'es', flag: '🇪🇸', label: 'Spanish'  },
];
const STEPS = [
  { n: 1, icon: '👤', label: 'About You'    },
  { n: 2, icon: '📚', label: 'Your Goals'   },
  { n: 3, icon: '👨‍🏫', label: 'Your Teacher' },
  { n: 4, icon: '💳', label: 'Your Plan'    },
];

const BLANK = {
  name:'', email:'', whatsapp:'', country:'', city:'',
  times:[], timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  subjects:[], lang:'en', level:'beginner', ageGroup:'adult', genderPref:'any',
  teacherId:null, teacherName:'',
  plan: null,
};

/* ── Progress bar ───────────────────────────────────────────────── */
function Progress({ step }) {
  return (
    <div className="enroll__progress">
      {STEPS.map((s, i) => (
        <div key={s.n} className={`enroll__step-item${step >= s.n ? ' done' : ''}${step === s.n ? ' active' : ''}`}>
          <div className="enroll__step-circle">
            {step > s.n ? '✓' : s.icon}
          </div>
          <span className="enroll__step-label">{s.label}</span>
          {i < STEPS.length - 1 && <div className={`enroll__step-line${step > s.n ? ' done' : ''}`} />}
        </div>
      ))}
    </div>
  );
}

/* ── Step 1: About You ─────────────────────────────────────────── */
function Step1({ form, set }) {
  const toggle = (id) => set('times', (prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  );
  return (
    <div className="enroll__form">
      <h2 className="enroll__step-title">Tell us about yourself</h2>
      <p className="enroll__step-sub">We'll use this to match you with the right teacher and schedule.</p>

      <div className="enroll__row">
        <div className="field">
          <label>Full name *</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Your name" />
        </div>
        <div className="field">
          <label>Email address *</label>
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@email.com" />
        </div>
      </div>

      <div className="enroll__row">
        <div className="field">
          <label>WhatsApp number</label>
          <input value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="+44 7700 900000" />
        </div>
        <div className="field">
          <label>Country</label>
          <select value={form.country} onChange={(e) => set('country', e.target.value)}>
            <option value="">Select country…</option>
            {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label>City / Region</label>
        <input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder="e.g. London, Rome, Paris…" />
      </div>

      <div className="field">
        <label>Your time zone (auto-detected)</label>
        <input value={form.timezone} readOnly className="field__readonly" />
      </div>

      <div className="field">
        <label>When are you available? <span className="field__hint">(select all that apply)</span></label>
        <div className="enroll__time-grid">
          {TIME_SLOTS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`enroll__time-btn${form.times.includes(t.id) ? ' selected' : ''}`}
              onClick={() => toggle(t.id)}
            >
              <strong>{t.label}</strong>
              <span>{t.sub}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Step 2: Your Goals ─────────────────────────────────────────── */
function Step2({ form, set }) {
  const toggleSubject = (id) => set('subjects', (prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  );
  return (
    <div className="enroll__form">
      <h2 className="enroll__step-title">What do you want to learn?</h2>
      <p className="enroll__step-sub">Choose as many subjects as you like — we'll find teachers who cover them.</p>

      <div className="field">
        <label>Subjects <span className="field__hint">(select all that apply)</span></label>
        <div className="enroll__subject-grid">
          {SUBJECTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`enroll__subject-btn${form.subjects.includes(s.id) ? ' selected' : ''}`}
              onClick={() => toggleSubject(s.id)}
            >
              <span className="enroll__subject-icon">{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Preferred instruction language</label>
        <div className="enroll__lang-grid">
          {INST_LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              className={`enroll__lang-btn${form.lang === l.code ? ' selected' : ''}`}
              onClick={() => set('lang', l.code)}
            >
              <span>{l.flag}</span>
              <span>{l.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="enroll__row">
        <div className="field">
          <label>Your level</label>
          <select value={form.level} onChange={(e) => set('level', e.target.value)}>
            <option value="beginner">Beginner — just starting</option>
            <option value="intermediate">Intermediate — some knowledge</option>
            <option value="advanced">Advanced — seeking deeper study</option>
          </select>
        </div>
        <div className="field">
          <label>Student age group</label>
          <select value={form.ageGroup} onChange={(e) => set('ageGroup', e.target.value)}>
            <option value="child">Child (under 12)</option>
            <option value="teen">Teen (12–17)</option>
            <option value="adult">Adult (18+)</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label>Teacher gender preference</label>
        <div className="enroll__pref-row">
          {[
            { v: 'any', label: '🤝 No preference' },
            { v: 'm',   label: '👨‍🏫 Male tutor' },
            { v: 'f',   label: '👩‍🏫 Female tutor' },
          ].map((opt) => (
            <button
              key={opt.v}
              type="button"
              className={`enroll__pref-btn${form.genderPref === opt.v ? ' selected' : ''}`}
              onClick={() => set('genderPref', opt.v)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Step 3: Choose Teacher ─────────────────────────────────────── */
function Step3({ form, set }) {
  const { lang } = useLang();
  const filtered = TEACHERS.filter((t) => {
    if (form.genderPref !== 'any' && t.gender !== form.genderPref) return false;
    if (form.lang && !t.langs.includes(form.lang)) return false;
    if (form.subjects.length > 0 && !form.subjects.some((s) => t.subjects.includes(s))) return false;
    return true;
  });
  const visible = filtered.length ? filtered : TEACHERS;
  const noMatch = filtered.length === 0;

  return (
    <div className="enroll__form">
      <h2 className="enroll__step-title">Choose your teacher</h2>
      {noMatch
        ? <p className="enroll__step-sub">No exact match found — showing all available teachers. Pick anyone you like!</p>
        : <p className="enroll__step-sub">{visible.length} teacher{visible.length !== 1 ? 's' : ''} match your preferences.</p>
      }

      <div className="enroll__teacher-grid">
        {visible.map((t) => {
          const initials = t.nameAr.split(' ').slice(0, 2).map((w) => w[0]).join('');
          const selected = form.teacherId === t.id;
          return (
            <button
              key={t.id}
              type="button"
              className={`enroll__tcard${selected ? ' selected' : ''}`}
              onClick={() => { set('teacherId', t.id); set('teacherName', t.nameEn); }}
            >
              {selected && <span className="enroll__tcard-check">✓</span>}
              <div className="enroll__tcard-avatar" style={{ background: `linear-gradient(145deg,${t.color}dd,${t.color}88)` }}>
                <span dir="rtl">{initials}</span>
              </div>
              <div className="enroll__tcard-info">
                <strong dir="rtl">{t.nameAr}</strong>
                <span>{t.nameEn}</span>
                <p>{t.title[lang] || t.title.en}</p>
              </div>
              <div className="enroll__tcard-meta">
                <span className="enroll__tcard-rating">★ {t.rating.toFixed(1)}</span>
                {t.gender === 'f' && <span className="enroll__tcard-f">Female</span>}
              </div>
              <div className="enroll__tcard-tags">
                {t.langs.map((l) => (
                  <span key={l} className="enroll__tcard-lang">
                    {({en:'🇬🇧',ar:'🇪🇬',it:'🇮🇹',fr:'🇫🇷',de:'🇩🇪',es:'🇪🇸'})[l]} {l.toUpperCase()}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── Step 4: Choose Plan ─────────────────────────────────────────── */
function Step4({ form, set, onPayNow }) {
  return (
    <div className="enroll__form">
      <h2 className="enroll__step-title">Choose your plan</h2>
      <p className="enroll__step-sub">All plans include one-to-one lessons with your chosen teacher. Cancel anytime.</p>

      <div className="enroll__plan-grid">
        {plans.map((plan) => (
          <button
            key={plan.name}
            type="button"
            className={`enroll__plan-card${form.plan?.name === plan.name ? ' selected' : ''}${plan.featured ? ' featured' : ''}`}
            onClick={() => set('plan', plan)}
          >
            {plan.tag && <span className="enroll__plan-tag">{plan.tag}</span>}
            <div className="enroll__plan-icon">{['🌱','⭐','👑'][plans.indexOf(plan)]}</div>
            <h3>{plan.name}</h3>
            <div className="enroll__plan-price">
              {plan.originalPrice && <s>{plan.originalPrice}</s>}
              <strong>{plan.price}</strong><span>/mo</span>
            </div>
            <ul>
              {plan.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
            {form.plan?.name === plan.name && (
              <div className="enroll__plan-selected">✓ Selected</div>
            )}
          </button>
        ))}
      </div>

      {form.plan && (
        <div className="enroll__summary">
          <h3>Your enrollment summary</h3>
          <div className="enroll__summary-rows">
            <div className="enroll__summary-row"><span>Student</span><strong>{form.name}</strong></div>
            <div className="enroll__summary-row"><span>Email</span><strong>{form.email}</strong></div>
            {form.teacherName && <div className="enroll__summary-row"><span>Teacher</span><strong>{form.teacherName}</strong></div>}
            <div className="enroll__summary-row"><span>Plan</span><strong>{form.plan.name} — {form.plan.price}/month</strong></div>
            {form.lang && <div className="enroll__summary-row"><span>Language</span><strong>{({en:'English',ar:'Arabic',it:'Italian',fr:'French',de:'German',es:'Spanish'})[form.lang]}</strong></div>}
          </div>
          <button type="button" className="btn btn--gold btn--block" style={{marginTop:'16px'}} onClick={onPayNow}>
            Confirm &amp; Proceed to Payment →
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Success screen ─────────────────────────────────────────────── */
function Success({ name }) {
  const navigate = useNavigate();
  return (
    <div className="enroll__success">
      <div className="enroll__success-icon">🎉</div>
      <h2>Enrollment Received!</h2>
      <p>Thank you, <strong>{name}</strong>. We'll be in touch within 24 hours to confirm your schedule.</p>
      <p className="enroll__success-sub">Check your email for a confirmation message.</p>
      <button type="button" className="btn btn--green" onClick={() => navigate('/')}>Back to Home</button>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────── */
export default function Enroll() {
  useSEO({
    title: 'Enroll — AL-Rahma Academy',
    description: 'Start your Quran journey. Choose your subjects, pick a certified tutor, and select a plan — in just a few steps.',
  });

  const navigate = useNavigate();
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
    if (step === 1) {
      if (!form.name.trim()) { setError('Full name is required.'); return false; }
      if (!form.email.trim()) { setError('Email address is required.'); return false; }
      if (!EMAIL_RE.test(form.email.trim())) { setError('Please enter a valid email address.'); return false; }
      if (form.whatsapp && !PHONE_RE.test(form.whatsapp.trim())) {
        setError('Please enter a valid phone number (e.g. +44 7700 900000).'); return false;
      }
    }
    if (step === 2 && form.subjects.length === 0) {
      setError('Please select at least one subject.'); return false;
    }
    if (step === 3 && !form.teacherId) {
      setError('Please choose a teacher.'); return false;
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
      setError('Failed to submit. Please try again.');
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
      <main className="enroll__page">
        <div className="enroll__container">
          {done ? (
            <Success name={form.name} />
          ) : (
            <>
              {/* Header */}
              <div className="enroll__header">
                <p className="eyebrow" style={{ color: 'var(--gold)' }}>Start Your Journey</p>
                <h1>Enroll in AL-Rahma Academy</h1>
                <p className="enroll__tagline">4 simple steps to begin learning the Quran with a certified Al-Azhar tutor.</p>
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
                    <button type="button" className="btn btn--ghost" onClick={back}>← Back</button>
                  )}
                  {step < 4 && (
                    <button type="button" className="btn btn--green" onClick={next} disabled={loading}>
                      Continue →
                    </button>
                  )}
                  {loading && <span className="enroll__spinner">⟳ Submitting…</span>}
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
