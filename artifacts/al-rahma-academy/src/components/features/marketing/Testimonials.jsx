/*
 * Trust/marketing remediation: this section used to render six fabricated
 * student reviews (TESTIMONIALS from src/data/marketing/socialProof.js,
 * paired with fabricated quotes from src/i18n/content.js's
 * TESTIMONIAL_TEXT) plus three fabricated "video testimonial" cards
 * (Ahmed/Fatima/the Johnson family) and a false "✓ Verified" badge — none
 * of it backed by a real review, a real video, or a real verification
 * process. The original code comment on socialProof.js labelled this data
 * "PLACEHOLDER demo data" and warned that publishing it violates
 * FTC/CAP/EU consumer-protection rules.
 *
 * The fabricated data has been deleted from source (see
 * docs/trust-marketing-remediation.md), not merely hidden behind a flag,
 * so there is nothing left to flip back on. This component renders
 * nothing until real, permission-cleared student testimonials are
 * collected and wired to a genuine data source — at which point it should
 * be rebuilt to read from that source instead of a hardcoded array.
 */
export default function Testimonials() {
  return null;
}
