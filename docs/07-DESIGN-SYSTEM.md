# TrustRFQ Design System

Design reference for the full product: private RFQ → private quotes → accepted quote → escrow-backed deal → settlement proof.

Tone: **private, serious, high-trust, high-value settlement**. Mercury is the inspiration for calm premium motion and confident typography. Do not copy Mercury visuals directly.

---

## Color Palette

Two surfaces coexist: the **landing page** (white, Mercury-inspired) and the **app interior** (dark, trading-terminal).

### App Interior (canonical)

| Role | Tailwind token | Hex | Usage |
|---|---|---|---|
| Page background | `slate-950` | `#020617` | `body` background |
| Surface / card | `slate-900` | `#0f172a` | Card bg, panel bg |
| Elevated surface | `slate-800` | `#1e293b` | Input bg, hover state |
| Border default | `slate-800` | `#1e293b` | Card borders |
| Border subtle | `slate-700/60` | — | Secondary dividers |
| Text primary | `slate-100` | `#f1f5f9` | Headlines, values |
| Text secondary | `slate-400` | `#94a3b8` | Labels, descriptions |
| Text muted | `slate-600` | `#475569` | Timestamps, footnotes |
| Text disabled | `slate-700` | `#334155` | Pending states |

### Accent — Teal (primary product identity)

| Role | Tailwind token | Usage |
|---|---|---|
| Primary CTA | `teal-400` | "New RFQ" button, primary actions |
| CTA hover | `teal-300` | Hover state |
| CTA text on teal | `slate-950` | Text on teal button |
| Accent subtle | `teal-950/40` + `border-teal-800/50` | Open RFQ badge bg |
| Accent text | `teal-300` | Contract IDs, Escrow Viewer links |
| Accent dot | `teal-500` | Live indicator dots |
| Glow | `teal-500/[0.04]` + `blur-3xl` | Product visual ambient glow |

### Status Semantics — follow these strictly

| State | Color | Tailwind | When to use |
|---|---|---|---|
| Active / waiting | Blue | `blue-400` text, `blue-900/50` border | Escrow funded, awaiting next party |
| Success / done | Green | `green-400` dot, `green-900/60` bg | Quote accepted, funds deposited, settled |
| Open / live | Teal | `teal-300` + `teal-950` bg | RFQ open, contract live |
| Attention / private | Amber | `amber-400` | Private RFQ notice, expiry warning |
| Error / risk | Red | `red-400` / `red-950/30` bg | Below minimum, expired, failed |
| Neutral / pending | Slate | `slate-600` dot, `slate-700` bg | Future escrow step not yet active |
| Closed / complete | Slate | `slate-700` bg + `slate-300` text | RFQ closed, deal refunded |

### Landing Page Surface (white mode, page.tsx only)

| Role | Tailwind token | Usage |
|---|---|---|
| Page bg | `white` | Landing page wrapper |
| Section alt bg | `gray-50` | Alternating sections |
| Dark section bg | `gray-900` | Stats section, footer |
| Text primary | `gray-900` | Headlines |
| Text body | `gray-500` | Descriptions |
| Text muted | `gray-400` | Disclaimers, footnotes |
| Card border | `gray-100` | Landing cards |
| Primary CTA | `green-500` / hover `green-400` | Landing CTAs |
| Section label | `green-600` | Feature tag labels |

> **Note:** The landing page green CTA (`green-500`) conflicts with the app interior teal CTA (`teal-400`). These must be unified in a future pass — see "Current UI problems."

---

## Typography Scale

Font stack: `ui-sans-serif, system-ui, sans-serif` (defined in `globals.css`). No specific web font is loaded; this is a known gap.

### App interior

| Role | Classes | Size / Weight |
|---|---|---|
| Page headline | `text-2xl font-bold text-white` | 24px / 700 |
| Section label | `text-xs font-semibold text-slate-500 uppercase tracking-widest` | 12px / 600 |
| Card title / value | `font-semibold text-white` | 14–16px / 600 |
| Large amount | `font-bold text-xl–text-2xl text-white` | 20–24px / 700 |
| Body copy | `text-sm text-slate-400 leading-relaxed` | 14px / 400 |
| Micro label | `text-xs text-slate-500` | 12px / 400 |
| Monospace (address, ID) | `font-mono text-xs text-slate-500` | 12px mono |
| Status badge | `text-[10px] font-medium` | 10px / 500 |

### Landing page

| Role | Classes | Size / Weight |
|---|---|---|
| Hero H1 | `text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight leading-[1.05]` | 48–72px / 800 |
| Section H2 | `text-3xl sm:text-4xl font-bold tracking-tight` | 30–36px / 700 |
| Feature H3 | `text-2xl sm:text-3xl font-bold leading-tight` | 24–30px / 700 |
| Card title | `font-semibold text-gray-900` | 16px / 600 |
| Subtitle / body | `text-xl text-gray-500 leading-relaxed` | 20px / 400 |
| Card body | `text-sm text-gray-500 leading-relaxed` | 14px / 400 |
| Section tag | `text-xs font-semibold uppercase tracking-widest` | 12px / 600 |
| Stats number | `text-5xl font-black text-white` | 48px / 900 |

### Rules
- Section labels are always `uppercase tracking-widest text-xs font-semibold` — never sentence case
- Monospace only for: wallet addresses, contract IDs, RFQ IDs, transaction hashes
- Amount values always use `font-semibold` or heavier — never regular weight for money
- Line height for headlines: `leading-[1.05]` to `leading-tight`; for body: `leading-relaxed`

---

## Spacing Scale

All spacing from Tailwind defaults. Key conventions in use:

| Context | Value | Classes |
|---|---|---|
| Section vertical padding (landing) | 96px | `py-24` |
| Section vertical padding (dark sections) | 80px | `py-20` |
| Card inner padding (standard) | 24px | `p-6` |
| Card inner padding (compact) | 20px | `p-5` |
| Card inner padding (micro, visual mockup) | 16px | `p-4` |
| Card gap in grid | 20px | `gap-5` |
| Card gap in grid (landing, relaxed) | 24px | `gap-6` |
| Section content max-width (landing) | 1152px | `max-w-6xl` |
| Section content max-width (app interior) | 896px | `max-w-4xl` (from layout.tsx) |
| Horizontal page padding | 16 / 24 / 32px | `px-4 sm:px-6 lg:px-8` |
| Stack gap inside a card | 12–16px | `gap-3` to `gap-4` |
| Micro row gap (label + value) | 4–6px | `gap-1` to `gap-1.5` |
| Timeline row gap | 12px | `gap-3` |
| Status dot to text | 10px | `gap-2.5` |

---

## Border Radius

| Context | Value | Classes |
|---|---|---|
| Card, panel (standard) | 12px | `rounded-xl` |
| Card, panel (large, landing) | 16px | `rounded-2xl` |
| Status badge / pill | 9999px | `rounded-full` |
| Input field | 8px | `rounded-lg` |
| Button (primary) | 8px | `rounded-lg` |
| Grid cell / animated square | 2–4px | `rounded-sm` |
| Nav logo mark | 8px | `rounded-lg` |

---

## Shadows

| Context | Classes | Used where |
|---|---|---|
| Card (app interior) | none, use border instead | App interior cards rely on border |
| Card (landing, rest) | `shadow-sm` | Default landing card |
| Card (landing, hover) | `hover:shadow-md transition-shadow` | Landing card hover |
| Product visual panels | `shadow-xl` to `shadow-2xl` | HeroVisual floating cards |
| Landing page wrapper | `shadow-2xl` on HeroVisual container | Outer container |

App interior cards do **not** use shadows — borders provide separation on dark backgrounds. Shadows are reserved for the landing page and the product visual mockup panels.

---

## Card Styles

### App interior card (standard)

```
bg-slate-900 border border-slate-800 rounded-xl p-5
```

- Section header: `text-xs font-semibold text-slate-500 uppercase tracking-widest mb-4`
- Value row: label `text-xs text-slate-500 mb-0.5` / value `text-white font-semibold text-sm`
- Divider: `border-t border-slate-800 mt-3 pt-2`

### App interior card (active / highlighted)

```
bg-slate-900 border border-blue-900/50 rounded-xl p-5   (awaiting action)
bg-slate-900 border border-green-900   rounded-xl p-5   (accepted / success)
bg-slate-900 border border-red-900/50  rounded-xl p-5   (invalid / error)
```

### Landing page card (standard)

```
bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow
```

### Product visual card (inside HeroVisual)

```
bg-gray-900/80 border border-gray-700/60 rounded-xl p-4 shadow-xl backdrop-blur-sm
```

Tinted variants by state:
- Accepted quote: `border-green-800/40`
- Escrow state panel: `border-blue-900/40`
- Contract ID: `bg-gray-950/80 border-teal-800/30`

---

## Button Styles

### Primary CTA — app interior

```
bg-teal-400 hover:bg-teal-300 text-slate-950 font-semibold px-4–6 py-2–2.5 rounded-lg transition-colors text-sm
```

### Primary CTA — landing page

```
bg-green-500 hover:bg-green-400 text-white font-semibold px-6–8 py-3–3.5 rounded-lg transition-colors
```

> These two must be unified — see "Current UI problems."

### Secondary / ghost — app interior

```
border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white px-6 py-2.5 rounded-lg font-medium transition-colors text-sm
```

### Inline action (small)

```
bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-1.5 rounded-lg font-medium transition-colors
```

Variants: `bg-green-700 hover:bg-green-600` (success action), `bg-amber-700 hover:bg-amber-600` (warning action).

### Inline text link

```
text-teal-400 hover:text-teal-300 font-medium transition-colors   (app interior)
text-green-600 hover:text-green-500 font-medium transition-colors   (landing)
```

### Rules
- Destructive or high-stakes actions must show confirmation before executing — no silent execution
- "Accept quote" is a primary `bg-green-700` action because it is irreversible
- Never use a default browser `<button>` style; always apply rounded-lg + explicit color

---

## Form / Input Styles

```
bg-slate-800 border border-slate-700 text-white rounded-lg px-3 py-2 text-sm
focus:outline-none focus:border-blue-500
placeholder:text-slate-600
```

- Label: `text-xs text-slate-400 block mb-1`
- Helper text: `text-xs text-slate-600 mt-1`
- Error state: `border-red-700 focus:border-red-500`
- Error message: `text-red-400 text-xs bg-red-950/40 border border-red-900/40 rounded-lg px-3 py-2`
- Number input: add `min="0" step="any"` always
- Disabled: `disabled:bg-slate-700 disabled:text-slate-400`

---

## Status Badge Styles

Badges are `text-[10px] font-medium px-2 py-0.5 rounded-full`. Always paired: background + text + optional border.

| Status | Classes |
|---|---|
| Open | `bg-teal-950 text-teal-300 border border-teal-800/50` |
| Closed | `bg-slate-700 text-slate-300` |
| Expired | `bg-red-900 text-red-300` |
| Cancelled | `bg-red-900 text-red-300` |
| Pending (quote) | `bg-slate-800 text-slate-400` |
| Accepted (quote) | `bg-green-950 text-green-300 border border-green-800/50` |
| Rejected (quote) | `bg-slate-700 text-slate-400` |
| Escrow funded | `bg-blue-950 text-blue-300 border border-blue-800/40` |
| Settled | `bg-green-900 text-green-300` |
| Refunded | `bg-slate-700 text-slate-300` |
| Below minimum | `bg-red-900 text-red-300` |

Section labels (not badges) use: `text-[10px] text-slate-500 uppercase tracking-widest font-semibold`.

---

## Timeline / Escrow State Styles

The escrow timeline is a vertical list of steps. Each step is a flex row: `flex items-center gap-2.5`.

### Status dot

| State | Dot classes |
|---|---|
| Done | `w-1.5 h-1.5 rounded-full bg-green-400 shrink-0` |
| Active (pulsing) | `w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0 lp-pulse` |
| Pending | `w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0` |
| Contract live | `w-1 h-1 rounded-full bg-teal-500 lp-pulse` |

### Step text

| State | Text classes |
|---|---|
| Done | `text-slate-400 text-[11px] leading-snug` |
| Active | `text-blue-300 font-medium text-[11px] leading-snug` |
| Pending | `text-slate-600 text-[11px] leading-snug` |

### Container

```
flex flex-col gap-3
```

### Section header above timeline

```
text-[10px] text-slate-500 uppercase tracking-widest mb-4
```

### Step gap in larger deal-page timelines

```
flex items-start gap-4
```
with a connector line: `w-px flex-1 bg-slate-800 mt-1 min-h-[24px]` between dot and next step.

---

## Motion Rules

### Principles

1. **Motion must serve state** — only animate elements that communicate state change (funds locked, escrow step active) or establish premium product depth (hero visual)
2. **No flash, no bounce** — all easing is `ease-in-out`; no `ease-in`, no spring, no bounce
3. **Slow is premium** — minimum duration 2.5s; maximum duration 9s
4. **Staggered is depth** — offset delays (1s, 2s, 3s) between sibling elements
5. **Opacity pulse only for live state** — pulsing opacity means "this is the active step right now"
6. **Float only in product visual** — vertical translate animations only in the landing page HeroVisual, never in app interior

### Defined animations (globals.css)

| Class | Keyframe | Duration | Delay | Use |
|---|---|---|---|---|
| `lp-float-a` | Y: 0 → −10px → 0 | 7s | 0s | Left column of HeroVisual |
| `lp-float-b` | Y: −4px → 7px → −4px | 9s | 2s | Center column of HeroVisual |
| `lp-float-c` | Y: 0 → −14px → 0 | 6s | 1s | Right column of HeroVisual |
| `lp-pulse` | opacity: 1 → 0.22 → 1 | 2.5s | 0s | Active step dot, contract live dot |
| `lp-cell-1` | opacity: 0 → 1 → 0 | 4s | 0s | Grid cell glow |
| `lp-cell-2` | opacity: 0 → 1 → 0 | 5s | 1s | Grid cell glow |
| `lp-cell-3` | opacity: 0 → 1 → 0 | 6s | 2.5s | Grid cell glow |
| `lp-cell-4` | opacity: 0 → 1 → 0 | 4.5s | 0.5s | Grid cell glow |
| `lp-cell-5` | opacity: 0 → 1 → 0 | 5.5s | 1.5s | Grid cell glow |
| `lp-cell-6` | opacity: 0 → 1 → 0 | 7s | 3s | Grid cell glow |

### Rules for new animations

- Add to `globals.css` only; do not use inline `style` animation for new animation types
- Use `lp-` prefix for all landing page animations
- For app interior status changes, prefer CSS `transition-colors duration-200` — not keyframes
- Never animate layout properties (width, height, margin, padding) — only transform and opacity
- `prefers-reduced-motion` should be respected: wrap all `lp-*` animations in `@media (prefers-reduced-motion: no-preference)` in a future pass

---

## Landing Page Product Visual Rules

The `HeroVisual` component in `page.tsx` is the first-viewport product explanation. It must communicate the full deal flow in one glance.

### Container

```
background: linear-gradient(155deg, #0a1628 0%, #020617 65%)
border: border-gray-800
rounded-2xl, overflow-hidden, shadow-2xl
minHeight: 420px
```

### Grid background

```css
backgroundImage:
  "linear-gradient(rgba(148,163,184,0.045) 1px, transparent 1px), " +
  "linear-gradient(90deg, rgba(148,163,184,0.045) 1px, transparent 1px)"
backgroundSize: "56px 56px"
```

Grid line opacity: `0.045` — visible but never dominant.

### Animated cells

- Size: `w-14 h-14` (56px — one grid unit)
- Color: `bg-teal-400/5 border border-teal-400/20`
- Radius: `rounded-sm`
- Count: 6–8 cells at varied positions
- Placement: avoid center content area; use edges and corners
- Each cell gets a different `lp-cell-*` class for offset timing

### Ambient glow

One radial blur element only:
```
w-[600px] h-[300px] bg-teal-500/[0.04] rounded-full blur-3xl
position: top-1/3, left-1/2 center
pointer-events-none
```

### Card layout

Three columns with vertical stagger:
- Left: `pt-0` (anchor)
- Center: `sm:pt-6`
- Right: `sm:pt-12`

Each column gets a float class: `lp-float-a`, `lp-float-b`, `lp-float-c`.

### What each panel must show

| Panel | Content | State shown |
|---|---|---|
| Left: RFQ card | RFQ ID, sell/receive amounts, private indicator | RFQ open |
| Left: Contract card | Contract ID (TRFQ-XXXX), network, Escrow Viewer link | Deal exists |
| Center: Escrow state | 4-step timeline with dots | Active escrow state |
| Right: Quote card | Quote amount, maker address, accepted status | Quote accepted |

The escrow state panel is always the center column — it is the product's core value proposition.

### Required state text in escrow panel

```
Quote accepted · terms locked   (green dot, done)
Buyer deposited [amount] [asset]   (green dot, done)
Escrow funded · Waiting for seller   (blue dot, lp-pulse, active)
Settlement pending   (slate dot, pending)
```

### Card style inside HeroVisual

```
bg-gray-900/80 border border-gray-700/60 rounded-xl p-4 shadow-xl backdrop-blur-sm
```

Border color varies by state:
- RFQ: `border-gray-700/60`
- Escrow panel: `border-blue-900/40`
- Accepted quote: `border-green-800/40`
- Contract ID: `bg-gray-950/80 border-teal-800/30`

---

## Current UI Problems to Fix Later

Derived from reading `page.tsx`, `globals.css`, and `layout.tsx`.

### 1. Branding is stale in layout.tsx

`layout.tsx` still reads `"StellarBig — Testnet"` in `<title>` and `<footer>`. The nav logo says `"StellarBig"`. The product is TrustRFQ. This shows on every page.

**Fix:** Update `metadata.title`, `metadata.description`, nav logo text, and footer copy in `layout.tsx`.

### 2. CTA color is split across three values

- Nav "New RFQ": `bg-blue-600`
- Landing page CTAs: `bg-green-500`
- App interior primary CTA (from CLAUDE.md intent): `bg-teal-400`

One primary CTA color must be chosen and applied consistently. Recommendation: `teal-400` (already in nav logo mark and product visual) — it matches the product identity.

### 3. Landing page fights layout padding with negative margins

`page.tsx` uses `-mx-4 sm:-mx-6 lg:-mx-8 -mt-8` to escape the layout's `px-6 py-10`. This is fragile: if `layout.tsx` padding changes, the landing breaks.

**Fix:** Give the layout a landing-page variant (e.g., `data-page="landing"` or a separate route group with no padding) instead of fighting with negative margins.

### 4. Max-width mismatch between landing and app interior

Landing page content: `max-w-6xl` (1152px). Layout's main: `max-w-4xl` (896px). After the hero section, the rest of the app feels noticeably narrower. This is inconsistent if users navigate between landing and interior.

**Fix:** Align to one max-width — or explicitly document that landing = 6xl (marketing), interior = 4xl (product), and ensure the transition is intentional.

### 5. Nav and footer are dark; landing page is white — no visual bridge

The nav (`border-slate-800`, dark bg) sits directly above the white landing page hero. The layout footer (`border-slate-800`) sits below the landing's dark gray footer. This creates a jarring double-dark-footer effect and a harsh nav-to-white-bg cut.

**Fix:** Either (a) make the landing page hero background gradient blend into the nav's dark tone, or (b) add a transparent nav variant for the landing page, or (c) keep the whole app dark and drop the white landing page mode.

### 6. Feature block illustration placeholders are empty

The four alternating feature sections in the landing use `aspect-video` gradient boxes with only a small `font-mono` tag text as the "visual." These read as unfinished placeholders.

**Fix:** Replace with actual product screenshots, domain-specific schematic illustrations, or a consistent dark-terminal mockup system matching the HeroVisual style.

### 7. `lp-hero-pan` animation is defined but never applied

`globals.css` defines `.lp-hero-pan` (background-position pan animation) but no element in `page.tsx` uses it.

**Fix:** Either apply it to a gradient element in the hero or remove it.

### 8. `lp-cell` opacity goes 0 → 1, but cells are already near-invisible at 1

Cells use `bg-teal-400/5` (5% opacity teal). When `lp-cell` brings opacity to `1`, the cell is still very faint because the color itself has 5% opacity. The animation is nearly invisible at its peak.

**Fix:** Increase the base color opacity to `bg-teal-400/15` and consider a `border border-teal-400/30` increase to make the animation visible without becoming distracting.

### 9. No font is loaded — relies on system sans-serif

`globals.css` uses `ui-sans-serif, system-ui, sans-serif`. No specific typeface (e.g., Inter) is loaded. The product visual may look different across OS/browser. For a premium fintech feel, a geometric sans-serif loaded via `next/font` would be appropriate.

**Fix:** Add `next/font/google` with Inter or Geist to `layout.tsx`. Apply to `<body>` via className.

### 10. No `prefers-reduced-motion` guard

All `lp-*` animations run unconditionally, even for users who have reduced-motion enabled in their OS accessibility settings.

**Fix:** Wrap all `lp-*` animation declarations in:
```css
@media (prefers-reduced-motion: no-preference) {
  .lp-float-a { animation: ... }
  ...
}
```

### 11. Testimonials are fictional — risky for demo credibility

The three testimonial cards use invented names and companies. Judges at a hackathon will notice these are placeholder data and it may undermine the product story.

**Fix:** Either remove the testimonials section entirely and replace with a "how it works" diagram, or replace with clearly marked "demo personas" that match the actual mock identities (RFQ Creator, Maker A, Maker B).

### 12. Stats section values are not dynamic

`STATS` are hardcoded: "4 steps", "0 blind sends", "1 escrow contract", "100%". These are correct but feel like placeholder copy, especially "0 blind sends" which is not a natural metric.

**Fix:** Replace with metrics that sound like real product facts: e.g., "1 escrow per deal", "Private quotes only", "On-chain proof with every settlement", or use the stats section for hackathon-specific claims about Trustless Work integration.
