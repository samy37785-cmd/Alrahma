import { useState, useEffect } from 'react';
import { site, courseOptions } from '../data';
import { submitTrial } from '../api/client';
import { useTrial } from '../context/TrialContext';

const EMPTY = { name: '', email: '', phone: '', course: '', message: '' };

export default function Trial() {
  const { selectedCourse, selectedPlan } = useTrial();
  const [form, setForm] = useState(EMPTY);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (selectedCourse) {
      setForm((prev) => ({ ...prev, course: selectedCourse }));
    }
  }, [selectedCourse]);

  useEffect(() => {
    if (selectedPlan) {
      setForm((prev) => ({ ...prev, message: `I'm interested in the ${selectedPlan} plan.` }));
    }
  }, [selectedPlan]);

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
      if (!err.response) {
        setError('network');
      } else {
        setError(err.response?.data?.message || 'Could not send. Please try again.');
      }
    } finally {
      setSending(false);
    }
  };

  const waText = encodeURIComponent(
    `Hi! I'm interested in ${form.course || 'a course'}. My name is ${form.name}.`
  );
  const mailBody = encodeURIComponent(
    `Name: ${form.name}\nEmail: ${form.email}\nPhone: ${form.phone}\nCourse: ${form.course}\nMessage: ${form.message}`
  );

  return (
    <section className="trial" id="trial">
      <div className="container trial__inner">
        <div className="trial__text">
          <p className="eyebrow">Free trial</p>
          <h2>Book Your 2 Free Trial Lessons</h2>
          <p>
            Fill in the form and our team will contact you to schedule your first lesson. No
            payment required.
          </p>
          <ul className="trial__list">
            <li>✓ No commitment</li>
            <li>✓ Choose your preferred time</li>
            <li>✓ Lessons over Zoom or Skype</li>
          </ul>
          <p className="trial__whats">
            Prefer WhatsApp?{' '}
            <a href={`https://wa.me/${site.whatsapp}`} target="_blank" rel="noopener noreferrer">
              Message us {site.whatsappDisplay}
            </a>
          </p>
        </div>

        <form className="trial__form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input
              type="text"
              id="name"
              name="name"
              placeholder="Your name"
              value={form.name}
              onChange={handleChange}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              type="email"
              id="email"
              name="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone / WhatsApp</label>
            <input
              type="tel"
              id="phone"
              name="phone"
              placeholder="+1 234 567 890"
              value={form.phone}
              onChange={handleChange}
            />
          </div>
          <div className="field">
            <label htmlFor="course">Course of interest</label>
            <select id="course" name="course" value={form.course} onChange={handleChange}>
              <option value="">Select a course</option>
              {options.map((opt) => (
                <option key={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="message">Message (optional)</label>
            <textarea
              id="message"
              name="message"
              rows="3"
              placeholder="Tell us about the student, age, level..."
              value={form.message}
              onChange={handleChange}
            />
          </div>
          <button type="submit" className="btn btn--gold btn--block" disabled={sending}>
            {sending ? 'Sending...' : 'Request Free Trial'}
          </button>
          {submitted && (
            <p className="form-note">
              Thank you! We will be in touch shortly, in shaa Allah.
            </p>
          )}
          {error === 'network' && (
            <div className="form-note form-note--error">
              <p>Server offline — reach us directly:</p>
              <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                <a
                  href={`https://wa.me/${site.whatsapp}?text=${waText}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn--green"
                  style={{ fontSize: '0.9rem', padding: '10px 20px' }}
                >
                  WhatsApp us
                </a>
                <a
                  href={`mailto:${site.email}?subject=Free Trial Request&body=${mailBody}`}
                  className="btn btn--ghost"
                  style={{ fontSize: '0.9rem', padding: '10px 20px' }}
                >
                  Email us
                </a>
              </div>
            </div>
          )}
          {error && error !== 'network' && (
            <p className="form-note form-note--error">{error}</p>
          )}
        </form>
      </div>
    </section>
  );
}
