import { useState } from 'react';
import Reveal from './ui/Reveal';
import CheckoutModal from './ui/CheckoutModal';
import { useLang } from '../context/LangContext';
import { plans } from '../data';

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
          {plans.map((plan) => (
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
              {plan.discountPct && (
                <span className="plan__discount-badge">{plan.discountPct}{p.off}</span>
              )}
              <h3>{plan.name}</h3>
              <p className="plan__price">
                {plan.originalPrice && (
                  <s className="plan__original-price">{plan.originalPrice}</s>
                )}
                <span>{plan.price}</span>{p.perMonth}
              </p>
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
                className={`btn ${plan.featured ? 'btn--gold' : 'btn--ghost'}`}
                onClick={() => setSelectedPlan(plan)}
              >
                {p.getStarted}
              </button>
            </Reveal>
          ))}
        </div>
      </div>

      <CheckoutModal plan={selectedPlan} onClose={() => setSelectedPlan(null)} />
    </section>
  );
}
