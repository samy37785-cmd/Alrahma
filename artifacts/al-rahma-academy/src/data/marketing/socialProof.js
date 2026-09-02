/*
 * ⚠️  TRUST / MARKETING REMEDIATION — READ BEFORE RE-ADDING ANYTHING HERE ⚠️
 *
 * This file used to export two things that are now deleted:
 *
 *   STATS / SHOW_STATS        — an animated "32 tutors · 4.9★ · 9,000+
 *                                lessons · 40+ countries" stats banner.
 *                                None of those figures had a real source in
 *                                this repository (no analytics feed, no CMS,
 *                                no backend aggregate) — they were typed in
 *                                by hand and the surrounding comment even
 *                                contradicted the numbers it described.
 *
 *   TESTIMONIALS / SHOW_TESTIMONIALS / HAPPY_STUDENTS
 *                              — six fabricated student reviews (with a
 *                                false "✓ Verified" badge) and a "1,200+
 *                                happy students" headline figure. The
 *                                original comment on this file explicitly
 *                                labelled TESTIMONIALS as "PLACEHOLDER demo
 *                                data" and warned that publishing it
 *                                violates FTC/CAP/EU consumer-protection
 *                                rules.
 *
 * Both were removed from source — not just toggled off — because a boolean
 * flag someone can flip back to `true` is not a guard against republishing
 * fabricated numbers/testimonials. See
 * docs/trust-marketing-remediation.md for the full evidence trail and what
 * would need to exist (a real reviews pipeline, a real analytics/roster
 * source) before this file gets real exports again.
 *
 * StatsBanner.jsx and Testimonials.jsx have been deleted outright (an
 * integration review found they'd been left as dormant null-returning
 * components - dead code is not a safe feature-flag system). Rebuilding
 * either one means starting fresh from a real data source, not restoring
 * these files. src/test/trustMarketingContent.test.jsx guards against this
 * file growing new hardcoded numbers/testimonials without evidence.
 */
export {};
