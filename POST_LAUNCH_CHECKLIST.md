# Post-Launch Checklist — Al-Rahma Academy

> Run these checks within the first 24 hours after going live.
> Fix anything marked CRITICAL before considering the launch stable.

---

## Hour 0–1: Immediate Verification

### Site Availability
- [ ] `https://al-rahmaacademy.com` loads with no SSL warning
- [ ] `https://www.al-rahmaacademy.com` redirects to non-www (no double-www)
- [ ] Response time < 3 seconds on first load (cold)
- [ ] `https://al-rahmaacademy.com/sitemap.xml` returns 200 and valid XML
- [ ] `https://al-rahmaacademy.com/robots.txt` returns 200 and correct content
- [ ] Backend health: `https://<render-url>/api/health` returns 200

### Auth & Cookies
- [ ] Login → cookie is `httpOnly` + `Secure` (DevTools → Application → Cookies)
- [ ] Logout clears the cookie
- [ ] Protected routes (`/dashboard`, `/admin`) redirect unauthenticated users to login

### CORS
- [ ] No CORS errors in browser console on any API call
- [ ] Login, enrollment form, and payment requests all succeed

---

## Hour 1–6: Functional Monitoring

### Error Monitoring
- [ ] Check Render logs for any 5xx errors or uncaught exceptions
- [ ] Check browser DevTools console — zero JS errors on home, courses, tools pages
- [ ] Check Netlify deploy log — no build warnings for the live deploy

### Request Rate
- [ ] Check Render metrics — CPU and memory within normal range (< 80%)
- [ ] No rate-limit errors appearing in logs (429 responses)
- [ ] MongoDB Atlas — connection pool not saturated

### Email
- [ ] Submit the free trial form → confirm email arrives in `ADMIN_EMAIL` inbox
- [ ] Register a new user account → confirm registration/welcome email arrives in inbox (not spam)
- [ ] Test password reset flow → confirm reset email arrives

### Payment
- [ ] Initiate a test enrollment through the full payment flow (use a real card if keys are live)
- [ ] Stripe dashboard → confirm payment appears under Payments
- [ ] Stripe webhook → confirm all webhook events show status "Succeeded"
- [ ] User subscription status updated correctly in the database

---

## Hour 6–12: Analytics & SEO

### Google Analytics
- [ ] GA4 Realtime → confirm active users visible
- [ ] Navigate between pages → confirm separate page_view events fire
- [ ] Check that `(not set)` is not appearing as the page title (indicates GA4 init issue)
- [ ] Confirm acquisition source/medium is being captured

### Google Search Console
- [ ] GSC ownership is confirmed (green tick on property)
- [ ] Sitemap submitted (`https://al-rahmaacademy.com/sitemap.xml`) → status "Success"
- [ ] No "Coverage errors" on any submitted URLs
- [ ] Request indexing for homepage manually

### Social Previews
- [ ] Facebook: test `https://al-rahmaacademy.com` in Facebook Sharing Debugger — OG image visible
- [ ] WhatsApp: share the URL in a chat — preview card appears with title + image
- [ ] `/it/` and `/fr/` pages also show correct OG preview when shared

---

## Hour 12–24: Stability & Performance

### Performance
- [ ] Run Lighthouse (Chrome DevTools) on production URL — Performance score ≥ 80
- [ ] LCP (Largest Contentful Paint) < 2.5 seconds on desktop
- [ ] No layout shift (CLS < 0.1) after fonts load
- [ ] Check Netlify Analytics (if enabled) — bandwidth and request counts normal

### Server Logs
- [ ] Review Render logs for any recurring error patterns
- [ ] No `MONGO_URI` or connection errors in logs
- [ ] Keep-alive ping logs visible every 14 minutes (confirms Render service stays warm)
- [ ] No unusual spikes in request rate (potential bot traffic)

### Backups
- [ ] MongoDB Atlas → Backup → confirm scheduled backups are active
- [ ] Verify at least one backup snapshot exists from today

### Uptime Monitoring
- [ ] UptimeRobot (or equivalent) shows both monitors as UP (green)
- [ ] Alert email test: temporarily pause a monitor → confirm alert email received → re-enable

---

## 24-Hour Sign-Off

Complete this section at the 24-hour mark:

| Check | Status | Notes |
|---|---|---|
| Zero 5xx errors in Render logs | | |
| Zero JS errors in production console | | |
| GA4 receiving data | | |
| GSC sitemap accepted | | |
| At least one successful payment processed | | |
| At least one successful trial form submission | | |
| Email delivery confirmed (no spam) | | |
| Backups active on Atlas | | |
| Uptime monitors green | | |
| Render keep-alive pinging correctly | | |

**Signed off by:** _______________  **Date/Time:** _______________

---

## Known Items Deferred to Future Releases

These are not blocking but should be addressed within 30 days of launch:

| Item | Priority | Notes |
|---|---|---|
| Cookie consent banner (GDPR) | HIGH | Required for EU users with GA4 active |
| Error monitoring (Sentry) | MEDIUM | Silent JS errors in production will be invisible |
| Redis for rate limiting | LOW | Current in-memory rate limiting resets on restart |
| `manifest.json` (PWA) | LOW | Not blocking; add if installability is desired |
| Favicon `.ico` format | LOW | Only `.svg` exists; some legacy browsers show broken tab icon |
