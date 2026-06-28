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
import { PLAN_TEXT, pick } from '../i18n/content';

/* ── Static data ────────────────────────────────────────────────── */
const COUNTRIES = [
  'United Kingdom','Italy','France','Germany','Spain','Netherlands',
  'Belgium','Switzerland','Austria','Sweden','Denmark','Norway',
  'United States','Canada','Australia','New Zealand',
  'Egypt','Saudi Arabia','UAE','Qatar','Kuwait','Jordan','Morocco',
  'Tunisia','Algeria','Turkey','Other',
];
// Time-slot ids + the slot/subSlot key used to read translated labels from t.enroll.step1.slots
const TIME_SLOTS = [
  { id: 'morning',   key: 'morning',   subKey: 'morningSub'   },
  { id: 'afternoon', key: 'afternoon', subKey: 'afternoonSub' },
  { id: 'evening',   key: 'evening',   subKey: 'eveningSub'   },
  { id: 'night',     key: 'lateNight', subKey: 'lateNightSub' },
  { id: 'weekends',  key: 'weekends',  subKey: 'weekendsSub'  },
];
// Subject ids + icons; labels come from t.enroll.step2.subjectLabels (same order)
const SUBJECTS = [
  { id: 'quran',   icon: '📖' },
  { id: 'tajweed', icon: '🎙️' },
  { id: 'hifz',    icon: '🧠' },
  { id: 'ijazah',  icon: '📜' },
  { id: 'arabic',  icon: '🔤' },
  { id: 'islamic', icon: '🕌' },
  { id: 'tafsir',  icon: '🌟' },
  { id: 'seerah',  icon: '📿' },
];
// Instruction languages — names shown in their own language (locale-independent)
const INST_LANGS = [
  { code: 'en', flag: '🇬🇧', label: 'English'  },
  { code: 'ar', flag: '🇪🇬', label: 'العربية'  },
  { code: 'it', flag: '🇮🇹', label: 'Italiano' },
  { code: 'fr', flag: '🇫🇷', label: 'Français' },
  { code: 'de', flag: '🇩🇪', label: 'Deutsch'  },
  { code: 'es', flag: '🇪🇸', label: 'Español'  },
];
const LANG_NAMES = { en: 'English', ar: 'العربية', it: 'Italiano', fr: 'Français', de: 'Deutsch', es: 'Español' };
// Progress steps — labels come from t.enroll.steps
const STEPS = [
  { n: 1, icon: '👤', key: 'aboutYou'    },
  { n: 2, icon: '📚', key: 'yourGoals'   },
  { n: 3, icon: '👨‍🏫', key: 'yourTeacher' },
  { n: 4, icon: '💳', key: 'yourPlan'    },
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
  const { t } = useLang();
  const steps = t.enroll.steps;
  return (
    <div className="enroll__progress">
      {STEPS.map((s, i) => (
        <div key={s.n} className={`enroll__step-item${step >= s.n ? ' done' : ''}${step === s.n ? ' active' : ''}`}>
          <div className="enroll__step-circle">
            {step > s.n ? '✓' : s.icon}
          </div>
          <span className="enroll__step-label">{steps[s.key]}</span>
          {i < STEPS.length - 1 && <div className={`enroll__step-line${step > s.n ? ' done' : ''}`} />}
        </div>
      ))}
    </div>
  );
}

/* ── Step 1: About You ─────────────────────────────────────────── */
function Step1({ form, set }) {
  const { t } = useLang();
  const s = t.enroll.step1;
  const toggle = (id) => set('times', (prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  );
  return (
    <div className="enroll__form">
      <h2 className="enroll__step-title">{s.title}</h2>
      <p className="enroll__step-sub">{s.sub}</p>

      <div className="enroll__row">
        <div className="field">
          <label>{s.fullName}</label>
          <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={s.placeholderName} />
        </div>
        <div className="field">
          <label>{s.email}</label>
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} placeholder="you@email.com" />
        </div>
      </div>

      <div className="enroll__row">
        <div className="field">
          <label>{s.whatsapp}</label>
          <input value={form.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} placeholder="+44 7700 900000" />
        </div>
        <div className="field">
          <label>{s.country}</label>
          <select value={form.country} onChange={(e) => set('country', e.target.value)}>
            <option value="">{s.selectCountry}</option>
            {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <div className="field">
        <label>{s.city}</label>
        <input value={form.city} onChange={(e) => set('city', e.target.value)} placeholder={s.placeholderCity} />
      </div>

      <div className="field">
        <label>{s.timezone}</label>
        <input value={form.timezone} readOnly className="field__readonly" />
      </div>

      <div className="field">
        <label>{s.available} <span className="field__hint">{s.selectAll}</span></label>
        <div className="enroll__time-grid">
          {TIME_SLOTS.map((slot) => (
            <button
              key={slot.id}
              type="button"
              className={`enroll__time-btn${form.times.includes(slot.id) ? ' selected' : ''}`}
              onClick={() => toggle(slot.id)}
            >
              <strong>{s.slots[slot.key]}</strong>
              <span>{s.slots[slot.subKey]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Step 2: Your Goals ─────────────────────────────────────────── */
function Step2({ form, set }) {
  const { t } = useLang();
  const s = t.enroll.step2;
  const toggleSubject = (id) => set('subjects', (prev) =>
    prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
  );
  return (
    <div className="enroll__form">
      <h2 className="enroll__step-title">{s.title}</h2>
      <p className="enroll__step-sub">{s.sub}</p>

      <div className="field">
        <label>{s.subjects} <span className="field__hint">{t.enroll.step1.selectAll}</span></label>
        <div className="enroll__subject-grid">
          {SUBJECTS.map((subj, i) => (
            <button
              key={subj.id}
              type="button"
              className={`enroll__subject-btn${form.subjects.includes(subj.id) ? ' selected' : ''}`}
              onClick={() => toggleSubject(subj.id)}
            >
              <span className="enroll__subject-icon">{subj.icon}</span>
              <span>{s.subjectLabels[i]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>{s.prefLang}</label>
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
          <label>{s.level}</label>
          <select value={form.level} onChange={(e) => set('level', e.target.value)}>
            <option value="beginner">{s.levelBeginner}</option>
            <option value="intermediate">{s.levelIntermediate}</option>
            <option value="advanced">{s.levelAdvanced}</option>
          </select>
        </div>
        <div className="field">
          <label>{s.ageGroup}</label>
          <select value={form.ageGroup} onChange={(e) => set('ageGroup', e.target.value)}>
            <option value="child">{s.ageChild}</option>
            <option value="teen">{s.ageTeen}</option>
            <option value="adult">{s.ageAdult}</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label>{s.teacherPref}</label>
        <div className="enroll__pref-row">
          {[
            { v: 'any', label: s.prefAny },
            { v: 'm',   label: s.prefMale },
            { v: 'f',   label: s.prefFemale },
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
  const { t: tr, lang } = useLang();
  const s = tr.enroll.step3;
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
      <h2 className="enroll__step-title">{s.title}</h2>
      {noMatch
        ? <p className="enroll__step-sub">{s.noMatch}</p>
        : <p className="enroll__step-sub">{visible.length} {visible.length !== 1 ? s.matchPlural : s.matchSingular}</p>
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
                {t.gender === 'f' && <span className="enroll__tcard-f">{s.female}</span>}
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
  const { t, lang } = useLang();
  const s = t.enroll.step4;
  const planText = pick(PLAN_TEXT, lang);
  const selectedName = form.plan ? planText[plans.findIndex((p) => p.name === form.plan.name)]?.name || form.plan.name : '';
  return (
    <div className="enroll__form">
      <h2 className="enroll__step-title">{s.title}</h2>
      <p className="enroll__step-sub">{s.sub}</p>

      <div className="enroll__plan-grid">
        {plans.map((plan, i) => {
          const pt = planText[i] || planText[0];
          return (
          <button
            key={plan.name}
            type="button"
            className={`enroll__plan-card${form.plan?.name === plan.name ? ' selected' : ''}${plan.featured ? ' featured' : ''}`}
            onClick={() => set('plan', plan)}
          >
            {plan.tag && <span className="enroll__plan-tag">{plan.tag === 'Most popular' ? t.pricing.mostPopular : plan.tag}</span>}
            <div className="enroll__plan-icon">{['🌱','⭐','👑'][i]}</div>
            <h3>{pt.name}</h3>
            <div className="enroll__plan-price">
              {plan.originalPrice && <s>{plan.originalPrice}</s>}
              <strong>{plan.price}</strong><span>{s.perMo}</span>
            </div>
            <ul>
              {pt.features.map((f) => <li key={f}>{f}</li>)}
            </ul>
            {form.plan?.name === plan.name && (
              <div className="enroll__plan-selected">{s.selected}</div>
            )}
          </button>
          );
        })}
      </div>

      {form.plan && (
        <div className="enroll__summary">
          <h3>{s.summaryTitle}</h3>
          <div className="enroll__summary-rows">
            <div className="enroll__summary-row"><span>{s.summaryStudent}</span><strong>{form.name}</strong></div>
            <div className="enroll__summary-row"><span>{s.summaryEmail}</span><strong>{form.email}</strong></div>
            {form.teacherName && <div className="enroll__summary-row"><span>{s.summaryTeacher}</span><strong>{form.teacherName}</strong></div>}
            <div className="enroll__summary-row"><span>{s.summaryPlan}</span><strong>{selectedName} — {form.plan.price}{t.pricing.perMonth}</strong></div>
            {form.lang && <div className="enroll__summary-row"><span>{s.summaryLang}</span><strong>{LANG_NAMES[form.lang]}</strong></div>}
          </div>
          <button type="button" className="btn btn--gold btn--block" style={{marginTop:'16px'}} onClick={onPayNow}>
            {s.confirmPay}
          </button>
        </div>
      )}
    </div>
  );
}

/* ── Success screen ─────────────────────────────────────────────── */
function Success({ name }) {
  const navigate = useNavigate();
  const { t } = useLang();
  const s = t.enroll.success;
  return (
    <div className="enroll__success">
      <div className="enroll__success-icon">{s.icon}</div>
      <h2>{s.title}</h2>
      <p>{s.thankYouPre}<strong>{name}</strong>{s.thankYouPost}</p>
      <p className="enroll__success-sub">{s.emailNote}</p>
      <button type="button" className="btn btn--green" onClick={() => navigate('/')}>{s.backHome}</button>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────── */
export default function Enroll() {
  useSEO({
    title: 'Enroll',
    description: 'Start your Quran journey. Choose your subjects, pick a certified tutor, and select a plan — in just a few steps.',
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
              {/* Header */}
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
