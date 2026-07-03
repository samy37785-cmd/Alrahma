# 🚀 Deploying Al-Rahma Academy (getting a real `yourname.com` link)

The live setup uses **two platforms**: Vercel serves the React site (static
build only), and Render runs the API as its own always-on server. Vercel's
`vercel.json` forwards every `/api/*` request to the Render URL, so from the
browser's point of view it still looks like one origin — no CORS headaches,
no separate API URL to configure on the frontend.

| Part | What it is | Folder | Hosted on |
|------|------------|--------|-----------|
| **Frontend** | The Vite/React site | `frontend/` → builds to `frontend/dist` | Vercel |
| **Backend** | The API (Node + Express + MongoDB) | `backend/`, run as `node server.js` | Render |

Config is already prepared:
- **`vercel.json`** — installs and builds only `frontend/`, rewrites every
  `/api/*` request to the Render backend URL, and falls back all other
  routes to `index.html` (SPA routing).
- **`render.yaml`** — tells Render to install `backend/` and start it with
  `node server.js` as a standalone web service (not a function — it stays
  running).

> Because `/api/*` is rewritten transparently, the frontend still talks to
> the API with a relative `/api` path in production — **no `VITE_API_URL`
> needed.**

---

## 1) Buy a domain (paid, ~$10/yr)
Buy e.g. `al-rahmaacademy.com` from **Namecheap** or **GoDaddy**.
(The code already references `al-rahmaacademy.com` in `index.html` and the
sitemap — change it everywhere if you pick a different name.)

## 2) Deploy the backend to Render
1. Push this project to GitHub.
2. Render → **New → Blueprint** → point it at the repo. Render reads
   `render.yaml` and creates the `Alrahma-1` web service automatically
   (root directory `backend/`, build `npm install`, start `node server.js`).
3. Add every backend environment variable from `backend/.env.example` in
   Render → **Environment** (see step 4 below) → deploy.
4. You'll get a URL like `https://alrahma-1.onrender.com`. Confirm
   `https://<that-url>/health` returns `200`.

## 3) Deploy the frontend to Vercel
1. Vercel → **Add New → Project** → import the same repo.
2. Leave the build settings as-is — `vercel.json` already defines them
   (installs/builds `frontend/` only, outputs `frontend/dist`).
3. Before the first deploy, edit `vercel.json`'s `rewrites` entry so
   `/api/:path*` points at **your own** Render URL from step 2 (it currently
   points at the project owner's `alrahma-1.onrender.com`).
4. Deploy. You'll get a URL like `https://<your-project>.vercel.app`.

## 4) Environment variables

**On Render** (Project → Environment), add every secret from
`backend/.env.example`:

```
MONGO_URI              your MongoDB Atlas connection string
JWT_SECRET             a long random string
JWT_EXPIRES_IN         7d
CLIENT_URL             https://al-rahmaacademy.com   (your final frontend domain)

SMTP_HOST              smtp.gmail.com
SMTP_PORT              587
SMTP_USER              your_email@gmail.com
SMTP_PASS              your Gmail App Password
ADMIN_EMAIL            your_email@gmail.com

STRIPE_SECRET_KEY      sk_live_...   (use sk_test_... until you go live)
STRIPE_WEBHOOK_SECRET  whsec_...     (from the webhook you create in step 6)

PAYPAL_MODE            live          (or sandbox while testing)
PAYPAL_CLIENT_ID       ...
PAYPAL_CLIENT_SECRET   ...
PAYPAL_WEBHOOK_ID      ...           (from the webhook you create in step 6)

ADMIN_JWT_ACCESS_SECRET  64-byte hex — node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
ADMIN_ENCRYPTION_KEY     32-byte hex — node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CRON_SECRET              a long random string (see step 7)
```

**On Vercel** (Project → Settings → Environment Variables), only the
frontend build-time variable is needed:

```
VITE_GA_ID             G-XXXXXXXXX   (optional — your Google Analytics 4 Measurement ID)
```

> **Google Analytics:** create a GA4 property at analytics.google.com, copy
> its Measurement ID (`G-…`), and set it as `VITE_GA_ID` in Vercel →
> redeploy. Until it's set, analytics stay off (no tracking, nothing
> breaks). It's a build-time variable, so a **redeploy is required** after
> adding it.

## 5) Connect your domain
- Vercel → **Project → Settings → Domains** → add `al-rahmaacademy.com`.
  Follow Vercel's DNS instructions at your registrar. HTTPS is automatic.
- Set **`CLIENT_URL`** on Render to `https://al-rahmaacademy.com` and
  redeploy the backend (this is what CORS checks against — a mismatch here
  will block every API call from the live site).

## 6) Payment webhooks (do this once the domain is live)
Webhooks must point at the **Render** URL — that's where the API actually
lives, not the Vercel domain.
- **Stripe** → Developers → Webhooks → add endpoint
  `https://alrahma-1.onrender.com/api/payments/stripe/webhook`
  → copy the signing secret into `STRIPE_WEBHOOK_SECRET` on Render.
  Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`.
- **PayPal** → your app → Webhooks → add
  `https://alrahma-1.onrender.com/api/payments/paypal/webhook`
  → copy the webhook id into `PAYPAL_WEBHOOK_ID` on Render.
  Events: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`.

## 7) Renewal-reminder cron — needs an external scheduler
Neither Vercel nor Render runs a scheduled job for this project. The
renewal-reminder and weekly-parent-report emails only fire if something
outside this repo calls the endpoint on a schedule:

- Sign up for a free scheduler, e.g. [UptimeRobot](https://uptimerobot.com)
  (HTTP(s) monitor, "keyword" type won't work — use a plain GET check) or a
  GitHub Actions scheduled workflow.
- Point it at `GET https://alrahma-1.onrender.com/api/cron/renewal-reminders`
  once a day, with header `Authorization: Bearer <CRON_SECRET>` (the same
  value you set on Render in step 4).
- **Without this step configured, renewal reminders will not be sent** —
  this is easy to miss because the site otherwise works normally.

## 8) WhatsApp / Facebook link preview image
`index.html` points `og:image` to `https://al-rahmaacademy.com/og-cover.jpg`.
Export `frontend/public/og-cover.svg` → **`og-cover.jpg`** (1200×630) and put it
in `frontend/public/`. Then the image shows when the link is shared.

---

## Notes
- **Rate limiting** uses in-memory counters per Render instance by default;
  if you scale the Render service to more than one instance, set `REDIS_URL`
  (e.g. an Upstash Redis) so limits are shared and enforced correctly across
  instances.
- A **`netlify.toml`** is still in the repo as an alternative frontend host,
  but it isn't referenced by the live `vercel.json`/CSP config — treat it as
  unused unless you deliberately switch to it.

### Quick temporary public link (no domain, for testing)
With the dev server running (`npm run start`), in a new terminal:
```
npx cloudflared tunnel --url http://localhost:5173
```
It prints a public `https://…trycloudflare.com` link you can open/share from any
phone — works while it's running. Good for a quick demo, not a permanent address.
