# Official Logo Integration

This is the real source-to-asset pipeline behind `public/brand/*` and
`BrandIcon.jsx`, written after a corrective pass fixed two real defects in
the first version of this work (dirty alpha matte, dimension claims that
didn't match the actual files). Everything below describes what is
currently true of the committed assets — re-derive facts from the files
themselves if this doc and reality ever disagree.

## 1. The four original source images

The project owner supplied four official renders, saved into the repo at
`attached_assets/logo-src/` — tracked in git, byte-for-byte as delivered,
never modified, and never copied into `public/` (so they're archived
alongside the code but never served to site visitors). This location was
kept rather than moved: it's already outside `public/`, already git-tracked
territory for handoff material in this repo (`attached_assets/` holds other
project handoff files), and the four filenames are self-describing enough
that moving them wouldn't add clarity, only churn.

| File | Dimensions | SHA-256 |
|---|---|---|
| `logo-icon-tile.png` | 1254×1254 | `7c6366cb66dc260207038c6bd89e5d8dd388c8d8a30d111f1564e7eeda90d6cc` |
| `logo-vertical-bismillah.png` | 1173×1341 | `d788f969895afd159c99d2e42bd9681482e97a90c64d878279b0bc38b7d570bd` |
| `logo-horizontal-bismillah.png` | 1498×1050 | `1f0d7ef448a45947868b3c0daeaa0dc4480d37011d8b9992a8e7343100b9ade2` |
| `logo-horizontal-compact.png` | 1496×1051 | `5c905879bbb8a95f5684f77ea6d897e992822cd219bbc341e1d97f6102e56452` |

All four depict the same icon design (a green mosque dome with a gold
minaret and crescent, resting on a two-tone green/gold open-book/leaf
shape) at different compositions — `logo-icon-tile.png` is icon-only on its
own rounded-square plate; the other three are lockups (icon + wordmark),
two horizontal and one vertical, with/without a Bismillah line.

**They are not pixel-identical** — do not take that on faith from similar
aspect ratios. Measured directly: the icon glyph was cropped out of both
`logo-vertical-bismillah.png` and `logo-horizontal-compact.png`, each
normalized to the same 300×300 frame, and diffed per-channel. Result: mean
absolute channel difference 8.93/255 (~3.5%), max difference 255/255 (full
range on at least some pixels, mostly at edges/registration). That's a
closely-matching design variant rendered twice, not a single asset reused —
consistent with each lockup being an independent render of the same brief
rather than derived from one master file. This is exactly why the pipeline
below commits to using **one single canonical source** for the icon glyph,
rather than treating any two of these as interchangeable.

## 2. Canonical source per asset type

| Output | Canonical source | Why |
|---|---|---|
| `public/brand/icon.png` (transparent icon) | `logo-vertical-bismillah.png`, icon region cropped at `{left:316, top:162, width:484, height:560}` | Of the three renders whose icon sits directly on the flat background (not on its own plate), this crop has the highest native pixel resolution (484×560 vs `logo-horizontal-compact.png`'s 401×462), so less downstream resampling. |
| `public/brand/icon-tile-*.png`, `favicon.ico`, the maskable icon | The **clean glyph from `icon.png` above**, composited onto a designer-built flat rounded-square background (see §4) | Not cropped directly from `logo-icon-tile.png`'s own rendered plate — that plate has its own gradient/gloss lighting baked in, which made a clean per-size crop with consistent padding impractical (tried first; abandoned — see §5). `logo-icon-tile.png` contributes only a **reference color sample** (`rgb(15,58,52)`, sampled from several flat points on its plate) used as the synthetic tile's background color — not raw pixel content. |
| Everything else (`logo-horizontal-bismillah.png`, `logo-horizontal-compact.png`'s full lockup, both baked-text lockups) | **Not used** | See §3. |

## 3. Why the icon, not raster lockup text

Two of the four source images bake the "AL-RAHMA ACADEMY" + Arabic +
Bismillah wordmark directly into the raster art, at a fixed resolution and
in specific display fonts with custom lighting/shadow effects. The app's
`BrandLockup` component already renders that same wordmark as **live text**
(Cinzel/Cairo/Amiri webfonts via CSS), which:

- stays crisp at any size/DPI, where a raster crop of the source wordmark
  would blur or alias once scaled down to the header's ~40px icon height —
  exactly the small-illegible-text failure mode this project was told to
  avoid;
- is unaffected by browser zoom, forced-colors mode, or any future
  translation of the wordmark, none of which apply to a flattened image.

So only the **icon glyph** was extracted from the source art; the wordmark
stays as `BrandLockup`'s existing CSS text. This means `BrandLockup`'s
rendered output is **a composition of the real icon + a CSS approximation
of the source lockups' text layout — not a pixel-exact reproduction of any
one source image**. Don't describe it as "identical" to the source art; it
deliberately isn't, for the legibility reason above. See `BrandLockup.jsx`'s
own doc comment for the same note kept next to the code.

This also means two of the four source files (`logo-horizontal-bismillah.png`
and `logo-horizontal-compact.png`) end up unused by the final pipeline:
their icon content is the same design as `logo-vertical-bismillah.png`'s
(see §1's diff), and their baked wordmark text isn't used at all. They're
still preserved on disk per §1 in case a future decision needs them.

## 4. Export pipeline (how every file was actually produced)

Run with `sharp` installed in an **isolated scratch directory**, not as a
project dependency (this is a rarely-run offline tool, not a runtime or
build dependency — adding a native-binary devDependency for it wasn't
justified):

```bash
mkdir /tmp/brand-tools && cd /tmp/brand-tools
npm init -y && npm install sharp --no-save
node /path/to/generate-brand-assets.mjs   # see script below
```

### Step 1 — matte the transparent icon (`icon.png`)

The naive approach — a flat global RGB-distance threshold from the crop's
sampled background color, with a soft alpha ramp — was the first version's
actual bug: the source render bakes a soft drop-shadow into the flat
background around the glyph. A flat per-pixel threshold can't distinguish
that gradual shadow from the glyph's own dark gradient shading and outline
strokes (both are "somewhat dark, somewhat close to the background color").
Loosening the threshold to fully catch the shadow let a translucent
gray/green halo bleed into the alpha channel around the whole glyph
(visible as a visible smudge on white or checkerboard backgrounds, and a
distinct blotch below the left leaf); tightening it to avoid the halo
instead ate holes into the dome and leaves' own dark shading.

**The fix: a border-flood-fill matte**, not a flat threshold:

1. Compute a per-pixel color distance from the sampled background.
2. Mark pixels within a *candidate threshold* (25, on the 0–441 Euclidean
   RGB distance scale) as background-candidates.
3. Flood-fill (4-connected BFS) from every pixel on the crop's own border,
   through candidate pixels only.
4. Only pixels actually **reached** by that fill are real background — the
   shadow is spatially connected to the true background, so it's swept up;
   dark shading fully enclosed inside the glyph's own silhouette is never
   reached (the fill can't cross the brighter art around it), so it stays
   opaque regardless of how dark it is.
5. Feather the resulting binary mask with a 1.0px blur for anti-aliased
   edges, then color-decontaminate (unpremultiply against the sampled
   background) only in that narrow feathered band.

Verified after the fix: zero non-border-connected transparent pixels inside
the glyph (a hole-detection flood-fill script, separate from the matte
itself, confirms this — see §6), and visually clean on white, black, the
site's own dark green (`#0c3834`), and a checkerboard, at 3–6x zoom.

**Export size**: the trimmed alpha bounding box comes out to exactly
**484×560** at the crop's native resolution — this is shipped as-is, with
**no resize step**, so there is no upscale (the crop was already smaller
than the source image) and no resampling softness from a downscale either.
`BrandIcon.jsx`'s `ICON_ASPECT` constant and every dimension mentioned in
code comments are `484/560` — kept in sync with this file on purpose;
if you regenerate and get a different number, update both together.

### Step 2 — build the tile assets

The same clean glyph from step 1, composited onto a flat rounded-square
canvas filled with `rgb(15,58,52)` (sampled from `logo-icon-tile.png`'s own
plate — see §2), at a build resolution of 1024px then downsized per target:

- **16/32/48/64px** (favicon-scale): glyph fills 86% of the canvas height —
  tiny favicons need the glyph to dominate the frame to read at a glance.
- **96/128/180/192/512px** (app-icon scale): glyph fills 68% of the canvas
  height — generous padding matching iOS/Android/PWA icon conventions.
- **512px maskable**: full-bleed background (no rounded corner baked in —
  that would double up with the OS's own shape mask), glyph at 62% height,
  centered — safely inside the ~80% safe zone the maskable-icon spec
  requires so a circular OS mask never clips the dome or minaret.
- **favicon.ico**: the 16/32/48px tile PNGs, packed by hand into a
  minimal multi-image ICO container (PNG-in-ICO — supported by every
  browser/OS this needs to target; sharp has no native ICO writer).

## 5. What was tried and rejected

- **Cropping tile assets directly from `logo-icon-tile.png`'s own
  rendered plate**: its plate has its own gradient/gloss lighting (not a
  flat fill), so a per-size crop couldn't get consistent padding across
  sizes without re-solving the same background-detection problem for a
  second, differently-lit source. Building tiles from the already-clean
  glyph (§4 step 2) sidesteps this entirely.
- **A single global hard color-distance threshold** (no flood-fill) at
  several thresholds (45/55/65): all three ate visible holes into the
  dome/leaf shading before the drop-shadow was fully gone — proof the
  shadow and the art's own dark tones overlap in color space and can't be
  separated by color alone.

## 6. Regenerating these assets in the future

The full working script is at
`scripts/generate-brand-assets.mjs` in this package. It is **not** wired
into `pnpm build` or any other automated pipeline — it's a manual, one-off
tool, run only when the source art changes. To regenerate:

```bash
cd artifacts/al-rahma-academy
mkdir -p /tmp/brand-tools && cd /tmp/brand-tools
npm init -y && npm install sharp --no-save
node ../../scripts/generate-brand-assets.mjs
```

It reads from `attached_assets/logo-src/` and writes into `public/brand/`
and `public/favicon.ico`, overwriting whatever's there. After running it,
re-check §4's export-size note against the actual output file (`file`/a
quick `node -e` PNG-header read is enough) and update `BrandIcon.jsx`'s
`ICON_ASPECT` and this file together if the number changed — that
exact mismatch (code/docs claiming 484×560 while the shipped file was
363×420) is what this whole document exists to prevent from happening
silently again.

## 7. Usage map

| File | Used by |
|---|---|
| `public/brand/icon.png` | `BrandIcon` with `tile={false}` — `BrandLockup` (Header, Hero), `Brand.jsx` (Footer/Auth/PageBar/QuranTopBar) |
| `public/brand/icon-tile-{16,32,48,64,96,128}.png` | `BrandIcon` with `tile={true}` (default) — `DashboardLayout` sidebar (34px→picks 96), `InvoiceModal` (40px→picks 96) |
| `public/brand/icon-tile-16.png`, `-32.png`, `-192.png` | `index.html` `<link rel="icon">` |
| `public/brand/icon-tile-180.png` | `index.html` `<link rel="apple-touch-icon">` |
| `public/brand/icon-tile-192.png`, `-512.png`, `-512-maskable.png` | `manifest.json` PWA icons + shortcuts |
| `public/brand/icon-tile-96.png` | `index.html` splash-screen mark (`.alr-mark`) |
| `public/brand/icon-tile-512.png` | Organization/Article JSON-LD `logo` field (`index.html`, `BlogPost.jsx`) |
| `public/brand/icon-tile-192.png` | Browser Notification API icon (`PrayerTimesPage.jsx`) |
| `public/favicon.ico` | `index.html` `<link rel="icon" href="/favicon.ico">`, `sw.js` precache list |

## 8. WebP decision

An earlier version of this pipeline also exported `.webp` copies of
`icon.png` and two tile sizes. They had **no actual consumer** — nothing in
the app ever referenced a `.webp` path, so they were pure dead weight
shipped for no benefit. Decision: **removed**, not wired up. Reasoning:
this codebase has no existing `<picture>`/`srcset` pattern anywhere else,
these are small icon assets (not hero/content images where format savings
matter most for page weight), and introducing `<picture>` fallback handling
into `BrandIcon` for this one component would be new complexity with no
precedent elsewhere in the app. Plain PNG via `<img>` is the simpler,
more consistent choice. If WebP is wanted later, add it as a `<picture>`
wrapper with a real PNG fallback — never a bare `.webp` reference.
