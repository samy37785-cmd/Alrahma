# 🚀 Deploying Al-Rahma Academy (getting a real `yourname.com` link)

The easiest setup hosts **everything on Vercel in one project**: the React site
*and* the API run on the same domain, so there's no CORS to configure and no
separate backend URL to wire up.

| Part | What it is | Folder |
|------|------------|--------|
| **Frontend** | The Vite/React site | `frontend/` → builds to `frontend/dist` |
| **Backend** | The API (Node + Express + MongoDB) | `backend/`, exposed as a serverless function via `api/index.js` |

Config is already prepared in **`vercel.json`**:
- installs both `frontend` and `backend` dependencies,
- builds the frontend to `frontend/dist`,
- routes every `/api/*` request to the Express app (`api/index.js`),
- falls back all other routes to `index.html` (SPA routing).

> Because the API lives at `/api` on the same domain, the frontend talks to it
> with a relative `/api` path in production — **no `VITE_API_URL` needed.**

---

## 1) Buy a domain (paid, ~$10/yr)
Buy e.g. `alrahmaacademy.com` from **Namecheap** or **GoDaddy**.
(The code already references `alrahmaacademy.com` in `index.html` — change it if
you pick another name.)

## 2) Deploy everything to Vercel
1. Push this project to GitHub.
2. Vercel → **Add New → Project** → import the repo.
3. Leave the build settings as-is — `vercel.json` already defines them. Vercel
   will install deps, build the frontend, and deploy `api/index.js` as a function.
4. Add the environment variables (next step) → **Deploy**.
5. You'll get a URL like `https://alrahma-xi.vercel.app`.

## 3) Environment variables (Vercel → Project → Settings → Environment Variables)
Add every secret from `backend/.env.example`:

```
MONGO_URI              your MongoDB Atlas connection string
JWT_SECRET             a long random string
JWT_EXPIRES_IN         7d
CLIENT_URL             https://alrahmaacademy.com   (your final domain)

SMTP_HOST              smtp.gmail.com
SMTP_PORT              587
SMTP_USER              your_email@gmail.com
SMTP_PASS              your Gmail App Password
ADMIN_EMAIL            your_email@gmail.com

STRIPE_SECRET_KEY      sk_live_...   (use sk_test_... until you go live)
STRIPE_WEBHOOK_SECRET  whsec_...     (from the webhook you create in step 5)

PAYPAL_MODE            live          (or sandbox while testing)
PAYPAL_CLIENT_ID       ...
PAYPAL_CLIENT_SECRET   ...
PAYPAL_WEBHOOK_ID      ...           (from the webhook you create in step 5)

VITE_GA_ID             G-XXXXXXXXX   (optional — your Google Analytics 4 Measurement ID)
```

> **Google Analytics:** create a GA4 property at analytics.google.com, copy its
> Measurement ID (`G-…`), and set it as `VITE_GA_ID` in Vercel → redeploy. Until
> it's set, analytics stay off (no tracking, nothing breaks). It's a build-time
> variable, so a **redeploy is required** after adding it.

> Vercel auto-injects `VERCEL_URL`, which CORS already allows — so preview
> deployments work without extra config.

## 4) Connect your domain
- Vercel → **Project → Settings → Domains** → add `alrahmaacademy.com`.
- Follow Vercel's DNS instructions at your registrar. HTTPS is automatic.
- Set **`CLIENT_URL`** to `https://alrahmaacademy.com` and redeploy.

## 5) Payment webhooks (do this once the domain is live)
- **Stripe** → Developers → Webhooks → add endpoint
  `https://alrahmaacademy.com/api/payments/stripe/webhook`
  → copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
  Events: `checkout.session.completed`, `invoice.paid`, `customer.subscription.deleted`.
- **PayPal** → your app → Webhooks → add
  `https://alrahmaacademy.com/api/payments/paypal/webhook`
  → copy the webhook id into `PAYPAL_WEBHOOK_ID`.
  Events: `CHECKOUT.ORDER.APPROVED`, `PAYMENT.CAPTURE.COMPLETED`.

## 6) WhatsApp / Facebook link preview image
`index.html` points `og:image` to `https://alrahmaacademy.com/og-cover.jpg`.
Export `frontend/public/og-cover.svg` → **`og-cover.jpg`** (1200×630) and put it
in `frontend/public/`. Then the image shows when the link is shared.

---

## Notes
- **Rate limiting** uses in-memory counters, which don't share state across
  serverless instances — fine for a small site, but for strict global limits
  you'd add a Redis-backed store later.
- A **`netlify.toml`** is still in the repo if you ever want to host the frontend
  on Netlify instead. In that case the API stays on Vercel and you must set
  `VITE_API_URL=https://<your-vercel-app>/api` on Netlify and add the Netlify
  origin to `CLIENT_URL`. The all-in-one Vercel setup above avoids this.

### Quick temporary public link (no domain, for testing)
With the dev server running (`npm run start`), in a new terminal:
```
npx cloudflared tunnel --url http://localhost:5173
```
It prints a public `https://…trycloudflare.com` link you can open/share from any
phone — works while it's running. Good for a quick demo, not a permanent address.
