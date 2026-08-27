# Al-Rahma Academy — Frontend Enterprise Audit

**Scope:** `frontend/` — React 18.3.1 + Vite 5.4.21 SPA, plain JS/JSX (no TypeScript), no Tailwind (hand-rolled CSS token system), React Router v7.17, TanStack Query v5.101, 226 source files (48 pages, 88 components, 19 hooks, 5 context providers, 21 API domain files).
**Method:** Two-wave parallel audit (6 domain/benchmark passes + 4 UX-archetype passes) plus real, executed baseline commands (`npm run build`, `npm run lint`, `vitest run --coverage`, `npm outdated`, `npm audit`, a live Lighthouse run against a real preview server). Every finding below cites exact `file:line` evidence or a real command output — no estimates presented as facts, and every estimate is explicitly labeled as such. External standards (WCAG 2.2, Core Web Vitals, TanStack Query v5, React Router v7/8, React 19, Vite 8, ESLint 10, Bulletproof React) were verified via WebFetch against current sources, not recalled from training memory, and are cited with URLs in §7.

---

## Executive Summary

**Overall verdict: this frontend is functionally solid and has real engineering quality in places (the payment/auth transactional logic mirrors the backend's discipline; the student Dashboard's empty-state design is genuinely excellent; accessibility and CSP fundamentals are better than most codebases this size) — but it is not production-ready as currently shipped**, because of one specific, cross-cutting defect that silently breaks payment and billing UI on three separate routes, plus a silent data-loss bug on the homework-submission flow. Both are fixable in under a day combined.

**The single most important finding:** `src/styles/hifz.css` defines the *only* `.modal`/`.modal__card`/`.modal__close`/`.checkout__*`/`.inv__*` CSS classes in the entire codebase, and this file is code-split so it only loads on the Quran reader and Hifz review pages. Three separate modals used elsewhere — `CheckoutModal` (Enroll, Pricing), `InvoiceModal` (Billing), and `AdminProgressModal` (Admin) — render **completely unstyled** (no overlay, no backdrop, no centered card, a bare `×` glyph) on a cold visit to those routes. Because Vite doesn't unload CSS on route change, a user who happened to visit the Quran reader earlier in the same session sees these modals render correctly — making this bug **session-order-dependent and effectively invisible in casual QA**, which is almost certainly why it shipped. This hits the payment step of the enrollment flow directly.

**The second most important finding:** the `HomeworkPage.jsx` file-upload feature is non-functional demo scaffolding. A student stages a file, sees it confirmed in the UI, submits, and the file is silently discarded before any network request — the mutation only sends `{notes}` as JSON. Every mutation on this page swallows errors (`catch { /* demo noop */ }`), so there is no code path by which a genuine failure could ever surface to the student or teacher.

**Third:** an abandoned checkout (clicking the modal's close button, pressing Escape, or clicking the backdrop) on the Enroll flow unconditionally sets the flow to its confetti "Thank you, you're enrolled!" success screen, regardless of whether payment occurred.

Beyond these three, the codebase has a long tail of real but lower-severity findings: a phantom `react-hook-form` dependency (listed, never used — all forms hand-rolled), zero `React.memo` usage, a single global `ErrorBoundary`/`Suspense` boundary, a 400KB chart-library chunk that is the single largest JS asset in the build (bigger than React itself), true whole-codebase test coverage in the low single digits (the reported 67% figure covers ~14 of 226 files), no E2E testing, several genuine WCAG 2.2 AA gaps (new-in-2.2 criteria especially), and two real CSP violations (Clarity and Tawk.to widgets aren't in the allowlist).

**Real, measured numbers used throughout this audit** (not estimates): production build succeeds in 48.83s; largest chunk is `DsChart` at 400.35 kB / 115.55 kB gzip; `npm run lint` is clean (0 warnings); `vitest run --coverage` shows 11/11 test files and 44/44 tests passing; `npm audit` shows 3 vulnerabilities (2 moderate, 1 high, all in the dev-only esbuild/vite toolchain, not production runtime); a real Lighthouse run against the Home page (mobile, simulated throttling) scores **Performance 85, Accessibility 96, Best Practices 96, SEO 100**, with LCP at 3.7s (Needs Improvement) as the one soft metric and CLS at a perfect 0.

**Production readiness verdict:** Not ready to ship as-is because of the modal-CSS and homework-upload defects — both are payment/trust-critical and both are cheap to fix. Once those two are closed, this is a reasonably solid, moderate-risk frontend for continued iteration, with a substantial and well-understood backlog of maintainability, performance, and accessibility improvements documented below.

---

## 1. Repository Discovery & Tech Stack

- **Stack:** React 18.3.1, React DOM 18.3.1, React Router DOM 7.17.0, TanStack Query 5.101.1 (+ devtools, + react-table 8.21.3), Axios 1.17.0, React Hook Form 7.80.0 (**listed but unused — see §5**), Recharts 3.9.0, Lucide React 1.23.0 (installed; `^1.21.0` in package.json), Sentry React 10.61.0 + Sentry Vite Plugin 5.3.0, Vercel Analytics 2.0.1, Fontsource (Amiri, Poppins).
- **Build tooling:** Vite 5.4.21, `@vitejs/plugin-react` 4.7.0, `@vitejs/plugin-legacy` 5.4.3 (targets an extremely broad legacy-browser matrix down to KaiOS 2.5), Terser.
- **Dev/test tooling:** Vitest 4.1.9, `@testing-library/react` 16.3.2 + `user-event` 14.6.1 + `jest-dom` 6.9.1, ESLint 9.39.4 (flat config) + `eslint-plugin-react`/`react-hooks`/`react-refresh`, Prettier 3.8.4, jsdom.
- **No TypeScript. No Tailwind, CSS Modules, styled-components, or Emotion** — confirmed absent; styling is 100% plain CSS with a 3-layer design-token system (`src/styles/tokens.css`, 421 lines) and BEM-ish class names.
- **File inventory:** 226 `.js`/`.jsx` files in `src/`, 35,479 total LOC (excluding `src/test/`). 48 pages, 88 components (28 in `features/`, 6 in `layout/`, 32 in `ui/`, ~20 top-level marketing), 19 hooks, 5 context providers, 21 API domain files, 27 style files, 10 i18n files (6 languages: en/ar/it/es/de/fr), 13 data files.
- **Deployment:** Vercel (`vercel.json` at repo root) — static SPA build, `/api/*` rewritten to a Render backend, SPA fallback, and a real security-header block (HSTS, CSP, X-Frame-Options, COOP/CORP, Permissions-Policy).
- **CI:** one shared `.github/workflows/ci.yml` running both frontend and backend jobs — frontend job: `npm ci` → `npm run lint` → `npm test` → `npm run build`, triggered on push/PR to `main` only.

---

## 2. Architecture & State Management

### 2.1 Routing & code-splitting — thorough, with one real granularity gap

`App.jsx` lazy-loads all ~52 route elements via `React.lazy()` (lines 17-68); cross-referencing against every file in `src/pages/**` confirms this is comprehensive, not partial. Redirect/legacy-URL handling (13 routes, `App.jsx:172-185`) is clean and intentionally grouped, using `<Navigate replace>` for static redirects and two small param-forwarding components for dynamic ones (`:slug`/`:id`).

**Finding FE-ARCH-1 (Medium): single global `ErrorBoundary` + single global `Suspense`.** `App.jsx:90` and `:103` are the *only* instances of either in the entire codebase — confirmed via grep. Any lazy-chunk load failure (e.g., a stale hashed chunk after a deploy while a user has the SPA open) or any page-level render crash takes down the *entire app* to the generic fallback, rather than isolating to the failed route. Given the app has genuinely distinct zones (marketing, Quran reader, admin), per-zone error boundaries would meaningfully improve resilience for a low implementation cost.

**Finding (informational): `LiveChat` and Vercel `Analytics` are mounted eagerly on every route**, including Home (`App.jsx:100`) — worth confirming `LiveChat`'s Tawk.to widget doesn't pull a heavyweight third-party SDK into the initial load path; it currently early-returns unless `VITE_TAWK_PROPERTY_ID` is configured (see §5's CSP finding for what happens if it is).

### 2.2 React Router v7 usage — a deliberate, legitimate architecture, not a defect

Grep for `loader|action|useLoaderData|createBrowserRouter|defer` across `src/` returns **zero files**. The app uses `<BrowserRouter>` + `<Routes>`/`<Route element>` JSX — React Router's **declarative mode** — with all data-fetching done via TanStack Query hooks inside components, not via route loaders/actions.

**Verified against React Router's own current documentation (`reactrouter.com/start/modes`, fetched 2026-07-08):** declarative mode is explicitly positioned as the right choice for teams that "have a data layer / their own abstractions" — this is not a legacy pattern or a mistake, it is a first-class supported mode. **Do not treat this as a defect to fix.** The only thing genuinely lost is router-level parallel data-prefetch on navigation, partially compensated by `RoutePrefetcher.jsx`, which prefetches route *chunks* (not data) on tap/hover/idle via `IntersectionObserver` + `requestIdleCallback`.

**Version note:** the installed `react-router-dom@7.17.0` is one major behind current (**v8.1.x**, released June 2026) — verified via WebFetch of the React Router GitHub releases. The v7→v8 upgrade is explicitly documented as non-breaking, so this is a low-risk, low-priority bump, not an architectural concern.

### 2.3 Context providers — a real code smell with verified-low real-world impact

5 providers in `src/context/`: `AuthContext.jsx` (123 lines), `LangContext.jsx` (45 lines), `QueryProvider.jsx` (29 lines), `ThemeContext.jsx` (24 lines), `TrialContext.jsx` (41 lines).

**Finding FE-ARCH-2 (Low, downgraded from initial hypothesis after direct analysis): 3 of 5 providers (`Auth`, `Theme`, `Trial`) construct a fresh context-value object every render** — only `LangContext.jsx:31-34` memoizes via `useMemo`. Consumer counts: `useAuth()` — 23 files including the heavy dashboards; `useTheme()` — 4 files; `useTrial()` — 2 files (provider scoped only to `Home.jsx`).

**This is a genuine code smell, but its real-world cost is close to zero, and the audit should not overstate it.** Each provider receives `children` as a stable element reference created once in `App()`; when a provider re-renders due to its own state change, React reuses that `children` reference, so the *only* components that re-render are actual context consumers — which is the desired behavior, not a bug. Each provider also only re-renders when its own consumers genuinely care (login/logout, dark-mode toggle, trial-plan selection). The one case with any real teeth: `AuthContext`'s `authLoading` flips once at startup via `ensureSession()` (lines 50-66), so all 23 auth-consuming components re-render once or twice on mount regardless — negligible. **Recommendation:** wrap all three in `useMemo`/`useCallback` as defensive hygiene (matching `LangContext`'s existing correct pattern), but this is P3 polish, not a performance bug.

### 2.4 The `Quran.jsx` "God component" — the highest-value architectural finding

**Finding FE-ARCH-3 (High): `Quran.jsx` (501 lines) contains 48 `useState` calls and 16 `useEffect` calls**, mixing three distinct data/fetching strategies in one component: raw imperative fetch for chapters/verses/audio (bypassing TanStack Query entirely), TanStack Query for bookmarks (`useQuranBookmarks`), and ~10 separate `localStorage`-synced preference pairs. It prop-drills all 48 state values down into ~12 child components (`QuranTopBar`, `QuranSidebar`, `QuranVerseList`, `QuranMushafPage`, reading-mode controls, hifz controls, sync player, etc.).

This is not merely an abstract complexity concern — the UX audit (§8.3) traced **concrete, user-visible symptoms directly caused by this design**:
- **Feature-parity gap between reading modes**: Continuous mode exposes only a bookmark toggle; Verse-by-Verse exposes the full action row (note, highlight, copy, share, tafsir, play). Notes are completely invisible in Continuous mode — a saved note gives no indicator there at all.
- **Cross-tab reciter state bleed**: `reciterId` is one shared state atom used by both the Reading and Hifz tabs; picking a chapter-only reciter in Reading, then switching to Hifz, silently overwrites the shared value, and it stays overwritten on return to Reading — with no notice to the user.
- **Hifz-only-works-in-Surah-mode silent dead-end**: per-verse audio only loads when `tab==='hifz' && navMode==='surah'` (`Quran.jsx:176-181`); browsing by Page/Juz/Hizb and entering Hifz mode leaves play buttons doing nothing, with no message explaining why.

**Recommendation:** introduce a `QuranReaderContext` (or reducer+context) to own reading-preference/nav/playback state directly, consumed by the children that need it, and extract chapter/verse/audio fetching into a dedicated `useQuranContent` React Query hook. This single refactor would resolve the prop-drilling, the mixed-fetching-strategy inconsistency, and likely the cross-tab state bleed simultaneously.

**Finding FE-ARCH-4 (Medium): `useQuranAudioEngine.js` (287 lines) does too much in one hook** — verse-queue playback, a repeat/range-repeat state machine, Media Session integration, two sleep-timer variants, and localStorage position persistence, coordinated through 10 refs and a hand-rolled `rerender()` force-update. This produces a **real, reproducible playback bug** (see §8.3, FE-UX-QURAN-1): `setTimeout` chains scheduled in `advance()` are never cleared by `pause()`/`stop()`, so audio can resume on the next verse after a user has explicitly stopped it, if the stop/pause lands within the ~400ms inter-verse gap.

### 2.5 Data-fetching consistency

TanStack Query is the dominant, well-executed pattern: 25 files use `useQuery`/`useMutation`, with consistent query-key factories (`COURSE_KEYS`, `DASHBOARD_KEYS`, `BILLING_KEYS`, `BOOKMARKS_KEY`), correct mutation invalidation, and thoughtful graceful-fallback patterns (`useBilling.js` falls back to sample data via `placeholderData` on error/empty). **`AdminDashboard.jsx`'s inline `useQuery` calls with cache-patch `setQueryData` setters are a sophisticated, *correct* React Query pattern** — an earlier hypothesis that this was a smell (inline queries instead of a dedicated hook) was checked directly and rejected; the only real critique is that this pattern should be extracted into a reusable `useAdminData` hook for testability, not that it's wrong.

**Finding FE-ARCH-5 (Medium): 53 raw `useEffect`-based fetches across 13 page files bypass TanStack Query entirely** — concentrated in `Quran.jsx` (16), `PrayerTimesPage.jsx` (8), `HadithLibrary.jsx` (4), and 1-3 each in `Adhkar`/`Messages`/`Profile`/`QiblaPage`/`VerseOfTheDayPage`/`PaymentResult`. Most of these call third-party APIs (quran.com, aladhan, alquran.cloud) rather than the backend, which is a defensible reason to skip the app's Query layer — but it means these calls get no caching/dedup/retry across navigations.

### 2.6 Component composition — no enforced convention, one exemplary pattern worth promoting

There is no container/presentational or hooks-per-domain convention; each feature picks its own split ad hoc. `AdminUsersTab.jsx` embeds 5 mutation calls directly in a "presentational" table component; `CheckoutModal.jsx` does its own raw `.then()` fetch in a `useEffect`; `PrayerTimesPage.jsx` is a fully self-contained imperative island (15+ `useState`). The student `Dashboard.jsx` and `AdminDashboard.jsx`'s empty-state handling (§8.4) is the standout good pattern in the codebase and should be the template other pages converge toward.

### 2.7 Folder structure vs. Bulletproof React

**Verified against Bulletproof React's current documented structure** (`github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md`, fetched 2026-07-08): the reference architecture organizes by **feature** (`src/features/<domain>/{api,components,hooks,stores,types,utils}`) with two enforced rules — no cross-feature imports, and a strict `shared → features → app` import direction. Al-Rahma is organized **by technical type** (`pages/`, `components/`, `hooks/`, `api/`, `utils/` all flat at the top level) — to change anything about the Quran feature, a developer touches `pages/Quran.jsx`, `components/features/quran/*` (16 files), 5 `hooks/useQuran*.js` files, multiple `api/quran*.js` files, and 3+ `styles/quran*.css` files, across 6 different top-level folders.

**Assessment:** at 226 files, this is starting to bite specifically for the two largest features (Quran, Admin) — the codebase already does a *partial* feature-split via `components/features/quran/` and `components/features/admin/`. **Recommendation:** complete the feature-folder pattern for the 2-3 largest domains rather than a wholesale Bulletproof migration, which would be premature for the marketing/tools pages that are fine as flat structure today.

---

## 3. Performance & Bundle (real, measured numbers)

### 3.1 Real production build output

`npm run build` succeeds in **48.83s**. Full chunk inventory (raw / gzip), largest first:

| Chunk | Raw | Gzip |
|---|---|---|
| **`DsChart`** | **400.35 kB** | **115.55 kB** |
| `index` (main entry) | 308.38 kB | 113.07 kB |
| `react-vendor` | 181.50 kB | 59.38 kB |
| `Quran` | 91.31 kB | 29.19 kB |
| `Adhkar` | 80.75 kB | 25.29 kB |
| `Home` | 68.82 kB | 19.24 kB |
| `Dashboard` | 53.80 kB | 14.52 kB |
| `AdminDashboard` | 51.63 kB | 11.76 kB |
| `query-vendor` (@tanstack) | 46.80 kB | 14.16 kB |
| `TeacherDashboard`/`ParentDashboard` | ~33 kB each | — |
| `content` (i18n) | 30.76 kB | 12.86 kB |
| `FAQ` | 30.53 kB | 13.91 kB |
| `sentry-vendor` | 11.59 kB | 3.81 kB |

**Finding FE-PERF-1 (High): `DsChart.jsx` is the single largest JS asset in the entire application — bigger than React itself.** Root cause, confirmed by direct file read: `DsChart.jsx:14-22` barrel-imports **15 named exports from `recharts`** (`BarChart, Bar, AreaChart, Area, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine`), pulling in recharts' full d3-scale/d3-shape/d3-array dependency surface. **`ReferenceLine` is imported and never used anywhere in the file — a confirmed dead import.** Consumers (`AdminDashboard.jsx`, `Dashboard.jsx`, `TeacherDashboard.jsx`) only ever use `DsBarChart`/`DsAreaChart`/`DsChartEmpty` — never `Line` or `Pie` — but because everything lives in one module, every consumer pulls in the entire recharts surface regardless.

The UX audit (§8.4) adds the user-facing framing: the empty-state handling for these charts is excellent (`DsChartEmpty` renders a clean "no data yet" placeholder), but **a brand-new admin/teacher with zero data still downloads the full 115.55 kB gzip chart library just to see a dashed placeholder box** — a poor value-to-weight ratio.

**Recommendation (three tiers):** (1) remove the dead `ReferenceLine` import — free; (2) split `DsChart.jsx` into per-chart-type modules so a bar-only consumer doesn't pull in line/pie code (verify recharts v3's actual tree-shaking behavior before relying on this — flagged as needing confirmation against current recharts docs, not asserted from training memory); (3) for a dashboard that only needs simple bar/area/donut visuals, evaluate a materially lighter charting approach (hand-rolled SVG or a <30kB library) — this would remove the single largest chunk in the app.

### 3.2 The legacy nomodule bundle — quantified real cost

**Finding FE-PERF-2 (Medium): the `@vitejs/plugin-legacy` fallback bundle adds real, measured weight.** Direct measurement of `dist/assets/`: **102 `-legacy-` chunk files** exist alongside the modern bundle (out of 226 total files in `dist/assets/`) — roughly doubling the shipped file count. Total legacy JS: **2,748,262 bytes**; total modern JS: **1,913,613 bytes** — **the legacy bundle is ~43.6% heavier than the modern one.** `DsChart-legacy` alone is 424,203 bytes (vs. 400,350 modern).

This targets browsers back to iOS 9, Android 4, Chrome 49, and KaiOS 2.5 feature phones. **Verified against Vite's own current release notes** (`vite.dev/blog/announcing-vite8`, `vite.dev/releases`, fetched 2026-07-08): Vite 7 (two majors ahead of this repo's v5) already moved its **default build target to `baseline-widely-available`**, a strong ecosystem signal that the browser-support floor most projects target has moved decisively upward since this legacy matrix was configured. Given this is very unlikely to be a large fraction of real 2026 traffic for a modern web platform, this is worth an explicit business-context conversation (this audit cannot determine the actual user base's device mix) — but the technical cost is now precisely quantified rather than assumed.

### 3.3 i18n bundle cost — precisely quantified, confirmed embedded in the critical path

**Finding FE-PERF-3 (High): all 6 language dictionaries are bundled into the main entry chunk, downloaded by every user on every page load, regardless of selected language.** Real file sizes (`src/i18n/`, raw source): `ar.js` 63.7 kB, `de.js` 52.9 kB, `en.js` 50.3 kB, `es.js` 53.5 kB, `fr.js` 54.4 kB, `it.js` 52.7 kB, plus `content.js` 39.0 kB, `adhkarText.js` 69.3 kB, `coursePages.js` 5.4 kB — **~441 kB of raw JS**, all statically imported (not `import()`-based) in `src/i18n/index.js`. Direct verification of the build output confirms these are **not** split into their own chunk — a grep for known English strings inside `dist/assets/index-BYeDeZ6S.js` (the 330,739-byte main chunk, 308.38 kB reported / 113.07 kB gzip) confirms this content lands in the critical-path main bundle.

**Recommendation:** convert the 5 non-active-language dictionaries to `import()`-based lazy loading, keyed off the selected language — this is a well-understood, low-risk change that would materially shrink the main-chunk weight every user downloads on first load.

### 3.4 Memoization — a real gap, but with case-by-case caveats

**Finding FE-PERF-4 (Low-Medium): zero `React.memo` usage anywhere in the codebase**, despite 164 `useMemo`/`useCallback` call sites across 39 files. Sampled usage (`Quran.jsx:210-279`) is purposeful, not cargo-culted — it memoizes derived `Set`/`Map` structures from bookmark data and stabilizes callback identities passed to list children, which is a legitimate re-render-avoidance case for a component rendering large verse lists. Without `React.memo` on the receiving children, though, the stabilized callbacks/values aren't necessarily preventing the child re-renders they're intended to prevent. **Recommendation:** audit the highest-render-cost list/table components (Quran verse list, admin tables) specifically, rather than blanket-applying `memo()` everywhere.

### 3.5 Real Lighthouse run (mobile, simulated throttling) — Home page

Executed directly against a local `vite preview` build (not estimated):

| Category | Score |
|---|---|
| Performance | **85** |
| Accessibility | **96** |
| Best Practices | **96** |
| SEO | **100** |

| Metric | Value | Verdict (per current Core Web Vitals thresholds, `web.dev`, fetched 2026-07-08) |
|---|---|---|
| LCP | 3.7 s | Needs Improvement (good ≤2.5s, poor >4.0s) |
| CLS | 0 | Perfect (good ≤0.1) |
| Total Blocking Time | 60 ms | Good |
| Speed Index | 3.1 s | Good |
| Time to Interactive | 3.7 s | Good |
| Max Potential FID | 100 ms | Good |
| Total page byte weight | 315 KiB | — |

**LCP is the one soft metric.** The UX audit (§8.1) traced the likely cause: there is no hero `<img>` — the LCP element is almost certainly the hero `<h1>` text, gated behind the lazy Home route chunk, the eagerly-bundled 441kB of i18n content in the main chunk (§3.3), and Poppins web-font load. This is a direct, traceable consequence of FE-PERF-3, not a separate mystery. Fixing the i18n eager-loading issue would likely improve this metric directly.

Note this Lighthouse run covers only the Home page — no authenticated/dashboard page (which additionally loads the 400KB DsChart chunk) has been profiled; this is an explicit coverage gap, not a claim that other pages perform identically.

### 3.6 Images & fonts

Zero `background-image` CSS usage confirmed (no hidden unoptimized-image surface). `<img>` tags are essentially unused (`Avatar.jsx` is the only real usage, already has `loading="lazy"` + an `onError` fallback). Font loading is deliberately staged: Poppins eager, Amiri (Arabic, ~200KB) deferred via `requestIdleCallback`/1200ms fallback (`src/utils/loadArabicFonts.js`), with Arabic-heavy pages calling `loadArabicFontsNow()` immediately to reduce CLS — a well-reasoned, already-good pattern.

### 3.7 Dependency currency (verified via WebFetch/real commands, not recalled)

`npm outdated` (real): `react`/`react-dom` 18.3.1→19.2.7 (one major behind), `vite` 5.4.21→8.1.3 (**three majors behind**), `@vitejs/plugin-legacy` 5.4.3→8.1.0, `@vitejs/plugin-react` 4.7.0→6.0.3, `eslint` 9.39.4→10.6.0.

**Vite 8** (`vite.dev/blog/announcing-vite8`, fetched 2026-07-08) ships **Rolldown**, a Rust-based unified bundler replacing esbuild+Rollup, cited at ~10-30× faster builds and ~3× faster dev startup. **React 19** (`react.dev/blog/2024/12/05/react-19`, fetched 2026-07-08) adds Actions/`useActionState`/`useOptimistic`, `ref`-as-a-regular-prop (no more `forwardRef`), and document-metadata auto-hoisting (a potential `react-helmet`-equivalent for the custom `useSEO` hook). **The React Compiler ships separately and is opt-in** — upgrading to React 19 alone does not auto-memoize components; it is the strategic long-term answer to the zero-`React.memo` finding (§3.4) but requires a separate adoption decision.

---

## 4. Accessibility, Responsive & RTL (WCAG 2.2 AA)

Every finding below cites a specific WCAG 2.2 success criterion, level, and whether it is new-in-2.2 (verified against `w3.org/WAI/WCAG22/quickref/`, fetched 2026-07-08 — 9 criteria are new in 2.2 vs 2.1: 2.4.11, 2.4.12, 2.4.13, 2.5.7, 2.5.8, 3.2.6, 3.3.7, 3.3.8, 3.3.9; **4.1.1 Parsing was removed/obsoleted in 2.2**).

### 4.1 No accessibility tooling — confirmed, but existing manual patterns are genuinely good

No `jest-axe`, `axe-core`, or `eslint-plugin-jsx-a11y` anywhere in dependencies or ESLint config. However, 3 of the 11 existing test files are genuinely a11y-behavioral (`QuranMushafPage.a11y.test.jsx`, `ResourceModal.a11y.test.jsx`, `useModalA11y.test.jsx`) — real RTL + user-event assertions on focus/roles/keyboard, not shallow snapshots. This is a reusable house pattern; the gap is breadth and automation, not competence.

### 4.2 `LangSwitcher.jsx` — confirmed WCAG violation, confirmed to affect nearly every page

**Finding FE-A11Y-1 (High): `LangSwitcher.jsx` exposes `role="listbox"`/`role="option"` ARIA semantics with zero keyboard handling** — no arrow-key roving, no Home/End, no Escape-to-close (confirmed: zero `onKeyDown` in the component). This is a **SC 4.1.2 Name, Role, Value (Level A)** violation: the ARIA role promises the listbox interaction model that the ARIA Authoring Practices Guide defines, and the implementation doesn't deliver it. It is not a full keyboard trap (each option is a real `<button>`, so Tab+Enter provides a degraded-but-functional path) — but Escape does not close the menu, and outside-close only listens for `mousedown`, never firing for keyboard users. **Confirmed by the UX audit to be present in the header on every marketing/public page, every tool page, and every structurally-scanned page** — the one exception is the authenticated dashboard shell, which has **no language switcher at all** (see FE-UX-DASH-2 below, arguably a bigger gap for that cluster).

### 4.3 Modal accessibility — a hook exists, but has no Tab focus-trap despite being described as one

**Finding FE-A11Y-2 (Medium): `useModalA11y.js` provides Escape-close, initial focus, focus-return, and scroll-lock — but no Tab focus-trap.** Confirmed by reading the hook's source: there is no `keydown` handler intercepting Tab to cycle focus within the dialog. Used by 5 modals (`CheckoutModal`, `InvoiceModal`, `ResourceModal`, `VerseCardModal`, `AdminProgressModal`) — in all of them, tabbing past the last control moves focus into the page behind the (supposedly) modal overlay, undermining the `aria-modal="true"` contract (SC 2.4.3 Focus Order, Level A). Modals *not* using the hook have their own, varying gaps: `QuickTrialModal` (no focus-return, no trap), `ExitIntentPopup` (**no keyboard handling at all** — no Escape, no initial focus — despite `role="dialog" aria-modal="true"`), `CommandPalette` (the best of the non-hook modals: full arrow/Enter/Escape handling, but still no trap or focus-return).

### 4.4 Touch Target Size — SC 2.5.8 (AA, **new in 2.2**, 24×24 CSS px minimum) — mostly compliant, one severe exception

The base `.btn`/`.btn--icon` system is compliant and exemplary (44×44px on mobile breakpoints, 36×36 desktop icon buttons — both above the 24px floor), as are header controls and standalone icon-close buttons on Quran-adjacent pages (28×28px, confirmed via CSS measurement).

**The severe exception is directly caused by FE-UX-1 below**: `.modal__close` — the shared close-button class used by `CheckoutModal`, `InvoiceModal`, and `AdminProgressModal` — has its 44×44px sizing defined **only** in `hifz.css`. On the routes where that CSS never loads, these close buttons collapse to an unstyled inline `<button>` around a bare `×` glyph, almost certainly under the 24×24px floor. This is the accessibility framing of the same root-cause bug described in detail in §8.1/§8.4 below.

### 4.5 Accessible Authentication — SC 3.3.8 (AA, new in 2.2) — CONFIRMED COMPLIANT

`Login.jsx`/`Register.jsx`/`ResetPassword.jsx` all have correct `autocomplete` attributes (`current-password`/`new-password`/`email`/`name`), no paste-blocking on password fields, and functioning show/hide-password toggles at 44×44px with correct `aria-label`s. Google Sign-In provides an alternative auth path. This is a genuine strength — explicitly not flagged as a gap.

### 4.6 Redundant Entry — SC 3.3.7 (A, new in 2.2) — CONFIRMED VIOLATION

**Finding FE-A11Y-3 / FE-UX-2 (High): `Enroll.jsx` collects name/email/whatsapp in Step 1, displays them back to the user in the Step 4 summary, then `CheckoutModal` — opened moments later in the same flow — has its own empty `customer` state with zero pre-fill from the data just entered.** The user re-enters identical information twice within one continuous flow, at the exact moment they're being asked to pay. `Enroll.jsx` also never imports `useAuth`, so a **logged-in** user re-types data the platform already has. See §8.2 for the full UX framing — this is one of the most tangible, easily-explained defects in the whole audit.

### 4.7 Color contrast — SC 1.4.3 (AA, not new) — real, math-verified failures on brand gold tokens

**Finding FE-A11Y-4 (Medium): `--text-accent (#d4af37)` and `--text-accent-dark (#b8941f)` fail WCAG contrast when used as text**, computed via the WCAG relative-luminance formula: `#d4af37` on white = **2.12:1** (needs 4.5:1 for normal text); `#b8941f` on white = **2.96:1**, on cream background = **2.73:1**. These are used by `.eyebrow`/`.text-overline` (small bold uppercase labels — exactly the failure case, not large text) and confirmed to recur as small text in at least two more places found by the UX audit: `.qlc__tafsir-key` (Quran verse-reference badges, `quran.css:470-472`, ~2.9:1) and the Tajweed Checker's mid-score feedback text (`TajweedCheckerPage.jsx:123,229`). All body-text and brand-green/gold-button color pairings elsewhere pass comfortably (4.5:1 to 14.4:1) — this is a narrow, specific token-usage bug, not a systemic contrast problem.

### 4.8 Language attribute correctness — SC 3.1.1 (compliant) / SC 3.1.2 (violated, ~50% coverage)

`LangContext.jsx` correctly sets both `lang` and `dir` on `<html>` for all 6 languages (SC 3.1.1, Level A — compliant). **Finding FE-A11Y-5 (Medium): roughly half of inline Arabic-text spans across the codebase carry `dir="rtl"` but are missing the paired `lang="ar"` attribute** (SC 3.1.2 Language of Parts, Level AA) — confirmed via grep across ~25 files including `Tutors.jsx`, `Teachers.jsx`, `TeacherProfile.jsx`, `Enroll.jsx`, `HadithLibrary.jsx`, `CourseIslamicStudies.jsx`, `QuranMushafPage.jsx`, `QuranVerseList.jsx`, `Tasbeeh.jsx`, `PrayerTimesPage.jsx`, `IslamicCalendarPage.jsx`, `QiblaPage.jsx` — while roughly the other half correctly carry it. A screen reader in an English UI context will mispronounce the un-tagged Arabic names/verses using English phonetics.

### 4.9 Screen-reader feedback for counters — a real, specific gap

**Finding FE-A11Y-6 (Medium): the Tasbeeh dhikr counter and Adhkar counters have zero `aria-live`/`role="status"` regions** — confirmed via grep, zero matches in `Tasbeeh.jsx`. A blind user can operate the counter via keyboard (Space/Enter increments, confirmed working) but receives no auditory feedback of the new count or of reaching the target — for a counting tool whose entire purpose is tracking a number, this is the central accessibility miss for that feature.

### 4.10 Dark mode & reduced motion

Dark mode is a pure manual toggle (`ThemeContext.jsx`) with **no `prefers-color-scheme` detection** — a user with an OS-level dark preference gets a light first paint until manually toggling. `prefers-reduced-motion` **is** correctly handled at the token level (zeroing duration tokens) — a genuine strength, not flagged as a gap.

### 4.11 RTL implementation — carried by a manual override file, with two confirmed concrete bugs

RTL correctness depends on `src/styles/layout/rtl.css` (110 lines, ~35 selectors) rather than automatic logical-property flipping — physical properties (`margin-left`, `text-align:left`) outnumber logical ones (`margin-inline`) roughly 139-to-19 across 21 files. This makes RTL correctness a manually-maintained property rather than a structural guarantee, and the UX audit found two concrete instances where the manual approach already broke:

- **`FAQ.jsx`'s RTL selector targets the wrong class name.** `rtl.css:19` styles `.faq__question`, but the component actually renders `className="faq-item__q"` (`FAQ.jsx:42`) — the RTL rule **never matches**, so Arabic-language FAQ questions are not right-aligned and the expand/collapse icon stays on the wrong side.
- **Dashboard/admin data tables ignore RTL entirely**: `.admin__table th, td { text-align: left }` (`auth.css:74`) uses a physical property, so tabular data stays left-aligned inside an otherwise RTL-mirrored dashboard shell for Arabic-speaking staff/admin users. Recharts-rendered chart axes/legends are similarly not RTL-configured.

Mobile touch adaptation is genuine (44px targets enforced at breakpoints, 16px inputs to prevent iOS zoom, 40×40 carousel arrows) — not merely reflow.

---

## 5. Security, Forms & Error Handling

### 5.1 `HomeworkPage.jsx` file upload — RESOLVED TO CERTAINTY (this was the single most important open question carried into this audit)

**Finding FE-SEC-1 / FE-UX-3 (Critical — data loss + trust): the file-upload feature is non-functional demo scaffolding.** Full trace: `SubmitModal` stages a real `File` object (`HomeworkPage.jsx:183`, no size/type/`accept` validation) and passes it to `onSubmit({ hwId, notes, file })` (`:199`). The consumer's `submitMutation.mutationFn` destructures **only `{ hwId, notes }`** (`:371`) and POSTs `{ notes }` as plain JSON (`:374`) — **the `file` object is never referenced again and is garbage-collected with the modal.** No `FormData` exists anywhere in the codebase (confirmed via repo-wide grep) — this is the only file input in the entire application. Compounding the invisibility: `onClose()` fires synchronously right after `onSubmit` with no toast/confirmation system anywhere in the app; every mutation on this page (`submitMutation`, `createMutation`, `gradeMutation`) is wrapped in `catch { /* demo noop */ }`, so a genuine network/500 failure can **never** surface to the student; and `fetchHomework` falls back to hardcoded demo data on any failure, so the page continues to look fully functional. A student believes they've submitted homework with an attachment; the teacher receives, at best, a note with no attachment, or nothing.

### 5.2 The Enroll/Checkout abandon-flow false-success bug — new, confirmed

**Finding FE-SEC-2 / FE-UX-4 (High): abandoning the checkout modal shows a fake "you're enrolled" success screen.** `Enroll.jsx:517`'s `handleCheckoutClose` sets `done = true` unconditionally, and `CheckoutModal`'s `onClose` fires identically whether the user completed payment, clicked the `×`, pressed Escape, or clicked the backdrop. A user who opens checkout and **abandons it without paying** is taken straight to a confetti "Thank you {name}, check your email for confirmation" screen (`Enroll.jsx:413-415`). This is a genuine trust/analytics defect — "it told me I enrolled but nothing happened" — and is compounded by FE-UX-1 below on any route where the modal is also visually broken.

### 5.3 `http.js` — request-only interceptor, no timeout, no retry

**Finding FE-SEC-3 (Medium): `src/api/http.js` has a request interceptor (CSRF header injection) but no response interceptor, no `timeout`, and no retry logic.** Sampled call sites (`useDashboard.js:21,27`) show 401s and other errors from `getMyEnrollment`/`getCourses` swallowed via `.catch(() => null/[])` into empty-looking data, rather than a clear "please log in again" state. The only global auth-recovery mechanism is `AuthContext.ensureSession()`, which handles this correctly but **only at route-mount time** via `ProtectedRoute` — a session that expires while a user sits on an already-rendered page is not caught by anything. No `timeout` also means a hung backend leaves spinners pending indefinitely.

**Finding FE-SEC-4 (Low): the CSRF cookie parser truncates tokens containing `=`.** `getCsrfToken()` (`http.js:5-12`) does `.split('=')[1]`, which takes only the segment after the *first* `=` — a token containing `=` (e.g., base64 padding) would be silently truncated, breaking the double-submit match. Currently safe only if the backend's token alphabet happens to avoid `=`, not by construction.

### 5.4 The hand-rolled HTML sanitizer — reasoned through in detail, verdict: better than it looks, with one legitimate structural concern

`TafsirPanel.jsx`'s `sanitizeHtml()` (the app's only `dangerouslySetInnerHTML` sink, rendering third-party Quran-API tafsir content) was traced line-by-line rather than assessed superficially:
- **Nested-tag smuggling** (`<script><b>text</b></script>`): the HTML parser's raw-text content model for `<script>` means no `<b>` child element is ever created inside it in the first place; unwrapping hoists only inert text. **Safe.**
- **Attribute stripping**: snapshots the live `attributes` collection before iterating (avoiding the classic mutate-while-iterating bug), and removes *all* attributes from allowed tags — no `on*` handler or `javascript:` URI can survive, and the allowlist itself excludes every URL-bearing element (`<a>`, `<img>`, `<iframe>`). **Solid.**
- **The one legitimate structural concern**: the sanitizer parses untrusted HTML into a `document.createElement('div')` (a live-document node) rather than an inert `<template>.content`/`DOMParser` document, and then **re-serializes and hands React a string** rather than the cleaned DOM node — a parse→serialize→re-parse round-trip, which is the canonical setup for mutation-XSS. None of the classic mXSS-prone elements (`noscript`, `template`, `style`, `svg`, `math`) are in the allowlist, which defends against the best-known vectors, but this is still a structurally weaker design than DOMPurify's.

**Finding FE-SEC-5 (Low, defense-in-depth): recommend either adopting DOMPurify, or at minimum parsing into an inert document and handing React the cleaned node directly rather than a re-serialized string.** Real-world risk is low today because the input source is third-party API content, not user-generated or attacker-controlled in the normal threat model — this is a hardening recommendation, not an active exploit.

`src/utils/escapeHtml.js` is a **separate, legitimate, actively-used mechanism** (not dead code, not redundant with the sanitizer above) — an HTML-entity encoder used correctly at 3 production sites (`CertificateCard.jsx`, `VerseCardModal.jsx`, `Profile.jsx`) to safely interpolate plain text into raw HTML strings passed to `document.write()` print windows. It solves the opposite problem from the tafsir sanitizer (render markup inert vs. preserve safe markup) and is covered by its own test (`CertificateCard.security.test.jsx`).

### 5.5 Two real, verified CSP violations

**Finding FE-SEC-6 (Medium): the CSP in `vercel.json` was authored against Stripe/PayPal/GA/Sentry/Quran and never updated for two engagement widgets that are already wired into the codebase.** Microsoft Clarity's script host (`https://www.clarity.ms`) and its telemetry endpoints are **not** in `script-src`/`connect-src`; Tawk.to's embed host (`https://embed.tawk.to`) is **not** in `script-src`/`connect-src`/`frame-src`. If `VITE_CLARITY_ID` or `VITE_TAWK_PROPERTY_ID` are set in production, these integrations will be silently blocked by the browser's own CSP enforcement — a "security headers written without auditing every integration" gap. The CSP is otherwise well-scoped: no `unsafe-eval`, correct `object-src 'none'`/`base-uri 'self'`/`frame-ancestors 'self'`. **The one genuine soft spot: `script-src` does contain `'unsafe-inline'`** (likely required for GA's inline bootstrap snippet), which meaningfully weakens the CSP's XSS-mitigation value.

### 5.6 Dependency & environment posture — clean

No auth/crypto-adjacent client-side dependencies (no JWT libraries, no `crypto-js`) — auth is entirely httpOnly-cookie + backend-driven, confirmed by a full grep of `localStorage`/`sessionStorage` finding zero token/secret writes anywhere, only UI preferences and feature state. All environment variables (`VITE_GA_ID`, `VITE_GOOGLE_CLIENT_ID`, `VITE_CLARITY_ID`, `VITE_TAWK_PROPERTY_ID`, etc.) are legitimately public config. `VITE_DAILY_DOMAIN` is confirmed **dead configuration** (declared in `.env.example`, never referenced anywhere in `src/`) — cosmetic, recommend removing. **`react-hook-form` is a confirmed phantom dependency** (§6.3) worth removing for supply-chain hygiene alone, independent of its architectural implications. The 3 `npm audit` vulnerabilities (esbuild/vite, dev-server-only) carry no production runtime risk.

---

## 6. Testing, CI, Build & DX

### 6.1 Real coverage numbers — and the critical scope caveat

`vitest run --coverage` (real, executed): **11/11 test files pass, 44/44 tests pass**, reporting **67.46% statement / 50.98% branch / 62.5% function / 73.46% line** coverage.

**Finding FE-TEST-1 (High): this coverage figure describes ~14 files, not the 226-file codebase, and the true whole-codebase figure is roughly 2-3%.** `vite.config.js`'s coverage block has no `all: true` and no `include` pattern, so v8's default behavior reports coverage only over the transitive import graph of the 11 test files that actually execute — confirmed by reading the config directly. Real measurement: the 226-file `src/` tree totals 35,479 LOC; the ~14 files actually touched by tests total ~1,174 LOC — meaning **97% of the codebase's files are entirely absent from the coverage denominator**, not shown as 0%, simply invisible to the report. Applying the real 73.46% line-coverage figure within that narrow scope against the full tree yields an estimated **~2.4% true whole-codebase line coverage** (explicitly an estimate, clearly distinguished from the real 67.46%/73.46% figures).

### 6.2 Test quality vs. breadth — the tests that exist are genuinely good; almost nothing else is tested

The 11 existing tests are legitimate integration-style tests (real `render` + `userEvent`, not shallow mocks) covering the app's highest-risk areas: the billing hook (8 well-designed cases including retry-config-aware assertions), notification panel interactions (locks down two real historical production bugs per its own comments), the error boundary's Sentry integration, and 3 accessibility-behavioral tests. **Finding FE-TEST-2 (High): every one of the 48 pages, all 4 auth forms, all payment/billing UI, all admin/teacher/parent dashboards, the entire Quran reader's interaction logic (beyond one a11y-focused test), and the entire 21-file API layer have zero test coverage of any kind.** There is **no E2E testing setup at all** — no Playwright, no Cypress, confirmed via directory/config search; no critical user journey (register → enroll → pay → access course) has any automated end-to-end coverage. This directly explains why the modal-CSS defect (§8) and the homework-upload defect (§5.1) shipped undetected.

### 6.3 A real, live CSS syntax error, undetectable by the current toolchain

**Finding FE-TEST-3 (Medium): `src/styles/dashboard-shell.css` has a genuine CSS syntax error** — a stray extra closing `}` at line 2096, confirmed to be the file's last line, following already-closed rule blocks. Browsers' lenient CSS parser silently discards it today (no visible symptom, confirmed by checking what follows — nothing does, since it's EOF), making this a **"ticking time bomb"**: any future rule appended to this file will land inside a phantom block and silently fail to parse. It is undetectable by the current toolchain because ESLint doesn't lint CSS, there's no Stylelint, and **`format:check` (which does catch it — running `npm run format:check` reproduces a hard `CssSyntaxError` on this exact file) is never run in CI.**

### 6.4 Prettier/formatting is completely unenforced

**Finding FE-TEST-4 (Medium): `npm run format:check` fails on 250 files** (real count) that would be reformatted by Prettier, plus the hard CSS parse error above — and `.github/workflows/ci.yml` never runs `format:check` as a CI step. Formatting compliance is currently aspirational, not enforced.

### 6.5 `lint:strict` surfaces a real gap in the plain `lint` baseline

Running `npm run lint:strict` (`eslint . --max-warnings 0`) fails with 3 warnings the plain (CI-run) `lint` script doesn't catch — all three are `coverage/`-directory-generated files (`block-navigation.js`, `prettify.js`, `sorter.js`) that leak into linting because `eslint.config.js`'s ignore list omits `coverage/`. Real application code is genuinely warning-clean; this is a config gap, not an app-code problem, but it means CI's "clean lint" baseline is fragile — the moment `test:coverage` output exists in a linted checkout, `lint:strict` would fail on generated artifacts. **Also flagged:** `eslint.config.js`'s `no-unused-vars` rule uses `varsIgnorePattern: '^[A-Z_]'`, which silently permits any unused import/variable starting with an uppercase letter — since React components are PascalCase, **an unused component import is never flagged by lint**, a real dead-code blind spot.

### 6.6 CI coverage gaps

`.github/workflows/ci.yml` runs `npm ci → lint → test → build` for the frontend job — but plain `test` (not `test:coverage`), so there is **no coverage gate of any kind enforced**, and (per §6.4) no `format:check` step. Triggers are push/PR to `main` only — a feature branch gets CI only when a PR is opened, never on bare pushes.

### 6.7 Node version drift — real, already-evidenced risk

**Finding FE-TEST-5 (Medium): no `engines` field in `package.json`, no `.nvmrc`.** CI pins Node 20; the actual local development environment measured during this audit runs Node v24.18.0 — a two-major-version gap with nothing enforcing either side. The repo's own git history already shows evidence this class of drift has bitten the team (`4724dbb`/`643b9e8`: "regenerate lock file with npm 10.8.2 to match CI's resolver exactly").

### 6.8 `gen-sitemap.mjs` — correct logic, real drift already present

The script itself is well-written, but `package.json`'s hand-maintained `seoRoutes` array (32 entries) has already drifted from `App.jsx`'s real route table (65 `path=` entries) — confirmed: `/tools/tajweed-checker` and `/tools/hifz-review` are live public routes absent from the sitemap, and blog posts are hardcoded as 7 literal slugs rather than derived from the dynamic `/resources/blog/:slug` route, meaning **any new blog post silently fails to appear in the sitemap** until someone remembers a manual edit.

---

## 7. External Benchmark Comparison

All facts in this section were WebFetched against current sources on 2026-07-08 rather than recalled from training data (per the audit's own methodology requirement, given a prior draft already caught one sub-agent stating a wrong, unverified dependency-version claim from memory).

| Benchmark | Verdict | Basis |
|---|---|---|
| **React official guidance** | Comparable | Component patterns are idiomatic; the God-component/prop-drilling pattern in `Quran.jsx` is the one clear deviation from "Thinking in React" component-hierarchy guidance. |
| **Vite best practices** | Weaker (dependency currency), Comparable (config quality) | 3 majors behind (Vite 8 ships Rolldown, 10-30× faster builds per `vite.dev/blog/announcing-vite8`); manual chunking, legacy-browser strategy, and font-loading strategy are all well-reasoned within the version in use. |
| **React Router best practices** | Comparable — declarative mode is a legitimate first-class choice | Verified directly against `reactrouter.com/start/modes`: this app's "Router for paths, Query for data" pattern is explicitly endorsed for apps with an existing data layer, not a legacy anti-pattern. One major version behind (v8), non-breaking upgrade path. |
| **TanStack Query best practices** | Strong | Query-key factories, correct invalidation, `placeholderData` fallback patterns, and the admin dashboard's cache-patch pattern all match current v5 idioms (verified against `tanstack.com/query/latest` docs). |
| **WCAG 2.2 AA** | Partial | Strong on 3.3.8 (new-in-2.2 accessible authentication); confirmed violations on 4.1.2 (LangSwitcher), 3.3.7 (redundant entry), 2.5.8 (modal close-button sizing, itself downstream of the CSS-split bug), 1.4.3 (gold-token contrast), 3.1.2 (inconsistent `lang="ar"`). |
| **Lighthouse / Core Web Vitals** | Good, with one specific soft metric | Real run: 85/96/96/100, LCP 3.7s (Needs Improvement per current `web.dev` thresholds) traced to the eager i18n bundle; CLS a perfect 0. |
| **Material UI architecture** | Different philosophy, not a deficiency per se | No central theme object/token-driven component library exists; the codebase achieves comparable design-token discipline via CSS custom properties rather than a JS theme object — a legitimate alternative, not a gap, though it means no `sx`-prop-style one-off theming ergonomics. |
| **shadcn/ui architecture** | Comparable philosophy, different implementation | Al-Rahma's "own your CSS, hand-roll components" approach shares shadcn's "own your code" philosophy conceptually, without adopting Radix primitives or a utility-CSS layer. |
| **Bulletproof React architecture** | Weaker (by-type vs by-feature) | See §2.7 — a partial feature-split exists for Quran/Admin; a full-by-type structure at 226 files is starting to show real cross-folder friction for the two largest features specifically. |
| **Large-scale production React apps generally** | Comparable-to-weaker on testing/tooling, comparable-to-strong on runtime architecture | The 2-3% true test coverage and complete absence of E2E testing are the most significant gaps relative to typical production-grade expectations; TanStack Query usage, code-splitting discipline, and CSP/security-header configuration are comparable-to-strong. |

---

## 8. UX Review by Page Archetype

Coverage discipline: pages were grouped into 4 archetypes; each archetype's audit states explicitly which pages received a full heuristic pass vs. a lighter structural scan, so sampling is never mistaken for omission (48 pages total; ~12 received full deep-audits, the remainder structurally scanned for deviation from established patterns).

### 8.1 THE CROSS-CUTTING FINDING — `hifz.css` code-split breaks modals on three separate critical routes

**Finding FE-UX-1 (Critical — confirmed independently by both the Auth/Onboarding and Dashboard UX passes): `.modal`, `.modal__card`, `.modal__close`, `.checkout__*`, and `.inv__*` are defined in exactly one file, `src/styles/hifz.css`, which is code-split and imported only by `Quran.jsx` and `HifzReviewPage.jsx`.** No global fallback exists — `components.css` and every other globally-indexed stylesheet were confirmed (via repo-wide grep) to contain zero equivalent rules.

Three modals used on three separate critical routes reference these classes and have no other CSS source:
- **`CheckoutModal`** (Enroll, Pricing routes) — renders with **zero overlay/backdrop/positioning**, a bare `×` glyph, and every internal `.checkout__*` field/row/method class unstyled, dumping the entire payment form as raw unstyled content at the bottom of the page.
- **`InvoiceModal`** (Billing route) — same modal-shell breakage, plus every `.inv__*` class (header, logo, meta, breakdown, status pill) is *also* hifz.css-only, so the entire invoice renders as unstyled raw text.
- **`AdminProgressModal`** (Admin route) — the modal shell is broken identically, though its inner content (`.admin__list`, `.field`, `.btn`) happens to be styled globally, so this instance is partially spared.

**Why this is a genuine QA-evading bug, not just a missed test case:** Vite does not unload CSS on client-side route navigation. A developer or tester who visits the Quran reader or Hifz review tool *at any point earlier in the same session* leaves `hifz.css` resident in the document, and every one of these three modals then renders **correctly** for the rest of that session. A user landing cold on `/enroll`, `/pricing`, `/billing`, or `/admin` — the overwhelmingly common real-world case for a paid-ad click-through or a direct bookmark — sees the broken version. This is precisely the kind of defect that survives internal testing (where "click around the whole app first" is a natural QA habit) while reliably breaking for real users.

**This is the highest-priority fix in the entire audit.** Recommended direction: move the `.modal*`/`.checkout__*`/`.inv__*` rule blocks out of `hifz.css` into a globally-loaded stylesheet, or have `CheckoutModal.jsx`/`InvoiceModal.jsx`/`AdminProgressModal.jsx` each import their own scoped CSS directly so styling travels with the component rather than depending on an unrelated page having been visited first.

### 8.2 Marketing/Public cluster (17 pages; deep-audited: Home, CoursesHub, ToolsHub, BlogPost/Blog; rest structurally scanned)

- **Finding FE-UX-5 (High, conversion): `/#trial` cross-page CTA links are functionally broken.** `FAQ.jsx` and `BlogPost.jsx` link to `/#trial`, but `ScrollToTop.jsx` force-scrolls to top on every route change with no hash-scroll handler anywhere in the codebase, and the target section is wrapped in `DeferredSection` on Home (not even in the DOM at load). A user clicking "Book a Free Trial" from a blog post or FAQ page lands at the plain top of the homepage — the CTA silently does nothing.
- **Finding FE-UX-6 (Medium): `CoursesHub.jsx`'s route table has a duplicate entry** — the "Quran Memorization (Hifz)" card and the "Quran Reading & Tajweed" card both link to `/courses/quran`, so the Hifz card silently delivers the wrong page.
- **Finding FE-UX-7 (Medium): `CoursesQuran.jsx` and `CoursesArabic.jsx` reference CSS classes that exist in no stylesheet at all** (`hub-hero__actions`, `hub-feature-row`, `hub-cta-box`, `hub-card__points`, `hub-card--detailed` — confirmed via grep, zero CSS matches) — these two hub pages render visibly unstyled/unpolished relative to the rest of the site.
- **Finding FE-UX-8 (Medium): `FAQ.jsx`'s RTL override targets a class name (`.faq__question`) that doesn't match the component's actual class (`.faq-item__q`)** — the RTL rule silently never applies, so Arabic FAQ questions are not right-aligned and the expand icon doesn't mirror.
- Inconsistent/hardcoded-English i18n leaks: breadcrumb labels (all pages except Academy/Courses hubs), `ToolsHub.jsx`'s entire conversion CTA strip, and `BlogPost.jsx`'s chrome (prev/next labels, byline, bottom CTA) — all served in an otherwise-fully-localized Arabic page.
- `BlogPost.jsx` 404s silently redirect to the blog index with no "article not found" message (Nielsen heuristic #9 violation).
- **Confirmed strengths**: routing/redirect architecture is genuinely clean; Home's CTA hierarchy has zero competing primaries with the trial CTA in the first viewport; `NotFound.jsx` and `TeacherProfile.jsx`'s own not-found handling are both exemplary; dark mode coverage across this cluster is thorough with no breakage found.

### 8.3 Auth/Onboarding cluster (5 pages, all deep-audited)

- FE-UX-1 (§8.1) hits this cluster directly via `CheckoutModal` on the Enroll/Pricing routes — this is where it was first confirmed to certainty.
- FE-SEC-2/FE-UX-4 (§5.2, abandon-checkout false success) also lives here.
- **Finding FE-UX-2** (§4.6, redundant name/email/phone entry between Enroll Step 1 and the Checkout modal) is fully detailed here.
- **Finding FE-UX-9 (Low): `ResetPassword.jsx` shows the wrong copy for a missing/malformed reset token** — the missing-token guard reuses the `rp.noMatch` string, which is actually the *"passwords do not match"* message, producing nonsensical copy ("Passwords do not match. Reset password.") for a user who never typed anything.
- **Finding FE-UX-10 (Low): the Enroll Step 4 payment button has no `disabled` guard against double-submission** — the earlier steps' "Continue" button is correctly disabled during loading, but the actual payment-triggering button is not.
- **Finding FE-UX-11 (Low): missing trust signals at the actual payment step** — the 14-day money-back guarantee promised in the page's own SEO metadata never appears in the Enroll flow copy itself; renewal/security disclosures live only inside the (broken) checkout modal.
- **Confirmed strengths, explicitly not to be re-flagged**: Login/Register/ForgotPassword/ResetPassword all correctly distinguish network failures from server errors, all have double-submit guards, Enroll's step-progress indicator and back-navigation data preservation both work correctly, and pricing is presented honestly with no pre-checked upsells.

### 8.4 Tools cluster (~12 pages; deep-audited: Quran.jsx, Qibla, Prayer Times; rest structurally scanned)

- **Finding FE-UX-QURAN-1 (High): confirmed reachable audio-resume-after-stop bug.** Traced to a concrete user path: the sync player's Pause/Stop buttons call `useQuranAudioEngine`'s `pause()`/`stop()`, but pending `setTimeout` chains scheduled by `advance()` (for the ~400ms inter-verse gap) are not cancelled by either function. A user who taps Pause or Stop during that window has already-scheduled audio resume on the next verse regardless.
- Feature-parity gap between Quran reading modes (§2.4) — notes/highlights/tafsir/copy are invisible in the default Continuous mode.
- Cross-tab reciter-selection bleed and the Hifz-tab-only-works-in-Surah-mode silent dead-end (§2.4).
- **Finding (Medium): `QiblaCompass`'s compass-permission-denial is completely silent** — the "Enable compass" button appears to do nothing if the device sensor permission is denied, with no error state shown. Geolocation denial, by contrast, is handled gracefully with a clear fallback.
- **Finding (Medium): the Qibla compass has no `aria-live` region** — a screen-reader user gets one static bearing announcement and no live update as the compass value changes, making the tool effectively non-functional for non-visual use.
- Hidden/undiscoverable gestures in the Mushaf reader (edge-tap page-turn zones, center-tap chrome toggle, swipe navigation) — no on-screen affordance signals any of these exist beyond the visible ‹ › buttons.
- **Confirmed strengths**: `PrayerTimesPage.jsx` has the most complete loading/empty/error/permission-handling of any page audited in this cluster and should be the template for the weaker tool pages; reading-settings (font size, line height, reading theme) all verifiably apply correctly to both renderers with no disconnect found; the localStorage-backed API cache with stale-on-error fallback is a solid resilience pattern (though it never signals to the user that displayed content might be stale).

### 8.5 Authenticated App/Dashboards cluster (~13-14 pages; deep-audited: Dashboard, Billing, HomeworkPage, AdminDashboard)

- FE-UX-1 (§8.1) hits this cluster via `InvoiceModal` (Billing) and `AdminProgressModal` (Admin) — both independently confirmed here.
- FE-SEC-1/FE-UX-3 (§5.1, the HomeworkPage silent file-discard bug) is fully detailed here.
- **Finding FE-UX-DASH-1 (Medium): `AdminUsersTab` has no pagination despite displaying a total count.** The header shows "Registered Users ({usersTotal})" but only renders the currently-loaded page's array, with client-side-only search that silently misses any user on a page that hasn't loaded — no page controls, no "load more" affordance exists.
- **Finding FE-UX-DASH-2 (Medium): there is no language switcher anywhere in the authenticated dashboard shell** — confirmed via grep across every dashboard page, zero `LangSwitcher` usages. A non-English-speaking student, parent, teacher, or admin who logs in has no way to change language without navigating back out to the public marketing site. This is arguably a bigger practical gap for this specific user population than the LangSwitcher keyboard-accessibility issue found elsewhere.
- **Finding (Low): admin action feedback relies entirely on optimistic table updates with no success confirmation** — role changes, teacher assignments, and subscription edits all patch the table after the request resolves, but there's no toast/checkmark, so the operator infers success only from watching the row change; failures surface in a banner that may be scrolled off-screen for actions taken far down a long table.
- **Finding (Low, "ticking time bomb" not live bug): the `dashboard-shell.css` stray closing brace (§6.3) sits at the literal end of the file with no rules following it**, confirmed to cause zero visible symptom today — flagged for pre-emptive fixing before any future edit to that file silently breaks inside the phantom block.
- RTL gap in dashboard data tables and charts (§4.11).
- **Confirmed strengths, and the standout best practice in the entire audit**: the student `Dashboard.jsx`'s empty-state design is genuinely excellent — a 4-step "Getting Started" onboarding card for zero-enrollment users, encouraging empty-course/no-upcoming-class/unmatched-tutor states with clear next actions, and correct chart-empty-state gating (`DsChartEmpty`) rather than a broken-looking blank chart. `AdminDashboard`'s 8-tab structure has genuinely good keyboard accessibility (`role="tablist"`, roving `tabIndex`, arrow/Home/End navigation) and equally thorough empty-state handling. These two patterns should be the template the rest of the app is brought up to.

---

## 9. Consolidated Findings (severity-ranked, for the Verification/Patch-Plan stages)

| ID | Finding | Severity | Section |
|---|---|---|---|
| FE-UX-1 | `hifz.css` code-split breaks CheckoutModal/InvoiceModal/AdminProgressModal on 3 critical routes | **Critical** | §8.1 |
| FE-SEC-1 | HomeworkPage file upload silently discards the file; all errors swallowed | **Critical** | §5.1 |
| FE-SEC-2 | Abandoned checkout shows fake enrollment-success screen | High | §5.2 |
| FE-A11Y-1 | LangSwitcher: ARIA listbox role with zero keyboard handling (SC 4.1.2) | High | §4.2 |
| FE-A11Y-3 | Enroll→Checkout redundant name/email/phone entry (SC 3.3.7) | High | §4.6 |
| FE-ARCH-3 | `Quran.jsx` God component (48 useState/16 useEffect) causing real UX symptoms | High | §2.4 |
| FE-PERF-1 | `DsChart.jsx` — 400KB chunk, dead import, unnecessary weight for chart usage | High | §3.1 |
| FE-PERF-3 | All 6 i18n languages eagerly bundled into main chunk | High | §3.3 |
| FE-TEST-1 | True whole-codebase test coverage ~2-3%, not the reported 67% | High | §6.1 |
| FE-TEST-2 | Zero test coverage on all pages/forms/dashboards/API layer; no E2E at all | High | §6.2 |
| FE-UX-QURAN-1 | Confirmed reachable audio-resume-after-stop bug in Quran sync player | High | §8.4 |
| FE-UX-5 | `/#trial` cross-page CTA links are functionally broken | High | §8.2 |
| FE-ARCH-4 | `useQuranAudioEngine` doing too much in one hook (root cause of the above) | Medium | §2.4 |
| FE-ARCH-1 | Single global ErrorBoundary + Suspense | Medium | §2.1 |
| FE-ARCH-5 | 53 raw useEffect fetches bypass TanStack Query across 13 files | Medium | §2.5 |
| FE-PERF-2 | Legacy nomodule bundle adds ~44% extra bytes | Medium | §3.2 |
| FE-A11Y-2 | `useModalA11y` has no Tab focus-trap | Medium | §4.3 |
| FE-A11Y-4 | Gold accent tokens fail contrast as text (SC 1.4.3) | Medium | §4.7 |
| FE-A11Y-5 | ~50% of inline Arabic spans missing `lang="ar"` (SC 3.1.2) | Medium | §4.8 |
| FE-A11Y-6 | Tasbeeh/Adhkar counters have no aria-live feedback | Medium | §4.9 |
| FE-SEC-3 | `http.js` no response interceptor/timeout/retry | Medium | §5.3 |
| FE-SEC-6 | CSP missing Clarity/Tawk.to hosts | Medium | §5.5 |
| FE-TEST-3 | Real CSS syntax error in `dashboard-shell.css` | Medium | §6.3 |
| FE-TEST-4 | Prettier unenforced; 250 files + 1 hard error | Medium | §6.4 |
| FE-TEST-5 | No `engines`/`.nvmrc`; Node version drift already evidenced | Medium | §6.7 |
| FE-UX-6 | CoursesHub duplicate Hifz route | Medium | §8.2 |
| FE-UX-7 | CoursesQuran/CoursesArabic reference nonexistent CSS classes | Medium | §8.2 |
| FE-UX-8 | FAQ RTL selector targets wrong class name | Medium | §8.2 |
| FE-UX-DASH-1 | AdminUsersTab has no pagination despite showing a total | Medium | §8.5 |
| FE-UX-DASH-2 | No language switcher anywhere in the dashboard shell | Medium | §8.5 |
| FE-ARCH-2 | 3 of 5 contexts build unmemoized values (verified low real impact) | Low | §2.3 |
| FE-PERF-4 | Zero React.memo despite 164 useMemo/useCallback sites | Low | §3.4 |
| FE-SEC-4 | CSRF cookie parser truncates tokens containing `=` | Low | §5.3 |
| FE-SEC-5 | Hand-rolled sanitizer weaker than DOMPurify (defense-in-depth) | Low | §5.4 |
| FE-UX-9 | ResetPassword shows wrong copy for missing token | Low | §8.3 |
| FE-UX-10 | Enroll payment button has no double-submit guard | Low | §8.3 |
| FE-UX-11 | Missing trust signals at the Enroll payment step | Low | §8.3 |
| — | `react-hook-form` phantom dependency | Low | §6 / §2.6 |
| — | `VITE_DAILY_DOMAIN` dead config | Info | §5.6 |
| — | ESLint `no-unused-vars` pattern masks unused component imports | Low | §6.5 |
| — | `seoRoutes` drift from real routes (2 tool pages + all blog posts unindexed) | Low | §6.8 |

*(ARCH-1 was intentionally not re-scored as False Positive here since — unlike its backend counterpart's equivalent finding — this is a genuine, verified gap, not a mischaracterization.)*

---

## 10. Strengths (explicit, not to be re-litigated in later stages)

- **The student `Dashboard.jsx` empty-state and onboarding design** is genuinely excellent UX and should be the template for the rest of the app.
- **`AdminDashboard.jsx`'s tab accessibility** (full ARIA tablist pattern with roving tabindex and arrow-key navigation) is correctly implemented.
- **TanStack Query usage** — query-key factories, correct invalidation, graceful placeholder-data fallbacks — is idiomatic and matches current v5 best practice.
- **SC 3.3.8 Accessible Authentication** is fully compliant across all auth forms — correct autocomplete, no paste-blocking, working password-visibility toggles.
- **The CSP and security-header configuration** in `vercel.json` is thorough and well-scoped (missing only the two third-party widget hosts).
- **The hand-rolled HTML sanitizer**, while structurally weaker than DOMPurify, is logically sound against every attack vector traced in this audit.
- **Font-loading strategy** (eager Latin/deferred Arabic, with early-load overrides on Arabic-heavy pages) is a well-reasoned, already-optimized pattern.
- **The 11 existing tests are genuinely high-quality** integration-style tests, not shallow snapshots — the gap is breadth, not competence.
- **Route-level code-splitting** is comprehensive (confirmed: all ~48 pages are lazy-loaded, not partial).
- **`prefers-reduced-motion` handling** at the design-token level is correctly implemented.