# Deployment Checklist — Al-Rahma Academy

> Execute every step in order. Check each box before moving to the next.

---

## Phase 1 — Render (Backend) Setup

### 1.1 Environment Variables
Set the following in the Render dashboard under **Environment → Environment Variables**:

| Variable | Required | Notes |
|---|---|---|
| `MONGO_URI` | YES | Atlas connection string: `mongodb+srv://...` |
| `JWT_SECRET` | YES | Min 64 random characters |
| `JWT_EXPIRES_IN` | YES | e.g. `7d` |
| `CLIENT_URL` | YES | Exact Vercel-hosted production domain: `https://al-rahmaacademy.com` |
| `CRON_SECRET` | YES | Long random string |
| `RENEWAL_REMINDER_DAYS` | YES | `3` (or desired value) |
| `SMTP_HOST` | YES | `smtp.gmail.com` |
| `SMTP_PORT` | YES | `587` |
| `SMTP_USER` | YES | Gmail address |
| `SMTP_PASS` | YES | Gmail App Password (not account password) |
| `ADMIN_EMAIL` | YES | Notification recipient |
| `STRIPE_SECRET_KEY` | YES | Live key from Stripe dashboard |
| `STRIPE_WEBHOOK_SECRET` | YES | From Stripe → Webhooks → signing secret |
| `PAYPAL_MODE` | YES | `live` |
| `PAYPAL_CLIENT_ID` | YES | From PayPal developer console |
| `PAYPAL_CLIENT_SECRET` | YES | From PayPal developer console |
| `PAYPAL_WEBHOOK_ID` | YES | From PayPal → Webhooks |
| `ADMIN_JWT_ACCESS_SECRET` | YES | 64-byte hex (run: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`) |
| `ADMIN_ENCRYPTION_KEY` | YES | 64 hex chars / 32 bytes (run: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) — note the exact name: `backend/config/encryption.js` reads `ADMIN_ENCRYPTION_KEY`, not `ENCRYPTION_KEY` |
| `ADMIN_IP_WHITELIST` | Optional | Comma-separated IPs to restrict /api/v1/admin/* |
| `REDIS_URL` | Optional | Upstash Redis URL for cross-instance rate limiting |

- [ ] All required env vars set in Render dashboard
- [ ] `NODE_ENV` is `production` (already set in render.yaml)

### 1.2 Deploy Backend
- [ ] Trigger deploy from Render dashboard (or push to main branch)
- [ ] Watch deploy logs — confirm `🚀 Server running` and `✅ MongoDB connected`
- [ ] Test health: `curl https://<your-render-url>/api/health` → should return 200
- [ ] Verify HTTPS is active on the Render URL

---

## Phase 2 — Vercel (Frontend) Setup

`vercel.json` already rewrites `/api/*` to the Render backend, so the
frontend does **not** need `VITE_API_URL` set — it calls the relative `/api`
path and Vercel forwards it server-side. Before the first deploy, confirm
`vercel.json`'s `rewrites` entry points at the correct Render URL for this
environment.

### 2.1 Environment Variables
Set in Vercel → **Project Settings → Environment Variables**:

| Variable | Required | Value |
|---|---|---|
| `VITE_GA_ID` | YES (for analytics) | `G-XXXXXXXXXX` from GA4 property |

- [ ] `VITE_GA_ID` set to GA4 Measurement ID
- [ ] `vercel.json`'s `/api/:path*` rewrite target matches the live Render URL

### 2.2 Build Settings
Confirm in Vercel → **Project Settings → Build & Development Settings**
(these are already defined by `vercel.json` at the repo root, but verify):

| Setting | Value |
|---|---|
| Install command | `npm install --prefix frontend` |
| Build command | `npm run build --prefix frontend` |
| Output directory | `frontend/dist` |

- [ ] Build settings confirmed

### 2.3 Deploy Frontend
- [ ] Trigger deploy from Vercel dashboard or push to main
- [ ] Build completes without errors
- [ ] `sitemap.xml` is accessible: `https://al-rahmaacademy.com/sitemap.xml`
- [ ] `robots.txt` is accessible: `https://al-rahmaacademy.com/robots.txt`
- [ ] SPA deep links work (navigate directly to `/tools/quran-reader` — served via `vercel.json`'s catch-all rewrite to `index.html`)

---

## Phase 3 — Domain & HTTPS

- [ ] DNS A/CNAME records point to Vercel (check in domain registrar)
- [ ] Custom domain `al-rahmaacademy.com` configured in Vercel → Project → Domains
- [ ] Vercel SSL certificate issued and active (automatic)
- [ ] `alrahma-xi.vercel.app` (or your project's `.vercel.app` domain) redirects to `https://al-rahmaacademy.com` — already handled by `vercel.json`'s `redirects` entries; confirm it fires for your actual `.vercel.app` hostname
- [ ] HTTP → HTTPS redirect is enforced (automatic on Vercel)
- [ ] Backend Render URL also on HTTPS — verify `CLIENT_URL` on Render matches the Vercel production domain exactly

---

## Phase 4 — Verify CORS

Because `vercel.json` rewrites `/api/*` to Render server-side, the browser
should never see this as a cross-origin request (it only ever talks to
`al-rahmaacademy.com`). A CORS error here usually means the rewrite isn't
active or something is calling the Render URL directly.

- [ ] Open browser DevTools → Network tab
- [ ] Log in as a user → confirm no CORS errors in console
- [ ] API calls to `/api/*` return 200 (not blocked), and the request URL shown in DevTools is `al-rahmaacademy.com/api/...`, not the `.onrender.com` URL
- [ ] Confirm `CLIENT_URL` on Render matches the exact production domain including protocol (no trailing slash) — this is Render's own CORS allowlist, used as a fallback for any direct API access

---

## Phase 5 — Verify Cookies & Auth

- [ ] Log in → DevTools → Application → Cookies → confirm `httpOnly` auth cookie is present
- [ ] Confirm cookie has `Secure` flag (requires HTTPS — will fail on HTTP)
- [ ] Confirm cookie is `SameSite=Lax` (the code's actual setting, `backend/controllers/authController.js`) — this only works because Vercel's rewrite makes the request same-origin from the browser's perspective; it would need `SameSite=None` if the frontend ever called the Render URL directly instead of through the rewrite
- [ ] Log out → confirm cookie is cleared
- [ ] Test "Remember me" / token refresh flow

---

## Phase 6 — Payment Integration Test

### Stripe
- [ ] Switch Stripe keys from test to **live** in Render env vars
- [ ] Register a Stripe webhook endpoint pointing to: `https://<render-url>/api/payments/stripe/webhook` (matches `backend/routes/paymentRoutes.js` — not `/api/webhooks/stripe`)
- [ ] Test a real £1 / €1 charge through the enrollment flow
- [ ] Confirm Stripe webhook fires and subscription is created in DB

### PayPal
- [ ] Set `PAYPAL_MODE=live` in Render
- [ ] Register a PayPal webhook endpoint pointing to: `https://<render-url>/api/payments/paypal/webhook`
- [ ] Test PayPal checkout flow end-to-end
- [ ] Confirm PayPal webhook fires correctly

---

## Phase 7 — Functional Smoke Tests

Run manually after deploy:

- [ ] Home page loads — hero, pricing, testimonials visible
- [ ] Language switcher works: EN → AR (RTL) → DE → IT → FR → ES
- [ ] Dark / light mode toggle works
- [ ] Free Trial enrollment form submits successfully
- [ ] Login with valid credentials → Dashboard accessible
- [ ] Register new account → confirmation email received
- [ ] Quran Reader (`/tools/quran-reader`) loads and pages work
- [ ] Adhkar (`/tools/adhkar`) loads and category filter works
- [ ] Hadith Library (`/tools/hadith`) loads and search works
- [ ] Prayer Times (`/tools/prayer-times`) loads and requests location
- [ ] Qibla Compass (`/tools/qibla`) loads and shows direction
- [ ] Islamic Calendar (`/tools/islamic-calendar`) loads correctly
- [ ] Verse of the Day (`/tools/verse-of-the-day`) loads
- [ ] Tasbeeh Counter (`/tools/tasbeeh`) loads and counts
- [ ] Arabic Alphabet (`/tools/arabic-alphabet`) loads and audio plays
- [ ] Blog (`/resources/blog`) lists posts; clicking a post opens it
- [ ] FAQ (`/resources/faq`) accordion opens/closes
- [ ] Teachers page (`/academy/teachers`) loads; clicking a teacher opens profile
- [ ] 404 page shows on invalid URL (e.g. `/this-does-not-exist`)
- [ ] `/it/` and `/fr/` serve their static landing pages (not React SPA)
- [ ] Admin dashboard (`/admin`) accessible only to admin user

---

## Phase 8 — SEO & Search Console

- [ ] Submit `https://al-rahmaacademy.com/sitemap.xml` to Google Search Console
- [ ] Submit sitemap to Bing Webmaster Tools
- [ ] Verify GSC ownership (file `googleb1feea449608acbc.html` is deployed)
- [ ] Request indexing of the homepage in GSC
- [ ] Test OG previews: [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) → `https://al-rahmaacademy.com`
- [ ] Test Twitter Card: [Twitter Card Validator](https://cards-dev.twitter.com/validator) → `https://al-rahmaacademy.com`

---

## Phase 9 — Analytics

- [ ] `VITE_GA_ID` is set in Netlify and build re-deployed after setting it
- [ ] Open GA4 → Realtime → confirm page view fires on home page visit
- [ ] Navigate to `/courses` → confirm second page view fires in GA4 Realtime
- [ ] Link Google Search Console property to GA4 property

---

## Phase 10 — Monitoring Setup

- [ ] Set up UptimeRobot (free): monitor `https://al-rahmaacademy.com` + `https://<render-url>/api/health` every 5 minutes
- [ ] Configure alert emails for downtime
- [ ] Enable MongoDB Atlas automated backups (Daily, 7-day retention minimum)
- [ ] Confirm Render service health checks are enabled
- [ ] **Renewal-reminder cron:** add a *second* UptimeRobot monitor (or a GitHub Actions scheduled workflow) that calls `GET https://<render-url>/api/cron/renewal-reminders` once daily with header `Authorization: Bearer <CRON_SECRET>`. Nothing else in this stack triggers this endpoint — skipping this step means renewal reminders silently never send.

---

## Final Gate

- [ ] All Phase 1–10 items checked
- [ ] No console errors in browser DevTools on production site
- [ ] No 4xx/5xx errors in Render logs after smoke tests
- [ ] Team notified that site is live
