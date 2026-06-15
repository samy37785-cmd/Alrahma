import { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import useSEO from '../hooks/useSEO';

/* ─── Teacher data ───────────────────────────────────────────────── */
const TEACHERS = [
  {
    id: 1,
    nameAr: 'سامي محمود عبد العال',
    nameEn: 'Sami Mahmoud Abd Al-Aal',
    gender: 'm',
    title: 'Quran & Tajweed Specialist',
    specialties: ['Tajweed (Hafs & Warsh)', 'Quran Memorization', 'Ijazah Programme', 'Quranic Tafsir'],
    rating: 4.9, reviews: 84,
    color: '#0b6e4f',
  },
  {
    id: 2,
    nameAr: 'محمد عبد المقصود',
    nameEn: 'Muhammad Abd Al-Maqsoud',
    gender: 'm',
    title: 'Islamic Studies & Fiqh Instructor',
    specialties: ['Islamic Jurisprudence (Fiqh)', 'Prophetic Seerah', 'Arabic Language', 'Quranic Tafsir'],
    rating: 4.8, reviews: 62,
    color: '#1a5fa0',
  },
  {
    id: 3,
    nameAr: 'خيرية المحمدي',
    nameEn: 'Khairiyya Al-Muhammadi',
    gender: 'f',
    title: 'Female Quran Instructor for Children',
    specialties: ['Noorani Qaida', 'Quran for Children', 'Tajweed (Hafs)', 'Arabic Alphabet'],
    rating: 5.0, reviews: 73,
    color: '#7a3a8a',
  },
  {
    id: 4,
    nameAr: 'أمنية عبد الله',
    nameEn: 'Omnia Abd Allah',
    gender: 'f',
    title: 'Quran Memorization & Hifz Coach',
    specialties: ['Hifz Programme', "Revision (Muraja'a)", 'Tajweed (Hafs & Warsh)', 'Prophetic Seerah'],
    rating: 4.9, reviews: 57,
    color: '#c07020',
  },
  {
    id: 5,
    nameAr: 'عبد الله أيمن',
    nameEn: 'Abd Allah Ayman',
    gender: 'm',
    title: 'Arabic Language Specialist',
    specialties: ['Classical Arabic (Fusha)', 'Arabic Grammar (Nahw)', 'Quranic Arabic', 'Islamic Studies'],
    rating: 4.8, reviews: 49,
    color: '#2a7a50',
  },
  {
    id: 6,
    nameAr: 'محمود سامي',
    nameEn: 'Mahmoud Sami',
    gender: 'm',
    title: 'Tafsir & Aqeedah Instructor',
    specialties: ['Quranic Tafsir', 'Islamic Creed (Aqeedah)', 'Tajweed (Warsh)', 'Islamic Jurisprudence'],
    rating: 4.9, reviews: 66,
    color: '#a03030',
  },
  {
    id: 7,
    nameAr: 'آية',
    nameEn: 'Aya',
    gender: 'f',
    title: 'Quran & Ijazah Instructor',
    specialties: ['Ijazah Programme', 'Tajweed (Hafs & Warsh)', 'Quran Memorization', 'Arabic Language'],
    rating: 4.9, reviews: 38,
    color: '#5a6a9a',
  },
];

const CREDENTIALS = [
  { icon: '🎓', label: 'Al-Azhar University Graduate' },
  { icon: '📜', label: 'Ijazah with Connected Sanad' },
  { icon: '📖', label: 'Arabic Language & Translation (B.A.)' },
  { icon: '⚖️', label: 'Expert in Islamic Jurisprudence' },
];

/* ─── Star rating input ──────────────────────────────────────────── */
function StarInput({ value, onRate }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="tc__stars-input">
      {[1, 2, 3, 4, 5].map((s) => (
        <button
          key={s}
          className={`tc__star-btn${(hover || value) >= s ? ' filled' : ''}`}
          onMouseEnter={() => setHover(s)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onRate(s)}
          aria-label={`Rate ${s} star${s > 1 ? 's' : ''}`}
          type="button"
        >★</button>
      ))}
    </div>
  );
}

/* ─── Teacher card ───────────────────────────────────────────────── */
function TeacherCard({ t }) {
  const [myRating, setMyRating] = useState(
    () => Number(localStorage.getItem(`tc-rating-${t.id}`) || 0)
  );
  const [thanks, setThanks] = useState(false);

  const handleRate = (n) => {
    setMyRating(n);
    localStorage.setItem(`tc-rating-${t.id}`, String(n));
    setThanks(true);
    setTimeout(() => setThanks(false), 2200);
  };

  const totalReviews = t.reviews + (myRating ? 1 : 0);
  const displayRating = myRating
    ? ((t.rating * t.reviews + myRating) / totalReviews).toFixed(1)
    : t.rating.toFixed(1);
  const stars = Math.round(Number(displayRating));

  const initials = t.nameAr.split(' ').slice(0, 2).map((w) => w[0]).join('');

  return (
    <div className="tc__card">
      {/* Top: avatar + name */}
      <div className="tc__top">
        <div className="tc__avatar" style={{ background: t.color }}>
          <span className="tc__avatar-text">{initials}</span>
          {t.gender === 'f' && <span className="tc__avatar-f">♀</span>}
        </div>
        <div className="tc__meta">
          <h3 className="tc__name-ar" dir="rtl">{t.nameAr}</h3>
          <p className="tc__name-en">{t.nameEn}</p>
          <p className="tc__role">{t.title}</p>
        </div>
      </div>

      {/* Credentials */}
      <ul className="tc__creds">
        {CREDENTIALS.map((c) => (
          <li key={c.label} className="tc__cred">
            <span className="tc__cred-icon">{c.icon}</span>
            <span>{c.label}</span>
          </li>
        ))}
      </ul>

      {/* Specialties */}
      <div className="tc__tags">
        {t.specialties.map((s) => (
          <span key={s} className="tc__tag">{s}</span>
        ))}
      </div>

      {/* Rating display */}
      <div className="tc__rating-row">
        <div className="tc__stars-disp">
          {[1, 2, 3, 4, 5].map((s) => (
            <span key={s} className={`tc__star-d${s <= stars ? ' on' : ''}`}>★</span>
          ))}
        </div>
        <span className="tc__rating-val">{displayRating}</span>
        <span className="tc__rating-ct">({totalReviews} reviews)</span>
      </div>

      {/* Interactive rating */}
      <div className="tc__rate-area">
        <p className="tc__rate-lbl">{myRating ? 'Your rating:' : 'Rate this teacher:'}</p>
        <div className="tc__rate-row">
          <StarInput value={myRating} onRate={handleRate} />
          {thanks && <span className="tc__thanks">✓ Thank you!</span>}
        </div>
      </div>

      <a href="/#trial" className="tc__book-btn">Book a Free Trial</a>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────── */
export default function Teachers() {
  useSEO({
    title: 'Our Teachers — Al-Rahma Academy',
    description: 'Meet our qualified Al-Azhar certified Quran and Arabic tutors. All teachers hold an Ijazah and specialise in Tajweed (Hafs & Warsh), Tafsir, Hifz, Seerah and Islamic Studies.',
  });

  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="tc__hero">
          <div className="container tc__hero-inner">
            <p className="eyebrow">Meet the team</p>
            <h1>Our Qualified Instructors</h1>
            <p className="tc__hero-sub">
              Every teacher at Al-Rahma Academy is a verified graduate of
              Al-Azhar University, holding an authentic Ijazah with an unbroken
              chain of narration (Sanad). Our instructors specialise in Tajweed
              (Hafs &amp; Warsh), Tafsir, Hifz, Arabic Language, Islamic
              Jurisprudence and Prophetic Seerah.
            </p>
            <div className="tc__hero-badges">
              <span>🎓 Al-Azhar Certified</span>
              <span>📜 Ijazah Holders</span>
              <span>🕌 10+ Qualified Tutors</span>
              <span>🌍 Teaching in 40+ Countries</span>
            </div>
          </div>
        </section>

        {/* Shared credentials bar */}
        <div className="tc__creds-bar">
          <div className="container tc__creds-bar-inner">
            {CREDENTIALS.map((c) => (
              <div key={c.label} className="tc__cred-bar-item">
                <span className="tc__cred-bar-icon">{c.icon}</span>
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Teachers grid */}
        <section className="tc__section">
          <div className="container">
            <div className="tc__grid">
              {TEACHERS.map((t) => <TeacherCard key={t.id} t={t} />)}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="tc__cta">
          <div className="container tc__cta-inner">
            <h2>Start your Quran journey today</h2>
            <p>Book two free trial lessons and meet your teacher — no payment required.</p>
            <a href="/#trial" className="btn btn--gold">Book Your Free Trial</a>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
