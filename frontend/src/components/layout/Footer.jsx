import { Link } from "react-router-dom";
import Brand from "./Brand";
import { useLang } from "../../context/LangContext";
import { site, socials } from "../../data";
import { ShieldIcon, BookOpenIcon, GlobeIcon, StarIcon, CalendarIcon } from '../ui/Icons';

const TRUST_BADGES = [
  { Icon: ShieldIcon,   label: '14-Day Money-Back Guarantee' },
  { Icon: BookOpenIcon, label: '32 Al-Azhar Certified Tutors' },
  { Icon: GlobeIcon,    label: 'Students from 40+ Countries' },
  { Icon: StarIcon,     label: '4.9★ Average Rating' },
  { Icon: CalendarIcon, label: 'Reply within 2 hours' },
];

export default function Footer() {
  const { t } = useLang();
  const f = t.footer;

  return (
    <footer className="footer" id="contact">

      {/* Trust badges strip */}
      <div className="footer__trust" aria-label="Trust credentials">
        {TRUST_BADGES.map(({ Icon, label }) => (
          <span key={label} className="footer__trust-badge">
            <Icon size={16} aria-hidden="true" />
            {label}
          </span>
        ))}
      </div>

      <div className="container footer__grid">

        {/* Brand + contact */}
        <div className="footer__col">
          <Brand light />
          <p className="footer__about">{f.about}</p>
          <ul className="footer__contact">
            <li><a href={"mailto:" + site.email}>{site.email}</a></li>
            <li>
              <a href={"https://wa.me/" + site.whatsapp} target="_blank" rel="noopener noreferrer">
                {f.whatsapp} — {site.whatsappDisplay}
              </a>
            </li>
            <li className="footer__support-hours">
              <span>Support: Sat–Thu · 08:00–23:00 (Cairo)</span>
              <span className="footer__response-badge">Reply ≤ 2h</span>
            </li>
          </ul>
          <div className="footer__social">
            {socials.map((s) => (
              <a key={s.label} href={s.href} aria-label={s.label} title={s.label} target="_blank" rel="noopener noreferrer">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d={s.svg} />
                </svg>
              </a>
            ))}
          </div>
        </div>

        {/* Courses */}
        <div className="footer__col">
          <h3>{f.coursesCol}</h3>
          <ul>
            <li><Link to="/courses">{f.allCourses}</Link></li>
            <li><Link to="/courses/quran">{f.quranTajweed}</Link></li>
            <li><Link to="/courses/quran">{f.hifzMem}</Link></li>
            <li><Link to="/courses/ijazah">{f.quranIjazah}</Link></li>
            <li><Link to="/courses/islamic-studies">{f.islamicStudies}</Link></li>
            <li><Link to="/courses/arabic">{f.arabicAlphabet}</Link></li>
          </ul>
        </div>

        {/* Tools */}
        <div className="footer__col">
          <h3>{f.toolsCol}</h3>
          <ul>
            <li><Link to="/tools">{f.allTools}</Link></li>
            <li><Link to="/tools/quran-reader">{f.quranReader}</Link></li>
            <li><Link to="/tools/adhkar">{f.adhkarLink}</Link></li>
            <li><Link to="/tools/hadith">{f.hadithLibLink}</Link></li>
            <li><Link to="/tools/prayer">{f.prayerLink}</Link></li>
          </ul>
        </div>

        {/* Resources & Academy */}
        <div className="footer__col">
          <h3>{f.resourcesCol}</h3>
          <ul>
            <li><Link to="/resources/blog">{f.blogLink}</Link></li>
            <li><Link to="/resources/faq">{f.faqLink}</Link></li>
            <li><Link to="/enroll">{f.freeTrialLink}</Link></li>
          </ul>
          <h3 style={{ marginTop: "1.2rem" }}>{f.academyCol}</h3>
          <ul>
            <li><Link to="/academy/about">{f.aboutUs}</Link></li>
            <li><Link to="/academy/teachers">{f.teachersLink}</Link></li>
            <li><Link to="/academy/privacy">{f.privacy}</Link></li>
            <li><Link to="/academy/terms">Terms of Service</Link></li>
            <li><Link to="/academy/refund-policy">🛡️ Refund Policy</Link></li>
          </ul>
        </div>

      </div>

      <div className="footer__bottom">
        <div className="container">
          <p>Copyright &copy; {new Date().getFullYear()} {site.name} Academy. {f.rights}</p>
          <p>
            <Link to="/academy/privacy">{f.privacy}</Link>
            {" · "}
            <Link to="/academy/terms">Terms</Link>
            {" · "}
            <Link to="/academy/refund-policy">Refund Policy</Link>
            {" · "}
            <a href={"mailto:" + site.email}>{f.contact}</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
