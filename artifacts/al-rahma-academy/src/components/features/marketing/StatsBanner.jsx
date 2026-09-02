/*
 * Trust/marketing remediation: this banner used to animate four numbers —
 * "32 Al-Azhar tutors", "4.9★", "9,000+ lessons", "40+ countries" — pulled
 * from src/data/marketing/socialProof.js. None of those figures had a real
 * data source in this repository (see that file's header comment and
 * docs/trust-marketing-remediation.md), so the numbers were deleted rather
 * than kept behind a togglable flag.
 *
 * This component is kept (instead of deleted outright) as the documented
 * place to re-enable a real stats banner once genuine, sourced figures
 * exist — at which point it should read them from an actual data source,
 * not typed-in constants. Until then it renders nothing.
 */
export default function StatsBanner() {
  return null;
}
