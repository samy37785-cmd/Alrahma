// Trust/marketing remediation: these four figures ("5+ years", "10+
// tutors", "500+ students", "9,000+ teaching hours") had no source in this
// repo — no founding-date record, no roster, no lesson log — and were
// inconsistent with the different unsupported numbers used for the same
// claims elsewhere on the site (32 tutors on Home/Pricing, 1,200+ students
// in the founder story below). `value` is rendered as-is in every language
// (About.jsx does not localize it), so it must stay non-numeric AND
// language-neutral — see docs/trust-marketing-remediation.md.
export const stats = [
  { value: '✓', label: 'Years of experience' },
  { value: '✓', label: 'Qualified tutors' },
  { value: '✓', label: 'Happy students' },
  { value: '✓', label: 'Teaching hours' },
];



export const values = [
  { icon: 'M', title: 'Moderation',     desc: 'We present Islam in its true balanced form — inclusive, welcoming and free from extremism, suitable for Muslim communities living in the West.' },
  { icon: 'A', title: 'Authenticity',   desc: 'Every tutor holds a verified Ijazah with a chain of knowledge traced back to the Prophet. Our curriculum is rooted in traditional, authentic scholarship.' },
  { icon: 'C', title: 'Contemporary',   desc: 'We combine centuries-old Islamic scholarship with modern online technology to deliver world-class Quranic education directly to your home.' },
  { icon: 'R', title: 'Responsibility', desc: 'Every teacher is personally accountable for the progress, wellbeing and Islamic development of each student entrusted to their care.' },
  { icon: 'E', title: 'Excellence',     desc: 'We set high academic standards and continuously raise the quality of our teaching, drawing on the best Egyptian scholarly tradition.' },
  { icon: 'T', title: 'Transparency',   desc: 'Families receive honest, regular progress reports and open communication throughout the learning journey — no hidden fees, no surprises.' },
];

