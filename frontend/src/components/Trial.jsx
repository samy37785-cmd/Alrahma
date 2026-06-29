import { useState, useEffect } from 'react';
import { site, courseOptions } from '../data';
import { submitTrial } from '../api/client';
import { useTrial } from '../context/TrialContext';
import { useLang } from '../context/LangContext';

const EMPTY = { name: '', email: '', phone: '', course: '', message: '' };

/* Deterministic spots seeded to the current day — cycles 3-7 */
function spotsToday() {
  return 3 + (new Date().getDate() % 5);
}

export default function Trial() {
  const { selectedCourse, selectedPlan } = useTrial();
  const { t } = useLang();
  const tr = t.trial;
  const [form, setForm]           = useState(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError]         = useState('');
  const [sending, setSending]     = useState(false);
  const spots = spotsToday();

  useEffect(() => {
    if (selectedCourse) setForm((prev) => ({ ...prev, course: selectedCourse }));
  }, [selectedCourse]);

  useEffect(() => {
    if (selectedPlan) setForm((prev) => ({ ...prev, message: tr.planMessage.replace('{plan}', selectedPlan) }));
  }, [selectedPlan, tr.planMessage]);

  const options = courseOptions.includes(form.course) || !form.course
    ? courseOptions
    : [form.course, ...courseOptions];

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      await submitTrial(form);
      setSubmitted(true);
      setForm(EMPTY);
      setTimeout(() => setSubmitted(false), 6000);
    } catch (err) {
      if (!err.response || !navigator.onLine) {
        setError('network');
      } else {
        const data = err.response?.data;
        const msg =
          (typeof data === 'object' && data?.message) ||
          (err.response?.status >= 500 ? tr.errorServer : tr.errorGeneric);
        setError(msg);
      }
    } finally {
      setSending(false);
    }
  };

  const waText   = encodeURIComponent('Hi! I\'m interested in ' + (form.course || 'a course') + '. My name is ' + form.name + '.');
  const mailBody = encodeURIComponent('Name: ' + form.name + '\nEmail: ' + form.email + '\nPhone: ' + form.phone + '\nCourse: ' + form.course + '\nMessage: ' + form.message);

  return (
    <section className="trial" id="trial">
      <div className="container trial__inner">

        {/* ── Left: value copy ── */}
        <div className="trial__text">
          {/* Urgency badge */}
          <div className="trial__urgency">
            <span className="trial__urgency-dot" aria-hidden="true" />
            Only <strong>{spots} free trial spots</strong> left this week
          </div>

          <p className="eyebrow">{tr.eyebrow}</p>
          <h2>{tr.heading}</h2>
          <p>{tr.sub}</p>

          <ul className="trial__list">
            {tr.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>

          {/* Trust mini-row */}
          <div className="trial__trust-row">
            <span>🔒 Secure</span>
            <span>⏱️ 30-min session</span>
            <span>✓ No commitment</span>
          </div>

          <p className="trial__whats">
            {tr.waLabel}{' '}
            <a href={'https://wa.me/' + site.whatsapp} target="_blank" rel="noopener noreferrer">
              {tr.waLink} {site.whatsappDisplay}
            </a>
          </p>
        </div>

        {/* ── Right: form ── */}
        <form className="trial__form" onSubmit={handleSubmit} noValidate>

          {/* Form header with guarantee */}
          <div className="trial__form-head">
            <h3 className="trial__form-title">Book your free lesson</h3>
            <p className="trial__form-sub">We'll contact you within 2 hours to schedule.</p>
          </div>

          <div className="field">
            <label htmlFor="name">{tr.fields.name}</label>
            <input
              type="text"
              id="name"
              name="name"
              placeholder={tr.placeholders.name}
              value={form.name}
              onChange={handleChange}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="email">{tr.fields.email}</label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder={tr.placeholders.email}
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="phone">
              {tr.fields.phone}
              <span style={{ fontWeight: 400, color: 'var(--text-secondary)', marginLeft: 4 }}>(WhatsApp preferred)</span>
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              placeholder={tr.placeholders.phone}
              value={form.phone}
              onChange={handleChange}
            />
          </div>
          <div className="field">
            <label htmlFor="course">{tr.fields.course}</label>
            <select id="course" name="course" value={form.course} onChange={handleChange}>
              <option value="">{tr.placeholders.course}</option>
              {options.map((opt) => (
                <option key={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="message">{tr.fields.message}</label>
            <textarea
              id="message"
              name="message"
              rows="3"
              placeholder={tr.placeholders.message}
              value={form.message}
              onChange={handleChange}
            />
          </div>

          <button type="submit" className="btn btn--gold btn--block" disabled={sending} aria-busy={sending}>
            {sending ? tr.sending : tr.submit}
          </button>

          {/* Privacy micro-copy */}
          <p className="trial__privacy">
            🔒 We never share your data. No spam, ever.
          </p>

          {submitted && (
            <p className="form-note">{tr.success}</p>
          )}

          {error === 'network' && (
            <div className="form-note form-note--error" role="alert">
              <p>{tr.errorOffline}</p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                <a
                  href={'https://wa.me/' + site.whatsapp + '?text=' + waText}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn--green"
                  style={{ fontSize: '0.9rem', padding: '10px 20px' }}
                >
                  {tr.whatsappBtn}
                </a>
                <a
                  href={'mailto:' + site.email + '?subject=Free Trial Request&body=' + mailBody}
                  className="btn btn--ghost"
                  style={{ fontSize: '0.9rem', padding: '10px 20px' }}
                >
                  {tr.emailBtn}
                </a>
              </div>
            </div>
          )}
          {error && error !== 'network' && (
            <p className="form-note form-note--error" role="alert">{error}</p>
          )}
        </form>

      </div>
    </section>
  );
}
