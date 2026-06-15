import { Link } from 'react-router-dom';
import Brand from './Brand';
import { site, socials, courses } from '../data';

const quickLinks = [
  { to: '/', label: 'Home' },
  { to: '/#about', label: 'About' },
  { to: '/#courses', label: 'Courses' },
  { to: '/#pricing', label: 'Pricing' },
  { to: '/#testimonials', label: 'Testimonials' },
  { to: '/teachers', label: 'Teachers' },
  { to: '/#contact', label: 'Contact' },
];

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
              <li key={l.to}>
                <Link to={l.to}>{l.label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="footer__col">
          <h4>Courses</h4>
          <ul>
            {courses.map((c) => (
              <li key={c.title}>
                <Link to="/#courses">{c.title}</Link>
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
                <i className={s.icon}></i>
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="footer__bottom">
        <div className="container">
          <p>Copyright © {new Date().getFullYear()} {site.name} Academy. All rights reserved.</p>
          <p>
            <Link to="/privacy">Privacy Policy</Link> · <Link to="/#contact">Contact</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
