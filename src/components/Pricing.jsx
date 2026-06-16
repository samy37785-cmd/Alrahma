import { useState } from 'react';
import Reveal from './ui/Reveal';
import CheckoutModal from './ui/CheckoutModal';
import { useLang } from '../context/LangContext';
import { plans } from '../data';
import { PLAN_TEXT, pick } from '../i18n/content';

const PLAN_GRADS = [
  'linear-gradient(135deg,#1a5fa0,#2176c7)',
  'linear-gradient(135deg,#0b6e4f,#1a9e72)',
  'linear-gradient(135deg,#2c3e50,#3d5166)',
];

const PLAN_ICONS = ['🌱', '⭐', '👑'];

export default function Pricing() {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const { t, lang } = useLang();
  const p = t.pricing;
  const planText = pick(PLAN_TEXT, lang);

  return (
    <section className="pricing" id="pricing">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">{p.eyebrow}</p>
          <h2>{p.heading}</h2>
          <p className="section-sub">{p.sub}</p>
        </Reveal>

        <Reveal className="pricing__banner">
          <span className="pricing__banner-badge">{p.banner}</span>
          <span>{p.bannerText}</span>
        </Reveal>

        <div className="pricing__grid">
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
                <p className="plan__price">
                  {plan.originalPrice && (
                    <s className="plan__original-price">{plan.originalPrice}</s>
                  )}
                  <span>{plan.price}</span>{p.perMonth}
                </p>
                {plan.discountPct && (
                  <span className="plan__discount-badge">{plan.discountPct}{p.off}</span>
                )}
              </div>

              <div className="plan__body">
                {plan.originalPrice && (
                  <p className="plan__saving">
                    {p.youSave} €{parseInt(plan.originalPrice.replace('€','')) - parseInt(plan.price.replace('€',''))}{p.perMonth}
                  </p>
                )}
                <ul>
                  {pt.features.map((feat) => (
                    <li key={feat}>{feat}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`btn btn--block ${plan.featured ? 'btn--gold' : 'btn--green'}`}
                  onClick={() => setSelectedPlan(plan)}
                >
                  {p.getStarted}
                </button>
              </div>
            </Reveal>
            );
          })}
        </div>
      </div>

      <CheckoutModal plan={selectedPlan} onClose={() => setSelectedPlan(null)} />
    </section>
  );
}
