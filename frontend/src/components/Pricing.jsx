import { useState, useEffect } from 'react';
import Reveal from './ui/Reveal';
import MobileCarousel from './ui/MobileCarousel';
import CheckoutModal from './ui/CheckoutModal';
import { useLang } from '../context/LangContext';
import { plans } from '../data';
import { PLAN_TEXT, pick } from '../i18n/content';

// Currency config: code, symbol, rate from EUR, display label
const CURRENCIES = [
  { code: 'EUR', symbol: '€', rate: 1,    label: 'EUR' },
  { code: 'USD', symbol: '$', rate: 1.08, label: 'USD' },
  { code: 'GBP', symbol: '£', rate: 0.86, label: 'GBP' },
  { code: 'SAR', symbol: '﷼', rate: 4.05, label: 'SAR' },
];

function parseEur(str) {
  return parseInt((str || '').replace(/[^\d]/g, ''), 10) || 0;
}
function cvtPrice(eurStr, curr) {
  if (!eurStr) return '';
  if (curr.code === 'EUR') return eurStr;
  return `${curr.symbol}${Math.round(parseEur(eurStr) * curr.rate)}`;
}

const PLAN_GRADS = [
  'linear-gradient(135deg,#1a5fa0,#2176c7)',
  'linear-gradient(135deg,#0b6e4f,#1a9e72)',
  'linear-gradient(135deg,#2c3e50,#3d5166)',
];

const PLAN_ICONS = ['🌱', '⭐', '👑'];

/* Returns the next Sunday 23:59:59 local time */
function getNextSundayDeadline() {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const daysUntilSunday = day === 0 ? 7 : 7 - day;
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntilSunday);
  next.setHours(23, 59, 59, 0);
  return next;
}

function useCountdown() {
  const [deadline] = useState(getNextSundayDeadline);
  const [left, setLeft] = useState(() => Math.max(0, deadline - Date.now()));

  useEffect(() => {
    const t = setInterval(() => setLeft(Math.max(0, deadline - Date.now())), 1000);
    return () => clearInterval(t);
  }, [deadline]);

  const totalSec = Math.floor(left / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return { h: pad(h), m: pad(m), s: pad(s), expired: left === 0 };
}

/* Deterministic "spots remaining" seeded to the current week number */
function spotsLeft() {
  const weekNum = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  return 3 + (weekNum % 4); // cycles 3-6
}

export default function Pricing() {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [currencyCode, setCurrencyCode] = useState('EUR');
  const { t, lang } = useLang();
  const p = t.pricing;
  const planText = pick(PLAN_TEXT, lang);
  const { h, m, s } = useCountdown();
  const spots = spotsLeft();
  const curr = CURRENCIES.find((c) => c.code === currencyCode) || CURRENCIES[0];

  return (
    <section className="pricing" id="pricing">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">{p.eyebrow}</p>
          <h2>{p.heading}</h2>
          <p className="section-sub">{p.sub}</p>
        </Reveal>

        {/* Currency toggle */}
        <Reveal className="pricing__currency-row">
          <span className="pricing__currency-label">Show prices in:</span>
          <div className="pricing__currency-toggle" role="group" aria-label="Currency selector">
            {CURRENCIES.map((c) => (
              <button
                key={c.code}
                type="button"
                className={`pricing__currency-btn${currencyCode === c.code ? ' active' : ''}`}
                onClick={() => setCurrencyCode(c.code)}
                aria-pressed={currencyCode === c.code}
              >
                {c.symbol} {c.label}
              </button>
            ))}
          </div>
        </Reveal>

        {/* ── Urgency banner with live countdown ── */}
        <Reveal className="pricing__banner pricing__banner--urgent">
          <span className="pricing__banner-badge">{p.banner}</span>
          <span className="pricing__banner-text">
            {p.bannerText}&ensp;—&ensp;
            <strong style={{ color: '#fff' }}>
              {p.offerEnds || 'Offer ends Sunday'}:
            </strong>
          </span>
          <div className="pricing__countdown" aria-live="polite" aria-label="Time remaining">
            <span className="pricing__countdown-block"><b>{h}</b><small>h</small></span>
            <span className="pricing__countdown-sep">:</span>
            <span className="pricing__countdown-block"><b>{m}</b><small>m</small></span>
            <span className="pricing__countdown-sep">:</span>
            <span className="pricing__countdown-block"><b>{s}</b><small>s</small></span>
          </div>
        </Reveal>

        {/* Spots scarcity */}
        <Reveal style={{ textAlign: 'center', marginBottom: 8 }}>
          <p className="pricing__spots">
            <span className="pricing__spots-dot" aria-hidden="true" />
            {p.spotsLeft
              ? p.spotsLeft.replace('{n}', spots)
              : `Only ${spots} discounted spots remaining this week`}
          </p>
        </Reveal>

        <MobileCarousel trackClassName="pricing__grid" ariaLabel={p.heading}>
          {plans.map((plan, i) => {
            const pt = planText[i] || planText[0];
            return (
            <Reveal
              as="article"
              className={`plan${plan.featured ? ' plan--featured' : ''}`}
              key={plan.name}
            >
              {plan.tag && (
                <span className="plan__tag">
                  {plan.tag === 'Most popular' ? p.mostPopular : plan.tag}
                </span>
              )}

              <div className="plan__header" style={{ background: PLAN_GRADS[i % PLAN_GRADS.length] }}>
                <span className="plan__header-icon">{PLAN_ICONS[i % PLAN_ICONS.length]}</span>
                <h3>{pt.name}</h3>
                {plan.arabicName && (
                  <p className="plan__arabic-name">{plan.arabicName}</p>
                )}
                {pt.sub && (
                  <p className="plan__tagline">{pt.sub}</p>
                )}
                <p className="plan__price">
                  {plan.originalPrice && (
                    <s className="plan__original-price">{cvtPrice(plan.originalPrice, curr)}</s>
                  )}
                  <span>{cvtPrice(plan.price, curr)}</span>{p.perMonth}
                </p>
                {plan.pricePerHour && (
                  <span className="plan__per-hour">{cvtPrice(plan.pricePerHour, curr)} {p.perHour}</span>
                )}
                {plan.discountPct && (
                  <span className="plan__discount-badge">{plan.discountPct}{p.off}</span>
                )}
              </div>

              <div className="plan__body">
                {plan.originalPrice && (
                  <p className="plan__saving">
                    {p.youSave} {cvtPrice(`€${parseEur(plan.originalPrice) - parseEur(plan.price)}`, curr)}{p.perMonth}
                  </p>
                )}
                <ul>
                  {pt.features.map((feat) => (
                    <li key={feat}>{feat}</li>
                  ))}
                </ul>
                {/* Premium anchoring statement */}
                {i === 2 && (
                  <p className="plan__anchor-note">
                    👑 Premium students complete their first Juz <strong>2× faster</strong> on average.
                  </p>
                )}
                <button
                  type="button"
                  className={`btn btn--block ${plan.featured ? 'btn--gold' : 'btn--green'}`}
                  onClick={() => setSelectedPlan(plan)}
                >
                  {p.getStarted}
                </button>
                <p className="plan__cancel-note">✓ {p.cancelNote}</p>
                <p className="plan__refund-inline">
                  🛡️ {p.refundInline || '14-day full refund if unsatisfied'}
                </p>
              </div>
            </Reveal>
            );
          })}
        </MobileCarousel>
      </div>

      {/* 14-day money-back guarantee banner */}
      <Reveal className="pricing__refund-banner">
        <div className="pricing__refund-icon" aria-hidden="true">🛡️</div>
        <div className="pricing__refund-text">
          <strong>{p.refundTitle || '14-Day Money-Back Guarantee'}</strong>
          <span>{p.refundSub || "Not happy with your subscription? We'll refund every penny within 14 days — no questions asked."}</span>
        </div>
      </Reveal>

      {/* Trust signals */}
      <Reveal className="pricing__trust">
        <div className="pricing__trust-item">
          <svg className="pricing__trust-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          <span>{p.securePayment || 'Secure payment'}</span>
        </div>
        <div className="pricing__trust-item">
          <svg className="pricing__trust-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 8 8 12 12 16"/><line x1="16" y1="12" x2="8" y2="12"/></svg>
          <span>{p.cancelAnytime || 'Cancel anytime'}</span>
        </div>
        <div className="pricing__trust-item">
          <svg className="pricing__trust-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
          <span>{p.azharCertified || '32 Al-Azhar certified tutors'}</span>
        </div>
        <div className="pricing__trust-item">
          <svg className="pricing__trust-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          <span>{p.familiesServed || '9,000+ lessons delivered'}</span>
        </div>
        <div className="pricing__trust-item">
          <svg className="pricing__trust-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
          <span>{p.countries || 'Students from 40+ countries'}</span>
        </div>
        <div className="pricing__trust-item pricing__trust-item--gdpr">
          <span className="pricing__gdpr-badge" aria-label="GDPR Compliant">GDPR</span>
          <span>{p.gdprNote || 'GDPR compliant — your data is safe'}</span>
        </div>
      </Reveal>

      <CheckoutModal plan={selectedPlan} onClose={() => setSelectedPlan(null)} />
    </section>
  );
}
