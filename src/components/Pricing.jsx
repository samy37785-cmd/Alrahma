import { useState } from 'react';
import Reveal from './ui/Reveal';
import CheckoutModal from './ui/CheckoutModal';
import { plans } from '../data';

export default function Pricing() {
  const [selectedPlan, setSelectedPlan] = useState(null);

  return (
    <section className="pricing" id="pricing">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">Simple &amp; fair</p>
          <h2>Our Pricing Plans</h2>
          <p className="section-sub">Affordable monthly plans billed per student. Cancel anytime.</p>
        </Reveal>

        {/* Discount banner */}
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
              {plan.tag && <span className="plan__tag">{plan.tag}</span>}
              {plan.discountPct && (
                <span className="plan__discount-badge">{plan.discountPct}% OFF</span>
              )}
              <h3>{plan.name}</h3>
              <p className="plan__price">
                {plan.originalPrice && (
                  <s className="plan__original-price">{plan.originalPrice}</s>
                )}
                <span>{plan.price}</span>/month
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
                Choose plan
              </button>
            </Reveal>
          ))}
        </div>
      </div>

      <CheckoutModal plan={selectedPlan} onClose={() => setSelectedPlan(null)} />
    </section>
  );
}
