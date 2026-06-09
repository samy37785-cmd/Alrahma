export default function Hero() {
  return (
    <section className="hero">
      <div className="container hero__inner">
        <div className="hero__text">
          <p className="eyebrow">Quran • Arabic • Islamic Studies</p>
          <h1>Learn the Quran Online</h1>
          <p className="hero__sub">
            The best online Quran and Arabic academy for children and adults — taught
            one-to-one by qualified native tutors, anytime that suits you.
          </p>
          <div className="hero__actions">
            <a href="#trial" className="btn btn--gold">
              Book a Free Trial
            </a>
            <a href="#courses" className="btn btn--ghost">
              Browse Our Courses
            </a>
          </div>
          <ul className="hero__badges">
            <li>✓ 2 Free trial lessons</li>
            <li>✓ Available 24/7</li>
            <li>✓ Female tutors available</li>
          </ul>
        </div>
        <div className="hero__art" aria-hidden="true">
          <div className="hero__card">
            <span className="hero__arabic">ٱقْرَأْ</span>
            <p>“Read in the name of your Lord who created.”</p>
            <small>Surah Al-‘Alaq · 96:1</small>
          </div>
        </div>
      </div>
    </section>
  );
}
