# 🚀 Deploying Al-Rahma Academy (getting a real `yourname.com` link)

The app has two parts that must both go online:

| Part | What it is | Where to host (free tier) |
|------|------------|---------------------------|
| **Frontend** | The Vite/React site (this folder → `dist`) | **Netlify** or **Vercel** |
| **Backend** | The API in `server/` (Node + Express + MongoDB) | **Render** or **Railway** |

Config files are already prepared: `netlify.toml`, `vercel.json`, `public/_redirects` (SPA routing).

---

## 1) Buy a domain (you must do this — it's paid, ~$10/yr)
Buy e.g. `alrahmaacademy.com` from **Namecheap** or **GoDaddy**.
(The code already references `alrahmaacademy.com` in `index.html` — change it if you pick another name.)

## 2) Deploy the backend (Render)
1. Push this project to GitHub.
2. Render → **New → Web Service** → pick the repo → **Root Directory:** `server`.
3. Build command: `npm install` · Start command: `node server.js`.
4. Add all variables from `server/.env` (MONGO_URI, JWT_SECRET, SMTP_*, PAYMOB_*, PAYPAL_*…).
   - Set **`CLIENT_URL`** to your frontend domain (step 3), e.g. `https://alrahmaacademy.com`.
5. Deploy → copy the public URL, e.g. `https://alrahma-api.onrender.com`.

## 3) Deploy the frontend (Netlify)
1. Netlify → **Add new site → Import from GitHub** → pick the repo.
2. Build command `npm run build` · Publish directory `dist` (already in `netlify.toml`).
3. **Environment variables → add:**
   ```
   VITE_API_URL = https://alrahma-api.onrender.com/api
   ```
   (your backend URL from step 2, with `/api` at the end)
4. Deploy. You'll get a temporary URL like `https://al-rahma.netlify.app`.

> Note: locally `.env` keeps `VITE_API_URL=/api` (uses the dev proxy). In production the host env var above takes over.

## 4) Connect your domain
- In Netlify → **Domain settings → Add custom domain** → enter `alrahmaacademy.com`.
- Follow Netlify's DNS instructions (point your registrar's nameservers/records to Netlify). HTTPS is automatic.
- Done → `https://alrahmaacademy.com` now opens for **anyone** (including WhatsApp on any phone).

## 5) Backend CORS
Make sure the backend allows the frontend origin. In `server/` CORS config / `CLIENT_URL`, set it to `https://alrahmaacademy.com`.

## 6) WhatsApp link preview image
`index.html` points `og:image` to `https://alrahmaacademy.com/og-cover.jpg`.
Export `public/og-cover.svg` → **`og-cover.jpg`** (1200×630) with any tool (e.g. an online SVG→JPG converter or Figma) and put it in `public/`. Then the image shows when the link is shared on WhatsApp/Facebook.

---

### Quick alternative — a TEMPORARY public link (no domain, for testing)
With the dev server running (`npm run start`), in a new terminal:
```
npx cloudflared tunnel --url http://localhost:5173
```
It prints a public `https://…trycloudflare.com` link you can open/share from any phone — works while it's running. (Good for a quick demo, not a permanent address.)
