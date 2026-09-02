# Trust & Marketing Localization Remediation

Scope: `artifacts/al-rahma-academy`. This document is independent of
`docs/localization-audit.md` (Stage 1 URL/locale work) and was not merged
with it.

This is content-truthfulness remediation, not a legal opinion. Findings
below are described as **Trust/Compliance risk** — a determination of
whether specific past copy violated any consumer-protection law is outside
this document's scope and was not attempted.

## Method

Every finding below was re-derived by reading the source at the task's
starting commit (not carried over from any prior report). For each item we
recorded: the exact text/number, its file, whether it is static, random, or
date/time-derived, whether any real data source (API, backend, database)
feeds it, whether it is on by default, whether the surrounding code already
marks it as placeholder, and every render-time consumer.

## Removed / Hidden

### Fabricated testimonials (§2)
- **`src/data/marketing/socialProof.js`** — `TESTIMONIALS` (six invented
  people with names, locations, flags, avatars, star ratings) and
  `SHOW_TESTIMONIALS` (defaulted `true`). The file's own header comment
  called this data "PLACEHOLDER demo data" and warned that publishing it
  "violates FTC/CAP/EU consumer-protection rules." `HAPPY_STUDENTS`
  (`'1,200+'`) was the CTA-card headline paired with it.
- **`src/i18n/content.js`** — `TESTIMONIAL_TEXT`, six fabricated quotes per
  language (36 strings total) matched 1:1 to the array above, including
  specific invented outcome claims ("memorised her first Juz in 3 months").
- **`src/components/features/marketing/Testimonials.jsx`** — in addition to
  the array-driven carousel, a hardcoded "Watch Real Student Stories" video
  row with three fabricated named story cards ("Ahmad, 9", "Fatima,
  Germany", "the Johnson Family, UK") and a false `✓ Verified` badge on
  every quote card, with no verification process anywhere in the repo.
- Consumers: `Testimonials.jsx` only (rendered from `Home.jsx`).
- **Action**: `TESTIMONIALS`, `SHOW_TESTIMONIALS`, `HAPPY_STUDENTS` and
  `TESTIMONIAL_TEXT` deleted from source (not defaulted to `false` — there
  is no flag left to flip). `Testimonials.jsx` now unconditionally returns
  `null`, with a comment explaining why and what rebuilding it correctly
  would require. `Home.jsx` no longer imports/mounts it (avoids a
  skeleton-then-collapse flash from `DeferredSection`). Section heading is
  gone with it — no orphaned "What Our Students Say" heading over empty
  space.

### Unsupported statistics (§3) — five figures found in eight places
`32` tutors, `4.9★` rating, `9,000+` lessons, `40+` countries and `1,200+`
students/families each had **zero** real source in this repository — no
analytics feed, no CMS, no backend aggregate — and, tellingly, disagreed
with each other from page to page (Home used 32/40+/9,000+/1,200+; the
Teachers page used a completely different 10+/500+/9,000+; the About page
used a third set, 5+/10+/500+/9,000+). The local `TEACHERS` dataset has 10
sample records — per the task brief, that is not evidence the real
commercial count is 10, so no number was substituted for another.
- `src/data/marketing/socialProof.js` — `STATS`/`SHOW_STATS` (StatsBanner).
- `src/components/features/marketing/Hero.jsx` — hardcoded stats bar
  `['9,000+','4.9★','40+','32']` plus a "4.9 / 5" rating pill paired with
  `hero.studentsCount` ("1,200+ students").
- `src/components/features/marketing/TrustBar.jsx` — hardcoded `40+`,
  `1,200+`, `32` in the JSX (independent of socialProof.js).
- `src/components/features/marketing/TrustBadges.jsx` (via `i18n` `trust`
  block) — `32`, `40+` in `trust.items`, plus `trust.countriesLabel`
  ("40+ countries").
- `src/components/layout/Footer.jsx` (via `footer.trustBadges`) — `32`,
  `40+`, `4.9★` badges shown on every page.
- `src/components/features/marketing/Pricing.jsx` — trust-signal row
  fallback strings `'32 Al-Azhar certified tutors'`, `'9,000+ lessons
  delivered'`, `'Students from 40+ countries'`, plus an unrelated
  unsupported "Premium students complete their first Juz 2× faster"
  performance claim.
- `src/components/features/marketing/About.jsx` (via `data/about.js`
  `stats`) — `5+`/`10+`/`500+`/`9,000+`, and a founder-story sentence
  ("over 1,200 families across 40+ countries").
- `src/pages/Teachers.jsx` (via `i18n` `teachersPg.stats`) — a *different*
  `10+`/`500+`/`4.9★`/`9,000+` stats bar, plus "32" hardcoded directly into
  both the English and Arabic SEO `description` strings passed to
  `useSEO()`.
- `src/pages/Home.jsx` — SEO `description` contained "Trusted by 1,200+
  families across Europe."
- **Action**: every number above was deleted, not replaced with a
  different invented number. Where a stat block was *entirely* unsupported
  (StatsBanner, Hero's stats bar, Teachers' stats bar), the whole block was
  hidden. Where a block mixed unsupported numbers with evidenced ones
  (TrustBar, TrustBadges, Footer, Pricing, About), only the unsupported
  entries were de-numbered to a non-numeric marker (`✓`, `Global`) or
  dropped, keeping the evidenced entries (14-day refund, 2-hour response)
  untouched — this also kept grid/flex layouts populated so no visual gap
  was left (About's `.about__stats` is a fixed 2×2 grid; de-numbering all
  four cells instead of removing the block was the only gap-free option).
  A guard test (`trustMarketingI18nGuards.test.jsx`) statically scans every
  file in `components/features/marketing/`, `Home.jsx` and all six locale
  files for these five patterns.

### Synthetic live-activity signals (§4)
- **`src/components/features/marketing/LiveCounter.jsx`** — "N students
  learning right now" from `Math.random()` jitter on an hour-of-day lookup
  table, and "N lessons this month" from `date-of-month × 12`. Sole
  consumer was `JoinCTA.jsx`. Deleted outright (zero consumers after
  `JoinCTA.jsx` was edited); its CSS (`.live-counter*`, `@keyframes
  live-pulse`, `.join-cta__live`) removed with it.
- **`src/components/features/marketing/Hero.jsx`** — a second, independent
  mechanism: `LIVE_ACTIVITY`, eight fabricated named people ("Ahmad from
  Frankfurt just booked a free trial"), cycled via `setInterval` every
  3.8s. Same category of problem as LiveCounter — a fake real-time social
  proof signal — removed along with its `setInterval` effect and CSS
  (`.hero__activity*`, `@keyframes hero-activity-in`; `@keyframes
  pulse-green` was kept, it is still used by `islamic-tools.css`).
- **Not removed / not flagged**: `TrustBar.jsx`'s `useIsBusinessHours()`
  (a WhatsApp "online now" indicator). This is a deterministic function of
  the current time against the *actual documented* business hours in
  `TermsOfService.jsx` §13 (Sat–Thu, 08:00–23:00 Cairo time) — it asserts
  nothing false and matches company policy, so it was kept. This is the
  line this task drew between "fake activity" and "a real business-hours
  clock."

### Artificial pricing urgency (§5)
`Pricing.jsx` — `getNextSundayDeadline()`/`useCountdown()` (a countdown
that reset to "next Sunday" every week, forever, so a "founding-rate offer
ends Sunday" framing was never actually true) and `spotsLeft()`
(`3 + weekNumber % 4` — a deterministic, not random, but equally fake
"spots remaining" figure). Deleted along with the urgency banner and
spots-scarcity UI, their CSS (`.pricing__banner*`, `.pricing__countdown*`,
`.pricing__spots*`, `@keyframes pulse-dot`), and the now-unused i18n keys
`pricing.banner`/`bannerText`/`offerEnds`/`spotsLeft` (all six locales).
Plans, prices, discounts and checkout were not touched.

### Artificial trial scarcity (§6)
`Trial.jsx` — `spotsToday()` (`3 + dayOfMonth % 5`) backing "Only N free
trial spots left this week." Deleted along with the urgency badge and its
CSS (`.trial__urgency*`). The bare, unqualified "🔒 Secure" claim was
replaced with a specific, evidenced privacy claim (see below). "30-minute
session" and "within 2 hours" were **kept** — both are extensively
corroborated elsewhere in this project (see Preserved, below), not
one-off placeholder claims.

### Newsletter unverified offer (§7)
`Newsletter.jsx`'s `GUIDE_BENEFITS` promised "12-page illustrated Tajweed
guide (PDF)," "5 audio pronunciation examples" and a "30-day beginner
memorisation plan." `subscribeNewsletter()` (`src/api/contentApi.js`) only
posts `{ email }` to `/newsletter` — there is no tracked evidence anywhere
in this frontend of a PDF asset, an audio asset, a delivery workflow, or a
download link. The specific claims were replaced with a neutral
description of the newsletter's subject matter (Tajweed tips), the
hardcoded, untranslated "book cover" mockup (implying a specific physical
document) was removed rather than translated into six more copies of an
unverified promise, and the `aria-label="Email"` literal was moved to a
translated `n.emailAriaLabel` key.

## Preserved with evidence

| Claim | Evidence |
|---|---|
| 14-day money-back guarantee | `src/pages/TermsOfService.jsx` §3 ("3. 14-Day Money-Back Guarantee" — full refund within 14 calendar days, 5–10 business day processing) |
| "We'll contact you within 2 hours" (business days) | `TermsOfService.jsx` §13: "Response time: within 2 hours during business days (Sat–Thu, 08:00–23:00 Cairo time)" |
| 30-minute trial session length | Corroborated in `src/data/home.js` (Steps), `src/i18n/content.js` (ToolsHub CTA bullets), `src/i18n/experience.js` (QuickTrialModal/ExitIntentPopup copy in all six languages) — a consistent, established site-wide claim, not an isolated one-off |
| "Two free trial lessons" / "no payment required" | `TermsOfService.jsx` §5 ("New students receive two complimentary trial lessons with no payment required") |
| "Cancel anytime" | `TermsOfService.jsx` §4 |
| GDPR compliance / "we never sell your data" | `TermsOfService.jsx` §10 |
| "Secure payment" (Pricing) | `TermsOfService.jsx` §2 names Stripe/PayPal as the processors; kept as a payment-specific claim rather than the bare, unqualified "Secure" removed from Trial's trust row |
| TrustBar's WhatsApp business-hours indicator | Matches `TermsOfService.jsx` §13's stated hours exactly (Sat–Thu, 08:00–23:00 Cairo, Friday off) |

One internal inconsistency was found and fixed while cross-checking this
table: `TrustBadges.jsx`'s `supportDesc` claimed replies "7 days a week,"
which contradicts the Sat–Thu business days documented in
`TermsOfService.jsx` §13 (Friday off). The "7 days a week" clause was
removed; the 2-hour figure itself was kept as evidenced.

## Unknown — not silently changed

None of these were altered. Each is a judgment call for the product owner,
not a decision this task made unilaterally.

| Claim | Where it appears | Why undecided | Evidence needed | Blocks publish? |
|---|---|---|---|---|
| Al-Azhar tutor certification / Ijazah chain | `Home.jsx` meta, `Hero.jsx`, `TrustBadges.jsx`, `Pricing.jsx`, `TermsOfService.jsx`, `IsnadChain.jsx` (forbidden file), `Teachers.jsx` | The task explicitly disallows editing this institutional claim without independent evidence in the repo; `TermsOfService.jsx` restates it as company policy, but that is self-declaration, not independent verification | A verifiable credentialing/partnership record | Needs product-owner review before being treated as fact in new copy |
| Founding year / "5+ years of experience" | `data/about.js` (now de-numbered) | No incorporation date, changelog, or "founded in" record in the repo | A documented founding date | Low — already de-numbered |
| Phone/address/business identity | `site.js` (WhatsApp number, email) | Out of this task's numeric-claims scope; not evaluated for authenticity | Business registration confirming the number/identity | Not evaluated |
| Real commercial tutor headcount | Everywhere "tutors" appeared with a number | `TEACHERS` dataset has 10 fictional demo records (explicitly commented as fictional in `Teachers.jsx`); this is neither proof of 10 nor of any other number | An actual roster/HR count | Numbers already removed pending this |
| Student/family/lesson/country counts | Everywhere (see table above) | No analytics/CRM source in this repo, and the site's own numbers disagreed with each other across pages | Real analytics or billing aggregate | Numbers already removed pending this |
| Founder identity and personal narrative | `About.jsx` "Why We Built Al-Rahma Academy" (Mahmoud Samy) | Unlike TESTIMONIALS, nothing in the code marks this as placeholder/fabricated; it reads as the company's own about-page copy, which this task treats as an institutional claim, not a marketing number | Confirmation this reflects an actual person/story | Not evaluated; only the embedded "1,200+ families / 40+ countries" figure inside it was removed |
| Newsletter guide delivery | `Newsletter.jsx` (removed) | No tracked delivery mechanism (email template, asset, or workflow) was found; a real one may exist server-side | A visible asset, endpoint, or documented workflow | Copy already neutralized pending this |
| Any Organization JSON-LD claim | `src/utils/schema.js` (forbidden file) | Not read/modified — out of the file allowlist | N/A | Not evaluated |

## Deferred items (out of this task's authorized component list)

Found via the required broad search, but not touched because they live in
components this task was not authorized to edit, or because fixing them
fully is a larger effort than a numeric-claims pass:
- **`src/pages/hubs/ToolsHub.jsx`** (via `i18n/content.js`'s
  `TOOLS_HUB_TEXT`) — the same category of unsupported figures ("2M+
  verses read," "Reply within 2 hours" duplicated, "Join 1,200+ students
  already learning"). `content.js` was deliberately left carrying this
  block; only `TESTIMONIAL_TEXT` was removed from that file.
- **Full translation of `About.jsx`'s founder-story paragraphs** — the
  narrative is hardcoded English only (not run through `i18n`). Only the
  one fabricated-number sentence inside it was fixed; translating a
  multi-paragraph biography into six languages is a content-authoring
  task beyond this remediation's numeric-claims scope (the task brief
  scopes translation work to Trial/Newsletter/Pricing/Home/social-proof
  copy).
- **`Trial.jsx`'s "(WhatsApp preferred)" phone hint** and **TrustBar's
  WhatsApp `aria-label`** — moved into i18n as part of this pass since they
  sat inside files already being edited, but a full literal-by-literal i18n
  audit of every marketing string outside the touched sections was not
  performed.
- Any content inside `backend/` or Supabase — not read, per the task's
  constraints.

## Before / After

| Area | Before | After |
|---|---|---|
| Testimonials | 6 fabricated reviews + 3 fake video-story cards + false "✓ Verified" badge, on by default | Section does not render; nothing to re-enable |
| Stats (all locations) | 32 / 4.9★ / 9,000+ / 40+ / 1,200+, inconsistent across pages | Removed or de-numbered everywhere; evidenced figures (14-day, 2h) kept |
| Live activity | Fake headcount (Math.random) + fake lessons-this-month + fake rotating "Ahmad just booked a trial" ticker | Both removed; real WhatsApp business-hours clock kept |
| Pricing urgency | Countdown to "next Sunday" (resets forever) + fake weekly spots | Removed; plans/prices/CTA unchanged |
| Trial scarcity/SLA | Fake "only N spots this week"; bare "Secure" | Scarcity removed; "Secure" replaced with an evidenced privacy claim; 30-min/2h claims kept (evidenced) |
| Newsletter offer | Specific PDF/audio/day-count promises with no delivery evidence | Neutral description of newsletter content; submit contract unchanged |

## Components deleted vs. hidden, and why

- **Deleted**: `LiveCounter.jsx` — zero consumers remained after `JoinCTA.jsx`
  was edited, and there is no future use for a component whose only job was
  to fabricate a number.
- **Hidden (kept as a file, returns `null`)**: `StatsBanner.jsx`,
  `Testimonials.jsx` — kept as the documented, obvious place to wire up
  real data later, with a comment explaining exactly what that would
  require, rather than deleting a component whose *shape* (a stats grid, a
  testimonial carousel) is still a reasonable product to have once real
  data exists.

## Translation matrix

Languages: en, ar, fr, it, es, de — all six are legally required and all
were edited together for every touched key (never English-only, then
back-filled).

Sections translated/re-verified in this pass: `pricing`, `trial`
(including new `trustRow`/`formTitle`/`formSub`/`privacyNote`/
`fields.phoneHint`), `newsletter` (including new `benefits`/
`emailAriaLabel`), `joinCta` (including new `browseCourses`/`guarantee`),
`trust`, `trustBar` (including new `whatsappStatusAriaLabel`), `hero`
(orphaned keys removed), `footer.trustBadges`, `teachersPg` (orphaned
`stats` removed).

Verification performed (see `src/test/trustMarketingI18nGuards.test.jsx`
and the render tests in the other `trustMarketing*.test.jsx` files):
- **Structural**: every locale has the same key set as `en` for every
  touched section; array lengths match (`trust.items`, `trustBar.badges`,
  `joinCta.stats`, `newsletter.benefits`); no empty-string values.
- **Rendering**: Trial, Newsletter, JoinCTA and Pricing render in all six
  languages with no `undefined` literal, Arabic renders `dir="rtl"`, and
  known English-only literals (placeholder text, aria-labels, guarantee
  strings) do not leak into the five non-English locales.
- **Linguistic quality**: **deferred** — translations were written directly
  in this pass (not machine-translated after the fact) following each
  file's existing tone and terminology, but no separate native-speaker
  review was performed. This applies to the newly-added keys only; it does
  not re-certify translations already present in the codebase.
