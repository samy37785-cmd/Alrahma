import { Link } from 'react-router-dom';
import Brand from '../components/Brand';
import { site } from '../data';

export default function Privacy() {
  return (
    <div className="legal">
      <header className="quran__bar">
        <div className="container quran__bar-inner">
          <Brand />
          <Link to="/" className="btn btn--ghost btn--sm">← Back to site</Link>
        </div>
      </header>

      <main className="container legal__main">
        <h1>Privacy Policy</h1>
        <p className="legal__updated">Last updated: June 2026</p>

        <p>
          At {site.name} Academy we respect your privacy. This page explains what information we
          collect and how we use it.
        </p>

        <h2>Information we collect</h2>
        <p>
          When you book a free trial or subscribe to our newsletter, we collect the details you
          provide — such as your name, email, phone number and the course you’re interested in.
        </p>

        <h2>How we use it</h2>
        <ul>
          <li>To contact you and schedule your lessons.</li>
          <li>To improve our courses and services.</li>
          <li>To send updates and Islamic articles (only if you subscribe).</li>
        </ul>

        <h2>Your rights</h2>
        <p>
          You can ask us to update or delete your data at any time by emailing{' '}
          <a href={`mailto:${site.email}`}>{site.email}</a>.
        </p>

        <h2>Contact</h2>
        <p>
          For any questions about this policy, reach us at{' '}
          <a href={`mailto:${site.email}`}>{site.email}</a> or{' '}
          <a href={`tel:${site.phoneHref}`}>{site.phoneDisplay}</a>.
        </p>
      </main>
    </div>
  );
}
