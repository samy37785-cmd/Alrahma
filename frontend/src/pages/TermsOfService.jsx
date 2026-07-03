import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import useSEO from '../hooks/useSEO';
import { site } from '../data/site';

const LAST_UPDATED = '28 June 2026';

export default function TermsOfService() {
  useSEO({
    title: 'Terms of Service',
    description: 'Terms and conditions governing your use of Al-Rahma Academy\'s online Quran and Islamic education services.',
    noindex: false,
  });

  return (
    <>
      <Header />
      <main>
        <Breadcrumbs items={[{ label: 'Academy', to: '/academy' }, { label: 'Terms of Service' }]} />
        <section className="legal-page">
          <div className="container legal-page__inner">
            <h1>Terms of Service</h1>
            <p className="legal-page__meta">Last updated: {LAST_UPDATED}</p>

            <p>
              These Terms of Service (&quot;Terms&quot;) govern your access to and use of Al-Rahma Academy&apos;s
              online education platform, including all lessons, courses, tools, and related services
              (collectively, the &quot;Services&quot;). By registering or using the Services, you agree to be
              bound by these Terms.
            </p>

            <h2>1. Services</h2>
            <p>
              Al-Rahma Academy provides one-to-one online Quran, Arabic, and Islamic Studies
              lessons delivered live via video call (Zoom or Skype). All tutors hold verified
              Al-Azhar University qualifications and an Ijazah with a continuous chain of
              transmission (sanad).
            </p>

            <h2>2. Subscriptions &amp; Payment</h2>
            <ul>
              <li>Subscriptions are billed monthly per student enrolled.</li>
              <li>Payment is processed securely via Stripe (card) or PayPal.</li>
              <li>Prices are displayed in Euros (€) and are inclusive of any applicable VAT.</li>
              <li>Your subscription renews automatically each month unless cancelled at least 24 hours before the renewal date.</li>
              <li>Discounted promotional prices apply only to the period stated at the time of purchase.</li>
            </ul>

            <h2>3. 14-Day Money-Back Guarantee</h2>
            <p>
              If you are not satisfied with your first subscription period for any reason, you may
              request a full refund within <strong>14 calendar days</strong> of your initial payment.
              To request a refund, contact us at{' '}
              <a href={`mailto:${site.email}`}>{site.email}</a> or via WhatsApp at{' '}
              <a href={`https://wa.me/${site.whatsapp}`}>{site.whatsappDisplay}</a>.
              Refunds are processed within 5–10 business days to your original payment method.
            </p>
            <p>
              The money-back guarantee applies to the <em>first</em> subscription period only.
              Subsequent renewals may be cancelled for a pro-rated credit at our discretion.
            </p>

            <h2>4. Cancellation</h2>
            <p>
              You may cancel your subscription at any time from your Billing page or by contacting
              support. Cancellation takes effect at the end of the current billing period; you
              retain access to scheduled lessons until then. No partial refunds are issued for
              unused days beyond the 14-day guarantee window.
            </p>

            <h2>5. Free Trial</h2>
            <p>
              New students receive two complimentary trial lessons with no payment required.
              The free trial is available once per student. After the trial, you may choose any
              subscription plan or opt not to continue — there is no obligation.
            </p>

            <h2>6. Lesson Scheduling &amp; Rescheduling</h2>
            <ul>
              <li>Lessons must be rescheduled at least <strong>24 hours in advance</strong>.</li>
              <li>Lessons cancelled within 24 hours are forfeited unless due to an emergency.</li>
              <li>Tutors may reschedule with 24-hour notice; persistent rescheduling qualifies you for a tutor change at no cost.</li>
            </ul>

            <h2>7. Tutor Matching &amp; Changes</h2>
            <p>
              We match each student with a suitable tutor based on their goals, language, and
              schedule. If you are unhappy with your assigned tutor for any reason, you may request
              a change at no cost — simply contact support via email or WhatsApp. We aim to
              complete all tutor changes within 48 hours.
            </p>

            <h2>8. Conduct &amp; Safety</h2>
            <p>
              All lessons are conducted in a respectful, professional environment. Recording of
              lessons by students or parents requires prior written consent from the tutor.
              Lessons involving children under 13 require a parent or guardian to be present or
              immediately accessible during the session.
            </p>

            <h2>9. Intellectual Property</h2>
            <p>
              All course materials, recordings (where provided), and content created by Al-Rahma
              Academy remain our intellectual property. You may not reproduce, distribute, or
              resell our materials without prior written permission.
            </p>

            <h2>10. Data Protection (GDPR)</h2>
            <p>
              We process your personal data in accordance with the EU General Data Protection
              Regulation (GDPR). We never sell your data to third parties. For full details,
              see our <a href="/academy/privacy">Privacy Policy</a>.
            </p>

            <h2>11. Limitation of Liability</h2>
            <p>
              Al-Rahma Academy&apos;s total liability to you for any claim arising from these Terms
              shall not exceed the amount you paid us in the 30 days preceding the claim.
              We are not liable for indirect, incidental, or consequential damages.
            </p>

            <h2>12. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the Arab Republic of Egypt. Any disputes
              shall be submitted to the competent courts of Cairo, Egypt, without prejudice to
              any mandatory consumer protection rights you may have under EU law.
            </p>

            <h2>13. Contact</h2>
            <p>
              For any questions about these Terms, please contact us:
            </p>
            <ul>
              <li>Email: <a href={`mailto:${site.email}`}>{site.email}</a></li>
              <li>WhatsApp: <a href={`https://wa.me/${site.whatsapp}`}>{site.whatsappDisplay}</a></li>
              <li>Response time: within 2 hours during business days (Sat–Thu, 08:00–23:00 Cairo time)</li>
            </ul>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
