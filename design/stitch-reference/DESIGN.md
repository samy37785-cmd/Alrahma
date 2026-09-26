---
name: Al-Rahma Academy
colors:
  surface: '#fbf9f2'
  surface-dim: '#dcdad3'
  surface-bright: '#fbf9f2'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f4ed'
  surface-container: '#f0eee7'
  surface-container-high: '#eae8e1'
  surface-container-highest: '#e4e2dc'
  on-surface: '#1b1c18'
  on-surface-variant: '#3f4943'
  inverse-surface: '#30312c'
  inverse-on-surface: '#f3f1ea'
  outline: '#707973'
  outline-variant: '#bfc9c2'
  surface-tint: '#236a4f'
  primary: '#003b28'
  on-primary: '#ffffff'
  primary-container: '#00543b'
  on-primary-container: '#81c7a7'
  inverse-primary: '#8fd5b4'
  secondary: '#875200'
  on-secondary: '#ffffff'
  secondary-container: '#feb154'
  on-secondary-container: '#714500'
  tertiary: '#293531'
  on-tertiary: '#ffffff'
  tertiary-container: '#3f4c47'
  on-tertiary-container: '#aebcb6'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#aaf1cf'
  primary-fixed-dim: '#8fd5b4'
  on-primary-fixed: '#002115'
  on-primary-fixed-variant: '#005139'
  secondary-fixed: '#ffddba'
  secondary-fixed-dim: '#ffb865'
  on-secondary-fixed: '#2b1700'
  on-secondary-fixed-variant: '#663d00'
  tertiary-fixed: '#d8e6df'
  tertiary-fixed-dim: '#bccac3'
  on-tertiary-fixed: '#121e1a'
  on-tertiary-fixed-variant: '#3d4945'
  background: '#fbf9f2'
  on-background: '#1b1c18'
  surface-variant: '#e4e2dc'
  surface-cream: '#F0EEE7'
  border-cream-dark: '#F1EEE4'
  ink-depth: '#1A2622'
  manuscript-amber: '#C8842A'
  emerald-deep: '#00543B'
typography:
  display-hero:
    fontFamily: Epilogue
    fontSize: 60px
    fontWeight: '800'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Epilogue
    fontSize: 36px
    fontWeight: '700'
    lineHeight: '1.2'
  headline-md:
    fontFamily: Epilogue
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  arabic-quran:
    fontFamily: Amiri
    fontSize: 32px
    fontWeight: '400'
    lineHeight: '2.0'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: '1.0'
    letterSpacing: 0.1em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  gutter: 24px
  margin-desktop: 64px
  margin-mobile: 16px
  container-max: 1440px
---

## Brand & Style
The brand personality is **Scholarly & Modern**, blending traditional Islamic education with a clean, high-fidelity tech aesthetic. The visual style is a hybrid of **Modern Corporate** and **Glassmorphism**, utilizing semi-transparent "glass" layers and soft blurs to create a sense of light and openness.

The target audience consists of dedicated students and scholars who value both academic rigor and spiritual tranquility. The UI evokes a sense of "digital manuscript"—warm, stable, and meticulously organized. It prioritizes clarity and focus, using emerald greens and manuscript ambers to anchor the experience in a heritage-driven yet forward-looking environment.

## Colors
The palette is rooted in a **Heritage Emerald (#00543B)** which serves as the primary brand color, representing growth and tradition. This is complemented by **Manuscript Amber (#C8842A)**, used sparingly for calls to action, highlights, and achievement markers to signify value and wisdom.

The background system avoids pure white, opting instead for a **Cream Neutral (#FBF9F2)** base. This "parchment" approach reduces eye strain during long study sessions. **Ink Depth (#1A2622)** provides the high-contrast foundation for typography and dark-mode surfaces. Semantic colors for success, warning, and danger are muted slightly to harmonize with the organic, warm-toned environment.

## Typography
The typographic hierarchy uses **Epilogue** for high-impact headlines to provide a distinctive, contemporary character. **Inter** handles all functional and body text, ensuring maximum readability across data-heavy dashboards.

Special consideration is given to **Amiri**, a classical serif typeface dedicated to Arabic script and Quranic verses, which is always rendered with increased line height (2.0) to accommodate diacritics. On mobile devices, `display-hero` should scale down to `36px` and `headline-lg` to `28px` to maintain composition balance.

## Layout & Spacing
The system follows a **Fixed-Width Grid** for primary content sections, maxing out at 1440px to prevent excessive line lengths. The layout uses a structured 12-column grid on desktop with 24px gutters.

**Responsive Behavior:**
- **Desktop:** Features a fixed 280px left-side navigation rail.
- **Mobile:** The side navigation is replaced by a bottom-tab bar for easy thumb access.
- **Margins:** Transitions from 64px on desktop to 16px on mobile to maximize screen real estate for content.
- **Spacing:** Vertical rhythm is built on multiples of 8px, with larger 64px gaps (mb-16) used to separate major logical sections.

## Elevation & Depth
Elevation is expressed through **Tonal Layering** and **Glassmorphism** rather than heavy shadows.

- **Level 0 (Base):** Page surface uses the primary neutral cream.
- **Level 1 (Cards):** White surfaces with very subtle, diffused shadows (color-tinted with primary green at 4% opacity) and 1px borders in `cream-dark`.
- **Level 2 (Active/Overlays):** Uses `backdrop-blur-md` (8px-12px) and semi-transparent white (60-80% opacity) for headers and interactive elements.
- **Contextual Depth:** The "Amber Glow" effect is a specialized elevation state for high-priority calls to action, using a soft amber outer glow instead of a standard shadow.

## Shapes
The shape language is **Rounded and Organic**, reflecting a modern and welcoming educational environment. 

- **Standard Elements:** Buttons and inputs use a 0.5rem base radius.
- **Containers:** Large cards and section containers use a more pronounced 1rem to 1.5rem (`rounded-2xl` to `rounded-3xl`) radius.
- **Interactive UI:** Search bars and status badges use "Full/Pill" rounding to differentiate them from structural content.
- **Visual Accent:** Avatars and icon containers are strictly circular.

## Components
- **Buttons:** Primary buttons are solid Emerald with white text. Secondary buttons use a 2px Emerald outline. The "Enroll" button is a signature Amber with a subtle glow. All buttons utilize a 0.98 scale-down transition on active click.
- **Inputs:** Form fields use a `surface-container-low` background with a 1px border. Focus states are indicated by a 2px Emerald ring.
- **Cards:** Dashboard cards must have a 1px `cream-dark` border. Progress cards utilize large-format typography for KPIs.
- **Badges:** Use a 10% opacity background of the semantic color (Success, Warning, Danger) with a bold, uppercase label for high glanceability.
- **Navigation:** The side-nav uses a high-contrast active state (solid Emerald) against a subtle `surface-container` background.