import { useState } from 'react';
import Reveal from './Reveal';
import CheckoutModal from './CheckoutModal';
import { plans } from '../data';

export default function Pricing() {
  // The plan the user clicked "Choose plan" on — drives the checkout modal.
  const [selectedPlan, setSelectedPlan] = useState(null);

  return (
    <section className="pricing" id="pricing">
      <div className="container">
        <Reveal className="section-head">
          <p className="eyebrow">Simple &amp; fair</p>
          <h2>Our Pricing Plans</h2>
          <p className="section-sub">Affordable monthly plans billed per student. Cancel anytime.</p>
        </Reveal>
        <div className="pricing__grid">
          {plans.map((plan) => (
            <Reveal
              as="article"
              className={`plan${plan.featured ? ' plan--featured' : ''}`}
              key={plan.name}
            >
              {plan.tag && <span className="plan__tag">{plan.tag}</span>}
              <h3>{plan.name}</h3>
              <p className="plan__price">
                <span>{plan.price}</span>/month
              </p>
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
