# 06 — Component Inventory

> Every reusable component with responsibilities, key props, and reuse notes. Grouped by directory. Source: [frontend/src/components/](../../frontend/src/components/). Design-token/CSS detail: [09_DESIGN_SYSTEM_REQUIREMENTS.md](09_DESIGN_SYSTEM_REQUIREMENTS.md).

Part of the [Product Documentation set](MASTER_PRODUCT_SPEC.md).

**[needs verification]** Prop lists below are drawn from the exploration inventory (which read the components) — those explicitly named are confirmed; components where props are marked "—" were catalogued by role but their full prop signatures were not individually transcribed. Confirm exact signatures against the source before relying on them for a rebuild.

---

## 1. Layout ([components/layout/](../../frontend/src/components/layout/))

| Component | Responsibility | Key props |
|---|---|---|
| `Header.jsx` | Public top nav: 4 mega-dropdowns, Enroll CTA, command palette (Ctrl+K), lang switcher, dark toggle, message bell, role-aware user dropdown, mobile drawer | — |
| `NavDropdown.jsx` | Desktop/mobile dropdown group; exports `ICON_SIZE` | `state`, `label`, `items[]`, `hubTo`, `isActive`, `closeAll`, `viewAllLabel`, `allLabel`, `wide` |
| `NavIcon.jsx` | Maps a nav item's `icon` key → rendered lucide icon | `icon` |
| `DashboardLayout.jsx` | Authenticated shell: collapsible sidebar + top header + mobile bottom nav; sidebar from `dashboardNav.js` | `children` |
| `MobileBottomNav.jsx` | Mobile bottom tab bar | `isAdmin`, `isTeacher`, `isParent`, `unreadCount` |
| `dashboardNav.js` | **Source of truth** for role menus: `navFor()`, `bottomNavFor()`, `roleLabel()` | (config module) |
| `TopBar.jsx` / `PageBar.jsx` | Simpler top/page bars for non-dashboard inner pages | — |
| `Brand.jsx` | Brand link/logo with home-scroll behavior | — |
| `Footer.jsx` | Site footer | — |

## 2. UI primitives & infra ([components/ui/](../../frontend/src/components/ui/))

### Guards & infrastructure
| Component | Responsibility | Key props |
|---|---|---|
| `ProtectedRoute.jsx` | Route guard (auth / `adminOnly` / `role`) | `adminOnly`, `role`, `children` |
| `AdminSessionGate.jsx` | Requires AdminUser MFA session, else → `/admin/login` | `children` |
| `ErrorBoundary.jsx` | Global error boundary (Sentry) — **tested** | `children` |
| `ContentGuard.jsx` | Content-visibility guard | — |
| `RoutePrefetcher.jsx` | Prefetches route chunks via `routePreloadMap.js` | — |
| `ScrollToTop.jsx` | Scroll reset on route change | — |
| `Analytics.jsx` | Analytics wiring | — |
| `DeferredSection.jsx` | Defers offscreen render — **tested** | `children` |

### Brand & atoms
| Component | Responsibility | Key props |
|---|---|---|
| `BrandIcon.jsx` | **Single source of truth** brand mark; `useId()`-scoped gradients | `tile`, `tone` |
| `BrandLockup.jsx` | Icon + wordmark card (Cinzel/Cairo self-hosted) | `orientation`, `plain`, `showBismillah`, `size` |
| `Icons.jsx` | Shared icon set | — |
| `Avatar.jsx` | User avatar (initials fallback via `nameInitials`) | `name`, `size` |
| `Skeleton.jsx` | Loading skeleton | — |
| `ProgressRing.jsx` | Circular progress | — |
| `Reveal.jsx` | Scroll-reveal wrapper (`useScrollReveal`) | — |
| `MobileCarousel.jsx` | Touch carousel | — |
| `Breadcrumbs.jsx` | Breadcrumb trail | — |
| `chartColors.js` / `DsChart.jsx` | Dashboard chart palette + wrapper | — |

### Modals ([ADR 0002](../adr/0002-single-modal-component.md))
| Component | Responsibility | Notes |
|---|---|---|
| `Modal.jsx` | **Canonical** dialog chrome (`.ds-modal` + `useModalA11y`) | All new dialogs must use this |
| `QuickTrialModal.jsx` | Free-trial lead capture | Documented exception (marketing styling) |
| `InvoiceModal.jsx` | Invoice view/print | Documented exception (print CSS) |
| `CheckoutModal.jsx` | Plan + coupon + gateway selection | Core revenue UI |
| `ResourceModal.jsx` | Course resource viewer — a11y **tested** | |
| `VerseCardModal.jsx` | Shareable verse card | |
| `CertificateCard.jsx` | Certificate render + print template | XSS-safe (security **tested**) |

### Nav / search / engagement
| Component | Responsibility | Key props |
|---|---|---|
| `CommandPalette.jsx` | Global Ctrl+K search (courses/teachers/global) | `onClose` |
| `LangSwitcher.jsx` | Locale switcher (6 langs) | — |
| `NotificationPanel.jsx` | Bell dropdown (unread poll) — **tested** | `onClose` |
| `LiveChat.jsx` | Live chat widget | — |
| `WhatsappFab.jsx` | WhatsApp floating action button | — |
| `ExitIntentPopup.jsx` | Exit-intent conversion popup | — |
| `CancelSurvey.jsx` | Cancellation survey | — |
| `MilestoneCelebration.jsx` | XP/level-up celebration | — |
| `ShareAchievement.jsx` | Share achievement | — |
| `ReferralCard.jsx` | Referral code + share | — |
| `PreviewBanner.jsx` | **Honest-data banner** for mock surfaces — **tested** | — |
| `WishlistButton.jsx` | Add/remove wishlist | `courseId` |
| `QuranAudioPlayer.jsx` | Quran audio player | — |

## 3. Feature components ([components/features/](../../frontend/src/components/features/))

### `marketing/` (Home sections)
`Hero`, `Features`, `Courses`, `Pricing`, `Testimonials`, `Steps`, `Trial`, `Newsletter`, `Tutors`, `FAQ`, `About`, `JoinCTA`, `StatsBanner`, `TrustBar`, `TrustBadges`, `LiveCounter`, `IsnadChain`, `LevelQuiz`.

### `dashboard/` (student cards)
`CourseCard`, `UpcomingClassCard`, `HifzProgressCard`, `WeeklyChart` (+`weekBars.js`), `SpiritualPulseCard`, `SmartPlannerCard`, `DailyWisdomCard`, `TutorReviewWidget` (**tested**).

### `admin/` (console tabs)
`AdminUsersTab`, `AdminCoursesTab`, `AdminPaymentsTab`, `AdminTrialsTab`, `AdminStaffTab`, `AdminClassesTab`, `AdminNewsletterTab`, `AdminCommunityTab`, `AdminReviewsTab`, `AdminProgressModal`.

### `quran/` (reader building blocks — most complex surface)
`QuranSidebar`, `QuranTopBar`, `QuranControls`, `QuranReadingControls`, `QuranHifzControls`, `QuranVerseList`, `QuranMushafPage` (a11y **tested**), `QuranChapterHeader`, `QuranFloatingBar`, `QuranQuickNav`, `QuranPlayer`, `QuranSyncPlayer`, `QuranRecordingStudio`, `ReadingModeSwitch`, `TafsirPanel`, `TafsirPicker`.

### `tools/`
`Tasbeeh`, `QiblaCompass`, `AlphabetLearner`.

### `courses/`
`IslamicStudiesBookCard`, `CourseReviews` (**tested**).

### `enrollment/` / `parent/` / `teacher/`
`EnrollWizard`; `ChildModal`; `StudentModal`.

---

## 4. Supporting layers (reused as building blocks)

### Contexts ([context/](../../frontend/src/context/) — note: `context/`, not `contexts/`)
`AuthContext` (`useAuth`), `AdminAuthContext` (`useAdminAuth`), `LangContext` (`useLang` → `{lang,setLang,t}`), `ThemeContext` (`useTheme` → `{dark,toggle}`), `TrialContext` (`useTrial`), `QueryProvider`.

### Hooks ([hooks/](../../frontend/src/hooks/))
- **Quran:** `useQuranAudioEngine`, `useQuranHifz`, `useQuranRecorder`, `useQuranBookmarks`/`useAddBookmark`/`useRemoveBookmark`/`useIsBookmarked`, `useQuranProgress`, `useQuranMemoStats`, `useQuranKeyboard`, `useQuranVerseActions`.
- **Domain (React Query):** `useCourses`, `useDashboard`, `useBilling`, `useBlog`, `useCommunity`, `useWishlist`, `useAiTutor`, `useSearch`.
- **UI/utility:** `useDropdown`, `useFocusTrap`, `useEscapeKey`, `useModalA11y`, `useScrollReveal`, `useSwipeNavigation`, `useSpeech`, `useCountUp`, `useSEO`.

### API layer ([api/](../../frontend/src/api/))
Infra: `http.js`, `adminHttp.js`, `csrf.js`, `cache.js`, `index.js`. Domain files: `authApi`, `adminAuthApi`, `adminApi`, `courseApi`, `enrollmentApi`, `paymentApi`, `classApi`, `messageApi`, `notificationApi`, `parentApi`, `teacherApi`, `communityApi`, `reviewApi`, `blogApi`, `contentApi`, `wishlistApi`, `aiTutorApi`, `searchApi`, `quran.js`, `quranBookmarkApi`, `quranMemoApi`, `quranProgressApi`. **Rule:** no raw axios/fetch in components — all calls go through these.

---

## 5. Component-system conventions (critical for a rebuild)

- **Three disjoint CSS generations** with non-colliding selector namespaces (audited zero collisions — do **not** add a fourth): `components.css` (`.card`, `.badge`), `dashboard-shell.css` (`.ds-card`, `.ds-badge`, `.ds-table`), `design-system.css` (`.ds-modal`, `.ds-drawer`, `.ds-toast`, `.ds-tooltip`, `.ds-menu`, `.ds-tabs`, `.ds-accordion`, `.ds-pagination`, `.ds-progress`). Plus the `.btn` system in `global.css`. Full catalogue in [09_DESIGN_SYSTEM_REQUIREMENTS.md](09_DESIGN_SYSTEM_REQUIREMENTS.md).
- **Single-Modal rule** ([ADR 0002](../adr/0002-single-modal-component.md)): `Modal.jsx` is canonical; only two documented exceptions remain (`InvoiceModal`, `QuickTrialModal`); legacy bespoke modals are being migrated one PR at a time.
- **Brand mark is duplicated across 5 places** (BrandIcon + `favicon.svg`, `og-cover.svg`, `index.html` loading screen, `CertificateCard` print template) — changing the mark means updating all five.

---

## 6. Reuse opportunities (observed)

- **Modal consolidation** already in progress (ADR 0002) — the two remaining exceptions are candidates to normalize.
- **Card variants** span three CSS generations (`.card`, `.ds-card`) — a rebuild should collapse to one card primitive.
- **Two notification/message bells** (Header vs DashboardLayout) both poll independently — candidate for a shared notification component (see [13_MISSING_COMPONENTS.md](13_MISSING_COMPONENTS.md)).
- **Empty-state rendering is ad hoc** per page — a shared `EmptyState` component would remove duplication (see [13_MISSING_COMPONENTS.md](13_MISSING_COMPONENTS.md)).
- **Admin tabs** share table/pagination/search patterns but are separate components — a generic admin `DataTable` would reduce repetition.
