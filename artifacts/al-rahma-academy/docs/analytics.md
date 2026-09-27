# Analytics (GA4, consent-gated)

## Configuration

| Variable | Where | Value |
|---|---|---|
| `VITE_GA_MEASUREMENT_ID` | Vercel → Project → Settings → Environment Variables (Production) | The GA4 web stream's Measurement ID (`G-…`) |

- Never commit the ID. It is read at build time, so a redeploy is needed after setting it.
- Unset (or not a valid `G-…` ID) = analytics fully off: no banner, no Cookie settings link, no Privacy section, nothing loaded.
- `VITE_GA_ID` and Microsoft Clarity (`VITE_CLARITY_ID`) are no longer used.

## Behaviour

- Nothing from Google is loaded or sent until the visitor clicks **Accept analytics** in the banner (`src/components/ui/ConsentBanner.jsx`). The choice is stored in `localStorage` under `alrahma.analyticsConsent.v1`.
- **Cookie settings** (Footer, Privacy page) re-opens the banner. Choosing **Reject** after accepting sets GA's `ga-disable-<ID>` flag and deletes the `_ga` / `_ga_*` cookies.
- The GA tag is injected once (`#alrahma-ga4`). Google signals and ad personalisation are off, and ad consent types are `denied`.
- Only the events and parameters listed in `EVENT_PARAMS` (`src/analytics/ga.js`) can be sent. Every value is pattern-checked:

| Event | Parameters |
|---|---|
| `page_view` | `page_path`, `page_location` (origin + pathname, no query/hash), `site_lang` |
| `enroll_view` | `page_path`, `site_lang` |
| `enroll_step_view` | `page_path`, `site_lang`, `step` (number) |
| `whatsapp_click` / `email_click` | `page_path`, `site_lang` (links to the academy's own number/address only) |
| `faq_show_all` | `page_path`, `site_lang` |
| `adhkar_category_change` | `page_path`, `site_lang`, `category` (fixed key, e.g. `sabah`) |

No form values, names, emails, phone numbers, submits, bookings or payments are tracked.

## Required GA4 web stream settings

Enhanced Measurement is on, but two of its options conflict with the rules above and **must be turned off** in GA4 → Admin → Data streams → Web → Enhanced measurement:

1. **Page views → "Page changes based on browser history events"**: off. The app sends its own SPA `page_view` without query strings, and leaving this on would send duplicates that include the full URL.
2. **Form interactions**: off. This option sends `form_start` / `form_submit`, and form tracking is out of scope.

Also review **Site search**. It reads query parameters such as `q` and `s`. Turn it off unless the site has a search results page that needs it.
