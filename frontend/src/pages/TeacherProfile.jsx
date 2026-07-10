import { useParams, useNavigate, Link } from 'react-router-dom';
import Header from '../components/layout/Header';
import Footer from '../components/layout/Footer';
import useSEO from '../hooks/useSEO';
import Breadcrumbs from '../components/ui/Breadcrumbs';
import { TEACHERS, TEACHER_CREDENTIALS } from '../data';
import { useLang } from '../context/LangContext';

const FLAG = { en:'🇬🇧', ar:'🇪🇬', it:'🇮🇹', fr:'🇫🇷', de:'🇩🇪', es:'🇪🇸' };
const LANG_LABEL = { en:'English', ar:'Arabic', it:'Italian', fr:'French', de:'German', es:'Spanish' };

// This page's teacher directory (data/teachers.js) is static marketing
// content — editorial bios, credentials and rating/review-count numbers with
// no corresponding real account in the database (unlike the real Review
// system, which operates on actual User/Course documents — see
// Dashboard.jsx's TutorReviewWidget for the real, backend-connected
// equivalent). This static rating display used to also let any visitor
// "rate" the teacher via a button that only wrote to their own browser's
// localStorage and recomputed a fake average never seen by anyone else —
// removed as misleading; this now shows only the honest editorial figures.
function TeacherRating({ teacher }) {
  const { t } = useLang();
  const tp = t.tp;
  const filled = Math.round(teacher.rating);

  return (
    <div className="tp__rating">
      <div className="tp__stars">
        {[1,2,3,4,5].map((s) => (
          <span key={s} className={`tp__star${s <= filled ? ' on' : ''}`}>★</span>
        ))}
      </div>
      <span className="tp__avg">{teacher.rating.toFixed(1)}</span>
      <span className="tp__cnt">({teacher.reviews} {tp.reviews})</span>
    </div>
  );
}

export default function TeacherProfile() {
  const { id }   = useParams();
  const navigate = useNavigate();
  const { lang, t } = useLang();
  const tp = t.tp;
  const teacher  = TEACHERS.find((tc) => tc.id === Number(id));

  const title       = teacher ? (teacher.title[lang]       || teacher.title.en)       : '';
  const bio         = teacher ? (teacher.bio[lang]         || teacher.bio.en)         : '';
  const specialties = teacher ? (teacher.specialties[lang] || teacher.specialties.en) : [];

  useSEO({
    title: teacher ? teacher.nameEn : 'Teacher',
    description: bio,
  });

  if (!teacher) {
    return (
      <>
        <Header />
        <main style={{ padding: '80px 0', textAlign: 'center' }}>
          <h2>{tp.notFound}</h2>
          <Link to="/teachers" className="btn btn--green" style={{ marginTop: '24px' }}>
            {tp.backToAll}
          </Link>
        </main>
        <Footer />
      </>
    );
  }

  const firstName = teacher.nameEn.split(' ')[0];
  const initials  = teacher.nameAr.split(' ').slice(0, 2).map((w) => w[0]).join('');
  const grad      = `linear-gradient(145deg, ${teacher.color}ee, ${teacher.color}99)`;

  return (
    <>
      <Header />
      <main>
        <Breadcrumbs items={[{ label: 'Teachers', to: '/academy/teachers' }, { label: teacher.nameEn }]} />
        {/* Hero */}
        <section className="tp__hero" style={{ background: grad }}>
          <div className="container tp__hero-inner">
            <div className="tp__hero-avatar">
              <span dir="rtl">{initials}</span>
            </div>
            <div className="tp__hero-info">
              <span className="tp__az-badge">{tp.alazharBadge}</span>
              <h1 className="tp__name-ar" dir="rtl">{teacher.nameAr}</h1>
              <p className="tp__name-en">{teacher.nameEn}</p>
              <p className="tp__role">{title}</p>
              <p className="tp__gender">{teacher.gender === 'f' ? tp.femaleBadge : tp.maleBadge}</p>
              <div className="tp__hero-actions">
                <button type="button" className="btn btn--gold btn--lg"
                  onClick={() => navigate(`/enroll?teacher=${teacher.id}`)}>
                  {tp.enrollWith} {firstName} →
                </button>
                <Link to="/teachers" className="btn btn--ghost-white">{tp.allTeachers}</Link>
              </div>
            </div>
          </div>
        </section>

        {/* Stats strip */}
        <div className="tp__strip">
          <div className="container tp__strip-inner">
            <div className="tp__strip-stat">
              <strong>★ {teacher.rating.toFixed(1)}</strong>
              <span>{teacher.reviews} {tp.reviews}</span>
            </div>
            <div className="tp__strip-stat">
              <strong>{teacher.gender === 'f' ? tp.female : tp.male}</strong>
              <span>{tp.instructor}</span>
            </div>
            <div className="tp__strip-stat">
              <strong>{teacher.langs.length}</strong>
              <span>{tp.teachingLangs}</span>
            </div>
            <div className="tp__strip-stat">
              <strong>{specialties.length}</strong>
              <span>{tp.specialties}</span>
            </div>
          </div>
        </div>

        <div className="container tp__body">
          {/* Left column */}
          <div className="tp__left">
            <div className="tp__section">
              <h2>{tp.about} {firstName}</h2>
              <p className="tp__bio">{bio}</p>
            </div>

            <div className="tp__section">
              <h2>{tp.credentials}</h2>
              <ul className="tp__creds">
                {TEACHER_CREDENTIALS.map((c) => (
                  <li key={c.label.en} className="tp__cred">
                    <span className="tp__cred-icon">{c.icon}</span>
                    <span>{c.label[lang] || c.label.en}</span>
                  </li>
                ))}
              </ul>

              {/* Verification proof section */}
              <div className="tp__proof">
                <div className="tp__proof-header">
                  <span className="tp__proof-icon">🔍</span>
                  <strong>Verified Credentials</strong>
                </div>
                <div className="tp__proof-badges">
                  <div className="tp__proof-badge tp__proof-badge--azhar">
                    <span className="tp__proof-badge-seal">الأزهر</span>
                    <div>
                      <strong>Al-Azhar University</strong>
                      <span>Cairo, Egypt — verified graduate</span>
                    </div>
                    <span className="tp__proof-check" aria-label="Verified">✓</span>
                  </div>
                  <div className="tp__proof-badge">
                    <span className="tp__proof-badge-icon">📜</span>
                    <div>
                      <strong>Ijazah Certificate</strong>
                      <span>Continuous sanad to the Prophet ﷺ — on file with academy</span>
                    </div>
                    <span className="tp__proof-check" aria-label="Verified">✓</span>
                  </div>
                  <div className="tp__proof-badge">
                    <span className="tp__proof-badge-icon">🆔</span>
                    <div>
                      <strong>Identity Verified</strong>
                      <span>Government ID verified by Al-Rahma Academy</span>
                    </div>
                    <span className="tp__proof-check" aria-label="Verified">✓</span>
                  </div>
                  <div className="tp__proof-badge">
                    <span className="tp__proof-badge-icon">🧒</span>
                    <div>
                      <strong>Child Safety Cleared</strong>
                      <span>Background check completed — safe to teach minors</span>
                    </div>
                    <span className="tp__proof-check" aria-label="Verified">✓</span>
                  </div>
                </div>
                <p className="tp__proof-note">
                  Copies of all certificates are held securely by Al-Rahma Academy.
                  Parents may request verification by contacting support.
                </p>
              </div>
            </div>

            <div className="tp__section">
              <h2>{tp.specialties}</h2>
              <div className="tp__tags">
                {specialties.map((s) => (
                  <span key={s} className="tp__tag">{s}</span>
                ))}
              </div>
            </div>

            <div className="tp__section">
              <h2>{tp.teachingLangs}</h2>
              <div className="tp__langs">
                {teacher.langs.map((l) => (
                  <div key={l} className="tp__lang">
                    <span className="tp__lang-flag">{FLAG[l]}</span>
                    <span>{LANG_LABEL[l]}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="tp__section">
              <h2>{tp.studentRating}</h2>
              <TeacherRating teacher={teacher} />
            </div>
          </div>

          {/* Right: sticky enroll card */}
          <div className="tp__right">
            <div className="tp__enroll-card">
              <div className="tp__enroll-card-top" style={{ background: grad }}>
                <div className="tp__enroll-avatar">
                  <span dir="rtl">{initials}</span>
                </div>
              </div>
              <div className="tp__enroll-body">
                <h3>{tp.enrollWith} {firstName}</h3>
                <p>{tp.trialDesc}</p>
                <ul className="tp__enroll-perks">
                  {tp.perks.map((perk, i) => <li key={i}>{perk}</li>)}
                </ul>
                <button
                  type="button"
                  className="btn btn--gold btn--block"
                  onClick={() => navigate(`/enroll?teacher=${teacher.id}`)}
                >
                  {tp.startEnroll}
                </button>
                <Link to="/teachers" className="tp__back-link">
                  {tp.browseOthers}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
