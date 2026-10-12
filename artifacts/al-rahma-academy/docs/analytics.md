# Analytics (GA4, consent-gated)

## Configuration

| Variable | Where | Value |
|---|---|---|
| `VITE_GA_MEASUREMENT_ID` | Vercel → Project → Settings → Environment Variables, **Production only** (not Preview or Development) | The GA4 web stream's Measurement ID (`G-…`) |

- Never commit the ID. Vite bakes it in at build time, so a Production redeploy of `main` is needed after setting it. Preview builds stay analytics-free.
- Unset (or not a valid `G-…` ID) = analytics fully off: no banner, no Cookie settings link, no Privacy section, nothing loaded.
- `VITE_GA_ID` and Microsoft Clarity (`VITE_CLARITY_ID`) are no longer used.

## Behaviour

- Nothing from Google is loaded or sent until the visitor clicks **Accept analytics** in the banner (`src/components/ui/ConsentBanner.jsx`). The choice is stored in `localStorage` under `alrahma.analyticsConsent.v1`.
- **Cookie settings** (Footer, Privacy page) re-opens the banner. Choosing **Reject** after accepting sets GA's `ga-disable-<ID>` flag and deletes the `_ga` / `_ga_*` cookies.
- The GA tag is injected once (`#alrahma-ga4`). Google signals and ad personalisation are off, and ad consent types are `denied`.
- Only the events and parameters listed in `EVENT_PARAMS` (`src/analytics/ga.js`) can be sent. Every value is pattern-checked:

| Event | Parameters |
|---|---|
| `page_view` | `page_path`, `page_location` (origin + pathname, no hash; the only query kept is the campaign tags below), `site_lang` |
| `enroll_view` | `page_path`, `site_lang` |
| `enroll_step_view` | `page_path`, `site_lang`, `step` (number) |
| `whatsapp_click` / `email_click` | `page_path`, `site_lang` (links to the academy's own number/address only) |
| `faq_show_all` | `page_path`, `site_lang` |
| `adhkar_category_change` | `page_path`, `site_lang`, `category` (fixed key, e.g. `baadSalah`) |
| `booking_submitted` | `page_path`, `site_lang`. Sent by `submitEnrollment()` only after `POST /api/enrollments` succeeds |
| `trial_submitted` | `page_path`, `site_lang`, `form` (`trial_section` / `quick_trial` / `exit_intent`). Sent by `submitTrial()` only after `POST /api/trials` succeeds |

The two `*_submitted` events are the site's conversions. They carry nothing from the form (no name, email, phone, plan or booking reference), and an analytics error can never make an accepted request look failed.

### Key events (GA4 UI, one-time)

After the first `booking_submitted` and `trial_submitted` arrive, mark both as key events: Admin → Data display → Events → star the event (or Key events → New key event → the exact event name). This only changes reporting; nothing in the app depends on it.

## Campaign links (utm_*)

GA4 takes a visit's source and campaign from `utm_*` tags in `page_location`. The app keeps only `utm_source`, `utm_medium`, `utm_campaign`, `utm_content` and `utm_term`, in that order, and only when the value matches `[A-Za-z0-9._-]{1,100}`. Every other query parameter (`email`, `teacher`, `plan`, `fbclid`, `gclid`, …) is dropped, and so is a tag whose value contains `@`, `+`, spaces or anything else outside that set. Without tags, an Instagram or WhatsApp visit usually shows as Direct.

Use lowercase values with `_` or `-`, for example:

- Instagram bio: `https://al-rahmaacademy.com/it/?utm_source=instagram&utm_medium=social&utm_campaign=bio`
- WhatsApp status: `https://al-rahmaacademy.com/it/enroll?utm_source=whatsapp&utm_medium=social&utm_campaign=status`
- Meta ad: `https://al-rahmaacademy.com/it/?utm_source=meta&utm_medium=paid_social&utm_campaign=<campaign_name>`

The tags count only for visitors who accept analytics on the page they land on: a visitor who browses to another page before accepting lands in GA without them.

## GA4 web stream settings (applied)

Stream "AL-Rahma Academy – Web" (`https://al-rahmaacademy.com`). Enhanced measurement is enabled only because GA does not allow "Page loads" to be switched off. Everything else is off, so the only events are the app's allow-listed ones:

| Setting | State | Why |
|---|---|---|
| Page views → Page loads | on (locked by GA) | Inert: the app configures the tag with `send_page_view: false` |
| Page views → Page changes based on browser history events | **off** | The app sends its own SPA `page_view`, with no query string except the campaign tags |
| Scrolls | **off** | Not needed |
| Outbound clicks | **off** | Would send `mailto:` / WhatsApp URLs, which contain the email address / phone number |
| Site search | **off** | Reads query parameters |
| Form interactions | **off** | Form tracking is out of scope |
| Video engagement | **off** | Not needed |
| File downloads | **off** | Not needed |

Keep these settings off. Turning any of them back on bypasses the allow-list in `ga.js`.
