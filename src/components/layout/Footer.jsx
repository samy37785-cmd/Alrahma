import { Link } from 'react-router-dom';
import Brand from './Brand';
import { useLang } from '../../context/LangContext';
import { site, socials, courses } from '../../data';

const QUICK_HREFS = ['/', '/#about', '/#courses', '/#pricing', '/#testimonials', '/teachers', '/#contact'];

export default function Footer() {
  const { t } = useLang();
  const f = t.footer;

  return (
    <footer className="footer" id="contact">
      <div className="container footer__grid">
        <div className="footer__col">
          <Brand light />
          <p className="footer__about">{f.about}</p>
        </div>

        <div className="footer__col">
          <h4>{f.quickLinks}</h4>
          <ul>
            {f.links.map((label, i) => (
              <li key={QUICK_HREFS[i]}>
                <Link to={QUICK_HREFS[i]}>{label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="footer__col">
          <h4>{f.coursesCol}</h4>
          <ul>
            {courses.map((c, i) => {
              const label = t.courses.items[i]?.title || c.title;
              return (
                <li key={c.title}>
                  <Link to="/#courses">{label}</Link>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="footer__col">
          <h4>{f.contact}</h4>
          <ul className="footer__contact">
            <li><a href={'mailto:' + site.email}>{site.email}</a></li>
            <li><a href={'tel:' + site.phoneHref}>{site.phoneDisplay}</a></li>
            <li>
              <a href={'https://wa.me/' + site.whatsapp} target="_blank" rel="noopener noreferrer">
                {f.whatsapp}
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
          <p>Copyright &copy; {new Date().getFullYear()} {site.name} Academy. {f.rights}</p>
          <p>
            <Link to="/privacy">{f.privacy}</Link> &middot; <Link to="/#contact">{f.contact}</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
