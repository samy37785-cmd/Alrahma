// Trust/marketing remediation: the previous four figures ("5+ years", "10+
// tutors", "500+ students", "9,000+ teaching hours") had no source in this
// repo and were replaced with non-numeric checkmarks (see
// docs/trust-marketing-remediation.md). The Content Truth Contract task
// (dated 2026-09-02) replaces those checkmarks with the owner-confirmed
// cumulative figures below, sourced from siteFacts.js — the single source
// for these numbers, never duplicated as separate literals. `value` is
// rendered as-is in every language (About.jsx does not localize it); the
// per-language label text comes from i18n `about.statsLabel` instead.
import { siteFacts } from './siteFacts';

export const stats = [
  { value: siteFacts.totalLessons, label: 'Lessons taught' },
  { value: String(siteFacts.totalTeachers), label: 'Teachers' },
  { value: siteFacts.totalStudents, label: 'Students' },
  { value: `${siteFacts.academyRating}/${siteFacts.academyRatingOutOf}`, label: 'Academy rating' },
];



export const values = [
  { icon: 'M', title: 'Moderation',     desc: 'We present Islam in its true balanced form — inclusive, welcoming and free from extremism, suitable for Muslim communities living in the West.' },
  { icon: 'A', title: 'Authenticity',   desc: 'Every tutor holds a verified Ijazah with a chain of knowledge traced back to the Prophet. Our curriculum is rooted in traditional, authentic scholarship.' },
  { icon: 'C', title: 'Contemporary',   desc: 'We combine centuries-old Islamic scholarship with modern online technology to deliver world-class Quranic education directly to your home.' },
  { icon: 'R', title: 'Responsibility', desc: 'Every teacher is personally accountable for the progress, wellbeing and Islamic development of each student entrusted to their care.' },
  { icon: 'E', title: 'Excellence',     desc: 'We set high academic standards and continuously raise the quality of our teaching, drawing on the best Egyptian scholarly tradition.' },
  { icon: 'T', title: 'Transparency',   desc: 'Families receive honest, regular progress reports and open communication throughout the learning journey — no hidden fees, no surprises.' },
];

