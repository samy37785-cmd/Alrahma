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
- ~~**`src/pages/hubs/ToolsHub.jsx`**~~ — **CLOSED** by the integration
  review (`docs/stage1-trust-integration-review.md`): the six per-tool
  usage figures and the "Join 1,200+ students" line were removed from
  `TOOLS_HUB_TEXT` in all six languages, following the same
  delete-outright precedent already used for `TrustBar`'s "40+
  countries"/"1,200+ active students." The duplicated "Reply within 2
  hours" line was left in place — it matches the evidenced 2-hour claim
  documented above (`TermsOfService.jsx` §13 / `TrustBar`'s WhatsApp
  business-hours mechanism), not a new unsupported figure.
- **`src/pages/Enroll.jsx`** — found and **CLOSED** by the same
  integration review: a hardcoded (English-only, not run through i18n),
  fabricated named testimonial ("Fatima K., Manchester") plus three
  unsupported statistics (500+ families, 40+ countries, 4.9★) in a
  "trust strip" on the actual enrollment/checkout page. This page was
  outside this branch's diff entirely, so the remediation pass never saw
  it. Removed outright, same as the equivalent content everywhere else.
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
- **Update (integration review, see `docs/stage1-trust-integration-review.md`)**:
  `StatsBanner.jsx` and `Testimonials.jsx` were originally kept as
  null-returning files "as the documented, obvious place to wire up real
  data later." A later integration review found this was the same
  dead-code-as-feature-flag pattern being guarded against elsewhere:
  `Testimonials.jsx` already had zero real consumers (already decoupled
  from `Home.jsx`), and `StatsBanner.jsx` was still actively imported and
  rendered from `Home.jsx` despite doing nothing. Both files have since
  been deleted outright; `StatsBanner`'s import/render was removed from
  `Home.jsx` first. Rebuilding either one means starting fresh from a real
  data source, not restoring these files.

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

## Update 2026-09-02 — Content Truth Contract pass

A later, separate task ("Authoritative Content Truth Contract") on the same
branch (`fix/stage-02c-final-user-admin-closure`, starting from HEAD
`35d6cc69dda165c9fb82c45f5c518508da871172`, tag
`checkpoint/stage1-trust-integrated`) closed several items that this
document's "Unknown — not silently changed" register above had left open.
This section records what changed; the register above is left as originally
written since it is an accurate account of that earlier pass's own findings.
Every fact below was **owner-supplied**, not independently re-verified by
either agent session — the standing rule throughout was never to invent or
guess a number.

- **Student/family/lesson/teacher/country counts**: owner confirmed
  15,000+ lessons, 1,500+ students, 1,200+ families, 30 teachers, 10
  countries, 4.9/5 academy rating. Centralized in a new
  `src/data/siteFacts.js` module (re-exported from `src/data/index.js`) so
  these numbers are set in exactly one place; applied to `About.jsx`
  (`data/about.js` stats), `Home.jsx`'s SEO description, and the footer/
  trust-bar copy that previously carried de-numbered placeholders.
- **Real commercial tutor headcount**: owner confirmed 30 teachers total.
  The local `TEACHERS` dataset still holds only 10 profile records — this
  gap was **not** closed (fabricating 20 more profiles is outside a
  content-correction task's scope) and remains an open item for whoever
  owns the teacher roster next.
- **Trial offer**: corrected from the "two free trial lessons"/"30-minute
  session" claim (kept in the original pass on the belief it was
  corroborated site-wide) to the owner-confirmed **one free 60-minute
  trial lesson**, across all six languages and every page that referenced
  it (Hero, Trial, ToolsHub, QuickTrialModal, ExitIntentPopup, FAQ, Steps,
  course pages, Dashboard onboarding).
- **Refund policy**: the "14-Day Money-Back Guarantee...full refund...
  automatic" framing (preserved in the original pass under "Preserved with
  evidence," sourced from `TermsOfService.jsx` §3) was itself an
  overstatement the owner corrected: refunds are a **24-day window** a
  customer **may request**, never automatic or unconditional. Updated in
  `RefundPolicy.jsx` and `TermsOfService.jsx` (both `lastUpdated` bumped),
  `TrustBar.jsx`, `Billing.jsx`, `JoinCTA.jsx`, and `footer.trustBadges`
  across all six languages.
- **Support response time**: "within 2 hours during business days" (also
  listed under "Preserved with evidence") corrected to the owner-confirmed
  **within 24 hours**. The adjacent Sat–Thu business-hours schedule
  (`TrustBar.jsx`'s `useIsBusinessHours()`, `footer.supportHours`) is a
  distinct, still-accurate concept and was deliberately left unchanged —
  a maximum-response-time commitment and a staffed-hours schedule are not
  the same claim.
- **Teacher-level rating/reviews/hours** (`src/data/marketing/teachers.js`):
  every fabricated per-teacher `rating` value was deleted outright, never
  replaced with any invented number. `reviews` counts were reconciled
  against 11 owner-supplied per-teacher figures using strict name-matching
  (no guessing on ambiguous matches — see this task's own final report for
  the full mapping table and the two names left unresolved). The
  `hours`-labelled placeholder (rendered literally as "⏱ N hrs," itself a
  unit the placeholder didn't actually represent) was removed for every
  teacher except one (Sami), for whom the owner confirmed 2,500 lessons —
  added as a new `lessons` field rather than reusing `hours`, since reusing
  a UI-labelled field for a different unit would itself have been a factual
  misstatement. Two names were deliberately left unresolved per explicit
  instruction never to guess: teacher id=6 "Mahmoud Sami" against founder
  "Mahmoud Samy" (a name collision, not assumed to be the same or different
  person), and an owner-reported "2,400 lessons" figure against an
  approximately-named teacher (not assigned to any profile).
- **Al-Azhar / accreditation**: instructor wording confirmed as "graduates
  of Al-Azhar" — the owner did **not** confirm any official
  academy-to-Al-Azhar accreditation or partnership, so no institutional
  partnership claim was added; this stays an individual-credential
  statement, matching what the original pass's Unknown Register already
  cautioned against overstating.
- **Founder / founding year / phone / address**: founder name confirmed as
  Mahmoud Samy (unrelated to the teacher-name-collision question above);
  founding year preserved as-is (owner did not request a change); phone
  number confirmed publicly displayable; **street/postal address confirmed
  NOT public** — the `PostalAddress` block was removed from the
  Organization JSON-LD in `index.html`, `foundingDate`/`telephone` kept.
- **Marketing badges**: the unconditional "GDPR" seal/badge removed from
  `TrustBadges.jsx` and `Pricing.jsx` (the legitimate GDPR clause and
  section heading in `TermsOfService.jsx` — actual legal boilerplate, not a
  marketing badge — were deliberately left unchanged). Bare "100%"/"no
  questions asked" refund language removed from `RefundPolicy.jsx` and
  `TermsOfService.jsx` alongside the refund-window correction above.
- **Standard vs. Premium plan wording**: the owner described a 2-tier
  Standard (2h/week) vs. Premium (4h/week, "twice the weekly lesson time")
  structure. The live site's `Pricing.jsx` uses a different 3-tier
  Noorani/Huffaz/Ijazah structure, and the "2× faster" performance claim
  this document's §3 already flagged and removed does not correspond to
  any currently-live text. No mapping between the owner's description and
  the live plan names was invented; this is flagged as an open question for
  the product owner rather than guessed at.
- Test suite grew from 66 files / 1866 tests (recorded above) to 67 files /
  1890 tests over the course of this pass (new middleware-wiring test file
  plus updated content-truth assertions), full run green.
- The full commit list, per-language before/after values, teacher-mapping
  table, and verification-gate results for this pass are in that task's own
  final report (delivered in the same session, not persisted as a separate
  document here).

## Update 2026-09-02 — Corrective Closure Round 2

A second corrective round, on the same branch, closed gaps the first Content
Truth Contract pass's own final report had left open or gotten wrong. This
section records what changed and, per this round's explicit instruction,
corrects two claims that report made:

- **The prior round's "8 commits, all local" framing was incomplete.** A
  push updated the remote-tracking branch through commit `63604f0` (git
  reflog confirms `2026-09-02 16:37:35 +0300`). The three commits after
  that point were local-only at the start of this round. No push was
  performed during this corrective round either.
- **The prior round's final report incorrectly stated the `lib/db` DB
  guard scripts "do not exist anywhere in this repository."** They do:
  `lib/db/package.json` defines `check:published-migrations` and
  `test:db:orchestrator-selftest`. Both were run in this round
  (4/4 and 26/26 passed respectively) — see this round's own final report.

Content gaps closed in this round:

- **Eleventh teacher profile added**: Gouda El-Shoubaky (جودة الشوبكي),
  owner-confirmed reviews = 90, id assigned without renumbering any
  existing profile. Bio/specialties limited strictly to the credentials
  confirmed for every tutor (Al-Azhar graduate, Ijazah with connected
  sanad, Arabic Language & Translation B.A., Islamic jurisprudence
  experience) — no invented years of experience, student counts, or
  outcomes. "Gouda El-Shoubaky" is a normalized transliteration of the
  Arabic name, not an English name supplied by the owner.
- **Omnia Abd Allah (id=4)** — the one teacher with zero owner data in the
  prior round — now has the owner-confirmed `reviews: 85`.
- **Background-check / child-safety overclaims removed**: `TeacherProfile.jsx`'s
  "Child Safety Cleared / Background check completed — safe to teach
  minors" badge (no independent background check was ever confirmed) was
  replaced with an honest "Credentials on File" badge, matching what the
  owner did confirm (identity/qualification documents held by the
  academy). The same "background-checked. Safe for children." phrase was
  removed from `Dashboard.jsx`'s tutor-matching placeholder, and "safe for
  children" was removed from `Teachers.jsx`'s English SEO description.
  `TEACHER_CREDENTIALS`'s "Expert in Islamic Jurisprudence" was softened to
  "Islamic Jurisprudence Experience" to match what was actually confirmed,
  and a note ("Held by every Al-Rahma Academy tutor") now makes explicit
  that this list is shared across the team, not one teacher's individual
  claim.
- **Remaining "two free trial lessons" contradictions closed**: this exact
  gap — missed by the prior round despite its own broad sweeps — was still
  live in `src/data/faqItems.js` (all six languages),
  `src/components/ui/ReferralCard.jsx`'s WhatsApp share text,
  `public/llms.txt` (twice), and `src/data/home.js`'s features list. All
  four now read "one free trial lesson"/"one free 60-minute trial lesson,"
  sourced from `siteFacts.trialLessonMinutes` wherever the file can import
  at runtime (`llms.txt` cannot; it is guarded by a direct synchronization
  test instead — see `src/test/contentTruthCorrective.test.js`).
- **FAQ plan names desynced from the live plans**: `faqItems.js`'s pricing
  answer still said "Starter/Standard/Premium," which do not exist in
  `src/data/home.js`'s actual `plans` (Noorani/Huffaz/Ijazah). The answer
  now interpolates `plans` directly (name, price, sessions-per-week) in
  all six languages, so it cannot drift from the real pricing data again.
- **`siteFacts.js` wired to more real consumers**: `totalFamilies` and
  `countriesServed` now back the founder-story paragraph in `About.jsx`
  (previously de-numbered for lack of a source; the owner has since
  confirmed 1,200+ families across 10 countries — not the original,
  unsupported "40+ countries" claim). `totalTeachers` and
  `featuredTeacherCount` back a new "30 teachers, 11 featured, others on
  the team" sentence in `teachersPg.rosterNote` (all six languages) and in
  Teachers.jsx's SEO description. `supportResponseHours` backs
  `Dashboard.jsx`'s tutor-assignment placeholder.
- **Known, deliberately unfixed gap**: `TeacherProfile.jsx`'s own "Stats
  strip" does not render a teacher's `lessons` field at all (only the
  Teachers.jsx listing card does) — Sami's confirmed 2,500-lesson figure
  is therefore visible on the directory card but not on his own profile
  page. This is pre-existing display behavior, not something this round
  changed; left as-is since adding it was not part of this round's
  authorized scope.
- Test suite grew from 67 files / 1890 tests to 68 files / 2170 tests over
  this round (one new guard-test file, plus the pre-existing sitemap route
  and about-page tests updated for the new, now-accurate figures).
- Full commit list, the eleven-teacher review matrix, and verification-gate
  results for this round are in that round's own final report.

## Update 2026-09-02 — Full-Site Corrective Round 3

A third corrective round, on the same branch, starting from Round 2's
closing commit `6632b98` (tag `checkpoint/content-truth-contract-corrective-final`).
This round's own explicit instruction required correcting a count from the
prior round's chat-delivered final report: Round 2 actually changed **18
files and added 1 new file (19 total)**, not "16+1" as that report stated;
this correction is recorded here and in this round's own final report.

- **Flaky routing test fixed at its root cause, not by raising a timeout**:
  `src/test/appRouting.behavioral.stage2c.test.jsx` could intermittently
  time out waiting for `/academy/teachers` content inside the full suite
  (never reproduced in isolation on this machine, 2/2 full-suite attempts
  after the fix were green). Root-caused to React.lazy() first-touch
  module-transform cost under full-suite CPU contention, colliding with a
  generic `waitFor(() => document.querySelector('h1'))` check that could
  resolve on the Suspense fallback's absence of any `h1` rather than the
  real content. Fixed with a `beforeAll` that prewarms the lazy
  `Teachers`/`TeacherProfile` chunks outside the timed assertion window,
  plus a specific `findByRole('heading', { name: /our qualified tutors/i })`
  wait target instead of a generic existence check.
- **Round 2's own known, deliberately-unfixed gap closed**: `TeacherProfile.jsx`'s
  stats strip now renders `teacher.lessons` when present, so Sami's
  confirmed 2,500-lesson figure appears on his own profile page, not only
  the Teachers.jsx directory card.
- **Teacher-page translations completed across all six languages**:
  `TEACHER_CREDENTIALS` (previously en/ar only) now has real en/ar/it/es/de/fr
  translations; `Teachers.jsx`'s hardcoded `{teacher.lessons} lessons taught`
  and `TeacherProfile.jsx`'s entire hardcoded English proof/credentials block
  (Verified Credentials, Al-Azhar University, Ijazah Certificate, Identity
  Verified, Credentials on File, the certificate-custody note) now render
  from new `teachersPg.lessonsTaught` / `tp.*` i18n keys, translated (not
  English-fallback) in it/es/de/fr. The stale "10 sample records" comment in
  `Teachers.jsx` was corrected to reflect the current 11-profile roster.
- **`siteFacts.freeTrialLessons` wired to a real, locale-aware consumer**:
  previously a dead value. A new `trialLessonWord(lang)` lookup (en/ar/it/es/de/fr,
  ranges 1–3) returns each language's natural phrase fragment — e.g. Arabic
  gets "حصة تجريبية مجانية واحدة" (trailing-adjective numeral), not a forced
  digit substitution — used in `home.js`'s features list and every
  trial-confirmation string touched below. `standardWeeklyHours` /
  `premiumWeeklyHours` were removed from `siteFacts.js`: both were unused
  and named a non-existent "Standard/Premium" 2-tier plan structure that
  conflicts with the real Noorani/Huffaz/Ijazah 3-tier plans.
- **The 24-hour meaning conflation corrected**: `supportResponseHours` (a
  general, owner-confirmed support-response commitment — also documented in
  `TermsOfService.jsx`'s "Response time: within 24 hours") had been reused
  to imply an unconfirmed trial-confirmation / initial-tutor-assignment SLA
  in several places: `Dashboard.jsx`'s "Assigned within {24}h" placeholder,
  `faqItems.js`'s "How do I book a free trial?" answer, and — found only
  during this round's Chrome DevTools visual walkthrough, not by static
  grep — the `trial.formSub` / `faq.items[1].a` ("How does the free trial
  work?") / `enroll.success.thankYouPost` keys in all six `src/i18n/*.js`
  files, plus the `quickTrial`/`exitIntent` popup modal's `successBody` and
  `perks` in `src/i18n/experience.js` (all six languages). All now use
  neutral phrasing ("we'll contact you to confirm your tutor and schedule" /
  "we'll confirm by WhatsApp") with no invented number. `TermsOfService.jsx`
  separately documents "tutor changes... within 48 hours" for an
  already-enrolled student requesting a tutor swap — a different, legal-text
  commitment this round did not touch (Terms' business/legal rules were out
  of scope).
- **"2×" wording made honest and derivable**: a new `planComparison()` in
  `home.js` reads `plans` directly (`multiplier = top.sessionsPerWeek /
  base.sessionsPerWeek`) instead of hardcoding "2" and "4" as separate
  literals; `pricing.comparisonNote` (all six languages) renders "The
  Ijazah plan gives you 2× the weekly lesson time of Noorani — 4 classes a
  week instead of 2," using the real plan names.
- **Honest "6 limited trial spots"**: `siteFacts.limitedTrialSpots: 6` plus
  a `limitedTrialSpotsConfirmed` date, with `limitedTrialSpotsText(lang)`
  returning `null` (renders nothing) when the count is falsy — replacing
  the historically-already-removed fake countdown/day-seeded scarcity
  pattern this round's tests guard against reintroducing.
- **`ReferralCard.jsx` rebuilt**: removed all unsourced reward promises
  ("Get 1 Month Free," "you both receive one free month," "No limit on
  referrals"); now shares only the real one 60-minute trial lesson from
  `siteFacts`, fully translated (title/description/copy/WhatsApp message)
  in all six languages via a new `referral.*` i18n section, RTL-safe.
- **Plan names (Noorani/Huffaz/Ijazah) unified where safe**: display-only
  copy updated in `billing.js` (`sampleInvoices`, confirmed never submitted
  to any API — only rendered as a badge), `Pricing.jsx`'s code comments,
  `experience.js`'s cancellation-survey retention offer, and
  `RefundPolicy.jsx`'s covered-plans list (all six languages).
  `AdminUsersTab.jsx`'s `u.subscription?.plan || 'Starter'` default was
  deliberately left unchanged — it is an internal admin-API default
  parameter, and this round could not verify the backend's expected
  plan-key string without touching `lib/db`/backend, which is forbidden.
- Test suite grew from 68 files / 2170 tests (end of Round 2) to 69 files /
  2211 tests over this round.
- Full commit list, the six-language translation table, the plan-name
  changed/deferred table, and verification-gate results for this round are
  in that round's own final report.

## Update 2026-09-02 — Teacher Source of Truth + Official Contact and Social Identity — Final Integration

Starting checkpoint: `checkpoint/content-truth-contract-full-site-corrective`
(`a658ad6`). Same branch, same repository, no new branch/worktree.

- **Teacher Source of Truth (11 profiles, stable IDs)**: replaced every
  teacher's title, specialties, languages, and bio, and added `lessons`,
  `rating` and `reviews` to all 11 profiles (previously only Sami carried
  `lessons`, and no teacher carried an individual `rating`). This
  explicitly reverses the prior "hide individual ratings" and "only Sami
  has lessons" decisions — the owner has since supplied real per-teacher
  figures for all 11. Two names were corrected: "Gouda El-Shoubaky" →
  "Gouda Al-Shobaki" (with his title/specialties re-centered on Seerah and
  Islamic Studies, dropping the old Fiqh-and-Arabic framing), and
  "Alaa Rajab" → "Alaa Ragib". Stale `"N+ hrs"` figures were removed from
  every bio (they had already been superseded by `lessons` for Sami and
  were never assigned to the other ten). Bios stay short and neutral,
  derived only from each teacher's title/specialties and the shared
  credentials already confirmed for the whole team (Al-Azhar graduate,
  Ijazah with connected sanad) — no invented years of experience, student
  counts, results, or outcomes.
- **Individual ratings now shown**: `Teachers.jsx` and `TeacherProfile.jsx`
  render a real `teacher.rating` (formatted with `toFixed(1)`, so `5.0`
  never renders as bare `5`) alongside the existing `reviews` count,
  reusing the listing page's `.tpg__stars`/`.tpg__avg` CSS classes that
  already existed in `teachers-page.css` from an earlier design — no new
  CSS was needed. Individual ratings/lessons/reviews remain independent of
  `siteFacts.academyRating` (4.9/5) and `siteFacts.totalLessons`
  (15,000+); none are summed or blended into an academy-wide figure.
- **Two remaining Round 3 corrections closed**:
  - `siteFacts.supportResponseHours` previously had zero real production
    consumers (every locale hardcoded `"24"` independently in
    `footer.replyBadge`/`footer.trustBadges`). Wired both to the constant
    in all six locale files — `Footer.jsx` renders both, so the property
    is now a genuine single source, not a dead value. It is not used for
    trial-confirmation, tutor-assignment, or payment-verification timing,
    and `TermsOfService.jsx`'s legal text was not touched.
  - `trialLessonWord(lang)` returned a bare number word that callers
    spliced into a fixed-singular template, which produced ungrammatical
    Arabic at count=2 (`"حصة تجريبية حصتان مجانية"` — a duplicated noun).
    Replaced with `trialLessonPhrase(lang, count)`, which returns the
    whole agreement-correct noun phrase (noun + "free" adjective inflect
    together) for six languages, tested at count 1 and 2 in each. Updated
    every consumer: `home.js`, `faqItems.js`, and the `referral.waMessage`
    in all six locale files.
- **Official phone number replaced**: `01039553264` local /
  `+20 103 955 3264` international / `+201039553264` E.164. Made
  `src/data/site.js` the single source (`phoneLocalDisplay`,
  `phoneInternationalDisplay`, `phoneE164`, `phoneHref` — a ready-to-use
  `tel:` URI — `whatsapp`, `whatsappDisplay`); removed the duplicate
  `phoneDisplay` that used to live in `siteFacts.js`. Fixed two components
  (`TrustBar.jsx`, `FAQ.jsx`) that had hardcoded the old WhatsApp number
  as a literal `wa.me/...` URL instead of importing `site.whatsapp` — that
  duplication was the actual root cause of the number being wrong in two
  places at once. Updated `index.html`'s Organization JSON-LD `telephone`
  and `public/llms.txt`. `TopBar.jsx` and `Privacy.jsx` (the only two
  consumers of the old `site.phoneDisplay`/`site.phoneHref` field names)
  were updated to the new contract.
- **Social accounts replaced**: Facebook/Instagram/YouTube URLs updated to
  the confirmed `@alrahmaacademyonline` handle, Twitter/X removed (no
  official account), TikTok and Snapchat added with inline SVG icons
  (24×24 viewBox, `fill="currentColor"`, matching the existing icon
  style — path data sourced from Simple Icons). `Footer.jsx` and
  `TopBar.jsx` needed no changes: both already map generically over the
  `socials` array from `site.js`, so all five accounts render through the
  existing code with the existing `target="_blank" rel="noopener
  noreferrer"`/`aria-label` contract automatically. `index.html`'s
  `sameAs` updated to the same five URLs; `twitter:site`/`twitter:creator`
  meta tags removed (the account handles), while `twitter:card` (protocol
  metadata, not an account) was left in place.
- **Not blindly replaced**: YouTube/course video URLs, the Facebook
  `sharer.php` and `wa.me/?text=...` user-choice share endpoints (guarded
  by a dedicated test), and `.migration-backup/` (a frozen historical
  snapshot — intentionally still carries every old value; it is not part
  of the live application and is excluded from every "old value" sweep in
  this round's tests by scoping them to `src/`).
- **Regenerated `public/sitemap.xml`**: an unplanned but harmless
  side-effect — `scripts/seoRoutes.mjs` builds teacher URLs by mapping
  over `TEACHERS` in array order, and rewriting `teachers.js` in clean
  ascending-ID order (the original file had teachers 9/10/8 out of
  sequence) reordered the sitemap's `/academy/teachers/8`–`/10` entries.
  All 11 teacher URLs are still present exactly once; only their order in
  the file changed, which has no SEO effect.
- Test suite grew from 70 files / 2488 tests over this round (from Round
  3's close of 69 files / 2211 tests) — the growth includes a new
  dedicated `officialContactSocial.test.js` file plus expanded assertions
  in the two existing content-truth test files.
- Full commit list, the teacher before/after table, the phone/social
  file list, and verification-gate results for this round are in that
  round's own final report.
