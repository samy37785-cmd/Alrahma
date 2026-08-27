import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import useSEO from '../hooks/useSEO';
import { site } from '../data/site';

const LAST_UPDATED = '28 June 2026';

export default function RefundPolicy() {
  useSEO({
    title: 'Refund Policy',
    description: '14-day money-back guarantee. If you are not satisfied with Al-Rahma Academy, we refund 100% — no questions asked.',
  });

  return (
    <>
      <Header />
      <main>
        <Breadcrumbs items={[{ label: 'Academy', to: '/academy' }, { label: 'Refund Policy' }]} />
        <section className="legal-page">
          <div className="container legal-page__inner">

            {/* Hero guarantee badge */}
            <div className="refund-hero">
              <div className="refund-hero__shield">🛡️</div>
              <h1>14-Day Money-Back Guarantee</h1>
              <p className="refund-hero__sub">
                We are confident in the quality of our tutors and teaching.
                If you are not completely satisfied within 14 days,
                we will refund every cent — no questions asked, no forms to fill.
              </p>
            </div>

            <p className="legal-page__meta">Last updated: {LAST_UPDATED}</p>

            <h2>How the Guarantee Works</h2>
            <ol>
              <li>
                <strong>Purchase any subscription plan.</strong> Your 14-day window begins on the
                date of your first payment.
              </li>
              <li>
                <strong>Try the lessons.</strong> Attend sessions, meet your tutor, experience
                the platform fully.
              </li>
              <li>
                <strong>Not satisfied?</strong> Contact us within 14 days by email or WhatsApp.
                Tell us what happened — or don&apos;t. Either way, we refund you.
              </li>
              <li>
                <strong>Receive your refund</strong> within 5–10 business days to your original
                payment method (card or PayPal).
              </li>
            </ol>

            <h2>What Is Covered</h2>
            <ul>
              <li>✅ All subscription plans (Starter, Standard, Premium)</li>
              <li>✅ First billing period only</li>
              <li>✅ No minimum number of lessons required to qualify</li>
              <li>✅ No deductions for lessons already attended</li>
              <li>✅ Full 100% refund — no partial refunds, no &quot;store credit&quot;</li>
            </ul>

            <h2>What Is Not Covered</h2>
            <ul>
              <li>❌ Refund requests made after 14 days from the initial payment</li>
              <li>❌ Subsequent monthly renewals (only the first payment is guaranteed)</li>
              <li>❌ Free trial lessons (free = no payment = no refund applicable)</li>
            </ul>

            <h2>Cancellation Without Refund</h2>
            <p>
              After the 14-day window, you may cancel your subscription at any time from your
              Billing page. Cancellation stops future renewals but does not issue a refund for
              the current period. You retain access to your scheduled lessons until the end of
              the paid period.
            </p>

            <h2>How to Request a Refund</h2>
            <p>Contact us through any of the following — no form needed:</p>
            <div className="refund-contacts">
              <a href={`mailto:${site.email}`} className="refund-contact">
                <span className="refund-contact__icon">✉️</span>
                <div>
                  <strong>Email</strong>
                  <span>{site.email}</span>
                </div>
              </a>
              <a
                href={`https://wa.me/${site.whatsapp}?text=Hi%2C%20I%20would%20like%20to%20request%20a%20refund`}
                target="_blank"
                rel="noopener noreferrer"
                className="refund-contact"
              >
                <span className="refund-contact__icon">💬</span>
                <div>
                  <strong>WhatsApp</strong>
                  <span>{site.whatsappDisplay}</span>
                </div>
              </a>
            </div>
            <p>
              We typically respond within 2 hours (Sat–Thu, 08:00–23:00 Cairo time).
              Refunds are confirmed in writing and processed within 5–10 business days.
            </p>

            <h2>Our Promise</h2>
            <p>
              We built this refund policy because we believe our tutors and teaching speak for
              themselves. If they don&apos;t meet your expectations, you deserve your money back.
              Simple as that.
            </p>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
