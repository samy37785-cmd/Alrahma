import { Link } from 'react-router-dom';
import Brand from './Brand';
import { site, socials } from '../data';

const quickLinks = [
  { href: '#about', label: 'About' },
  { href: '#courses', label: 'Courses' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#testimonials', label: 'Testimonials' },
];

const courseLinks = ['Quran Reading', 'Tajweed', 'Memorization', 'Arabic Language'];

export default function Footer() {
  return (
    <footer className="footer" id="contact">
      <div className="container footer__grid">
        <div className="footer__col">
          <Brand light />
          <p className="footer__about">
            Authentic online Quran, Arabic and Islamic education for students of all ages,
            anywhere in the world.
          </p>
        </div>

        <div className="footer__col">
          <h4>Quick Links</h4>
          <ul>
            {quickLinks.map((l) => (
              <li key={l.href}>
                <a href={l.href}>{l.label}</a>
              </li>
            ))}
          </ul>
        </div>

        <div className="footer__col">
          <h4>Courses</h4>
          <ul>
            {courseLinks.map((c) => (
              <li key={c}>
                <a href="#courses">{c}</a>
              </li>
            ))}
          </ul>
        </div>

        <div className="footer__col">
          <h4>Contact</h4>
          <ul className="footer__contact">
            <li>
              <a href={`mailto:${site.email}`}>{site.email}</a>
            </li>
            <li>
              <a href={`tel:${site.phoneHref}`}>{site.phoneDisplay}</a>
            </li>
            <li>
              <a href={`https://wa.me/${site.whatsapp}`} target="_blank" rel="noopener noreferrer">
                WhatsApp us
              </a>
            </li>
          </ul>
          <div className="footer__social">
            {socials.map((s) => (
              <a key={s.label} href={s.href} aria-label={s.label} target="_blank" rel="noopener noreferrer">
                {s.short}
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="footer__bottom">
        <div className="container">
          <p>Copyright © {new Date().getFullYear()} {site.name} Academy. All rights reserved.</p>
          <p>
            <Link to="/privacy">Privacy Policy</Link> · <a href="#contact">Contact</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
