import { useState } from 'react';
import Reveal from './ui/Reveal';
import CheckoutModal from './ui/CheckoutModal';
import { useLang } from '../context/LangContext';
import { plans } from '../data';

const PLAN_GRADS = [
  'linear-gradient(135deg,#1a5fa0,#2176c7)',
  'linear-gradient(135deg,#0b6e4f,#1a9e72)',
  'linear-gradient(135deg,#2c3e50,#3d5166)',
];

const PLAN_ICONS = ['🌱', '⭐', '👑'];

export default function Pricing() {
  const [selectedPlan, setSelectedPlan] = useState(null);
  const { t } = useLang();
  const p = t.pricing;

  return (
    <section className="pricing" id="pricing">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">{p.eyebrow}</p>
          <h2>{p.heading}</h2>
          <p className="section-sub">Affordable monthly plans billed per student. Cancel anytime.</p>
        </Reveal>

        <Reveal className="pricing__banner">
          <span className="pricing__banner-badge">🎉 Limited Time</span>
          <span>Save <strong>25% OFF</strong> on all plans — discount already applied below</span>
        </Reveal>

        <div className="pricing__grid">
          {plans.map((plan, i) => (
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
                <h3>{plan.name}</h3>
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
                    You save €{parseInt(plan.originalPrice.replace('€','')) - parseInt(plan.price.replace('€',''))} / month
                  </p>
                )}
                <ul>
                  {plan.features.map((feat) => (
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
          ))}
        </div>
      </div>

      <CheckoutModal plan={selectedPlan} onClose={() => setSelectedPlan(null)} />
    </section>
  );
}
