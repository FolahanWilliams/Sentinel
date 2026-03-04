# Sentinel Glass UI Enhancement — Implementation Plan

## Overview

This plan implements 8 categories of glass morphism and interaction improvements across the Sentinel trading intelligence platform. The work is organized into phases based on dependency order — foundational CSS/hooks first, then component-specific integrations.

---

## Phase 1: Foundation — New Hooks & Utilities

### 1A. Create `src/hooks/useReducedMotion.ts`
- New hook wrapping `window.matchMedia('(prefers-reduced-motion: reduce)')`
- Returns `boolean` — used by all animation-heavy components to conditionally disable motion
- Listens for changes via `MediaQueryList.addEventListener('change', ...)`
- **Used by:** Ambient orbs, parallax, hover distortions, scroll effects, micro-interactions

### 1B. Create `src/hooks/useDeviceCapability.ts`
- Detects low-end devices via `navigator.hardwareConcurrency < 4`
- Returns `{ isLowEnd: boolean, blurScale: number, disableNoise: boolean }`
- `blurScale` = `0.5` on low-end, `1.0` otherwise
- **Used by:** Glass panel blur values, noise texture toggle, ambient orb complexity

### 1C. Create `src/hooks/useMousePosition.ts`
- Tracks mouse position relative to a given `ref` element
- Returns `{ x: number, y: number, isHovering: boolean }` (normalized 0-1 values)
- Uses `mousemove` and `mouseleave` events with `requestAnimationFrame` throttling
- **Used by:** Cursor proximity glow (Sidebar, SignalsSidebar), hover refraction distortion, specular highlight

### 1D. Create `src/hooks/useScrollPosition.ts`
- Tracks scroll position and velocity within a scrollable container ref
- Returns `{ scrollY: number, scrollProgress: number, velocity: number, isAtEnd: boolean }`
- Uses `requestAnimationFrame` for smooth updates
- **Used by:** Scroll-linked opacity, scroll momentum wobble, parallax effects

### 1E. Create `src/hooks/useTimeOfDay.ts`
- Returns current time period: `'morning' | 'afternoon' | 'evening' | 'night'`
- Updates every 30 minutes via `setInterval`
- Maps to CSS custom property values for ambient color temperature
- **Used by:** Dynamic time-of-day theming (ambient orb color shifts)

### 1F. Create `src/hooks/useMarketMood.ts`
- Derives market sentiment from existing `useMarketSnapshot` data
- Returns `{ mood: 'bullish' | 'bearish' | 'volatile' | 'neutral', intensity: number }`
- Intensity 0-1 based on Fear/Greed index distance from 50 and VIX level
- **Used by:** Ambient orb color reactivity

---

## Phase 2: CSS Foundation — Design Tokens & Glass System

### 2A. Extend `src/index.css` — New CSS Custom Properties

Add to `:root`:
```css
/* Elevation blur scale (overridden by JS for low-end devices) */
--glass-blur-base: 24px;
--glass-blur-light: 16px;
--glass-blur-heavy: 32px;
--glass-blur-scale: 1; /* Set to 0.5 on low-end via JS */

/* Elevation shadow levels (intermediate steps) */
--shadow-level-1: 0 2px 8px rgba(0, 0, 0, 0.3);
--shadow-level-2: 0 4px 16px rgba(0, 0, 0, 0.35);
--shadow-level-3: 0 8px 24px rgba(0, 0, 0, 0.4);
--shadow-level-4: 0 12px 32px rgba(0, 0, 0, 0.45);
--shadow-level-5: 0 16px 40px rgba(0, 0, 0, 0.5);

/* Ambient-tinted shadow colors (updated by JS from orb colors) */
--shadow-tint: rgba(59, 130, 246, 0.05);

/* Time-of-day ambient temperature */
--ambient-hue-shift: 0deg;
--ambient-saturation: 100%;
--ambient-orb-speed: 1;

/* Noise intensity (adaptive) */
--noise-opacity: 0.04;

/* Specular highlight position (animated via CSS/JS) */
--specular-x: 0%;
```

### 2B. Extend `src/index.css` — Z-axis Blur Gradient Classes

```css
/* Elevation-based blur variants */
.glass-panel { backdrop-filter: blur(calc(var(--glass-blur-base) * var(--glass-blur-scale))) saturate(150%); }
.glass-panel-light { backdrop-filter: blur(calc(var(--glass-blur-light) * var(--glass-blur-scale))) saturate(140%); }
.glass-panel-heavy { backdrop-filter: blur(calc(var(--glass-blur-heavy) * var(--glass-blur-scale))) saturate(180%); }
```

- **`.glass-panel`** (24px) — standard cards, dashboard widgets
- **`.glass-panel-light`** (16px) — overlays, drawers, modals (closer to camera — clearer vision)
- **`.glass-panel-heavy`** (32px) — background panels, sidebar (deeper layer — more blur)
- All scale by `--glass-blur-scale` for low-end device degradation

### 2C. Extend `src/index.css` — Intermediate Shadow Levels

Replace abrupt shadow jump with graduated elevation system:
```css
.shadow-elevation-1 { box-shadow: var(--shadow-level-1), 0 0 0 1px var(--shadow-tint); }
.shadow-elevation-2 { box-shadow: var(--shadow-level-2), 0 0 8px var(--shadow-tint); }
.shadow-elevation-3 { box-shadow: var(--shadow-level-3), 0 0 12px var(--shadow-tint); }
.shadow-elevation-4 { box-shadow: var(--shadow-level-4), 0 0 16px var(--shadow-tint); }
.shadow-elevation-5 { box-shadow: var(--shadow-level-5), 0 0 20px var(--shadow-tint); }
```

### 2D. Extend `src/index.css` — Focus/Active Ring Glow

Replace hard `ring-*` focus styles with soft luminous glow:
```css
.glass-focus-ring:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 2px rgba(59, 130, 246, 0.3),
    0 0 20px rgba(59, 130, 246, 0.15),
    inset 0 1px 0 0 rgba(255, 255, 255, 0.15);
}
```

### 2E. Extend `src/index.css` — Press/Active Glass Compression

```css
.glass-panel:active,
.glass-pressable:active {
  backdrop-filter: blur(calc((var(--glass-blur-base) - 4px) * var(--glass-blur-scale))) saturate(140%);
  background-color: rgba(20, 22, 32, 0.55); /* slightly more opaque */
  box-shadow:
    0 2px 8px rgba(0, 0, 0, 0.3),
    inset 0 2px 4px rgba(0, 0, 0, 0.2),      /* deeper inset */
    inset 0 1px 0 0 rgba(255, 255, 255, 0.05); /* dimmer specular */
  transform: scale(0.998);
  transition: all 0.1s ease-out;
}
```

### 2F. Extend `src/index.css` — Hover Refraction Distortion

```css
.glass-panel.glass-refract:hover {
  transform: scale(1.005);
}

.glass-panel.glass-refract:hover::before {
  opacity: 0.07; /* Increase noise on hover */
  background-position: 10px 10px; /* Shift noise texture */
}
```

### 2G. Extend `src/index.css` — Specular Highlight Animation

New keyframe for slow-moving light source across glass panels:
```css
@keyframes specular-sweep {
  0%   { --specular-x: -100%; }
  100% { --specular-x: 200%; }
}

.glass-specular::after {
  content: '';
  position: absolute;
  top: 0; left: 0; right: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.08) 45%,
    rgba(255, 255, 255, 0.15) 50%,
    rgba(255, 255, 255, 0.08) 55%,
    transparent 100%
  );
  background-size: 50% 100%;
  background-position: var(--specular-x) 0;
  animation: specular-sweep 45s linear infinite;
  pointer-events: none;
  border-radius: inherit;
  z-index: 2;
}
```

### 2H. Extend `src/index.css` — Chromatic Aberration Borders

```css
.glass-chromatic {
  position: relative;
}

.glass-chromatic::before {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: inherit;
  background: linear-gradient(
    135deg,
    rgba(255, 100, 100, 0.03) 0%,
    transparent 30%,
    transparent 70%,
    rgba(100, 100, 255, 0.03) 100%
  );
  pointer-events: none;
  z-index: 2;
}
```
Note: This replaces the `::before` noise pseudo-element, so chromatic + noise will need to be combined into the same `::before` or use a wrapper.

### 2I. Extend `src/index.css` — Glass Condensation Loading Effect

```css
@keyframes glass-condense {
  0% {
    backdrop-filter: blur(40px) saturate(120%);
    opacity: 0.6;
  }
  100% {
    backdrop-filter: blur(24px) saturate(150%);
    opacity: 1;
  }
}

.glass-condensing {
  animation: glass-condense 0.8s ease-out forwards;
}

.glass-condensing::before {
  animation: fade-in 1s ease-out forwards;
  opacity: 0.12; /* Higher noise = foggy surface */
}
```

### 2J. Extend `src/index.css` — Frosted Edge Feathering

```css
.glass-feathered {
  mask-image: radial-gradient(
    ellipse 98% 98% at center,
    black 85%,
    transparent 100%
  );
  -webkit-mask-image: radial-gradient(
    ellipse 98% 98% at center,
    black 85%,
    transparent 100%
  );
}
```

### 2K. Extend `src/index.css` — Reduced Motion Overrides

```css
@media (prefers-reduced-motion: reduce) {
  .main-ambient-background::before,
  .main-ambient-background::after,
  .main-ambient-background .orb-3 {
    animation: none !important;
  }

  .glass-specular::after {
    animation: none !important;
  }

  .glass-panel,
  .glass-panel-heavy,
  .glass-panel-light {
    transition: none !important;
  }

  .glass-panel.glass-refract:hover {
    transform: none !important;
  }

  /* Disable scroll parallax, hover distortions */
  [data-parallax] {
    transform: none !important;
  }
}
```

### 2L. Extend `src/index.css` — GPU Compositing Hints

```css
.glass-animated {
  will-change: transform, opacity, backdrop-filter;
}

/* Auto-remove will-change after animation completes */
.glass-animated.animation-complete {
  will-change: auto;
}
```

### 2M. Extend `src/index.css` — Glass Morph Page Transition

```css
@keyframes glass-materialize {
  from {
    opacity: 0;
    transform: translateY(8px);
    filter: blur(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
    filter: blur(0px);
  }
}

.animate-glass-materialize {
  animation: glass-materialize 0.4s ease-out forwards;
}
```

### 2N. Extend `src/index.css` — Fingerprint Smudge Interaction

```css
@keyframes smudge-fade {
  from { opacity: 0.08; transform: scale(0.5); }
  20%  { opacity: 0.06; transform: scale(1); }
  to   { opacity: 0; transform: scale(1.5); }
}

.glass-smudge {
  position: absolute;
  width: 60px;
  height: 60px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,0.15), transparent 70%);
  pointer-events: none;
  animation: smudge-fade 2.5s ease-out forwards;
  z-index: 3;
}
```

---

## Phase 3: Ambient Background System

### 3A. Create `src/components/layout/AmbientBackground.tsx`

New component that replaces the current CSS-only `main-ambient-background` pseudo-elements with a React-controlled ambient layer. This is the core of improvements 1 (Depth) and 3 (Color & Light).

**Responsibilities:**
- Renders 3 ambient orbs as `<div>` elements (replacing `::before`, `::after`, `.orb-3`)
- Accepts `mood` from `useMarketMood` to shift orb hue:
  - `bullish` → orb gradients shift to emerald/teal hues
  - `bearish` → orb gradients shift to red/amber hues
  - `volatile` → increased animation speed (`--ambient-orb-speed: 1.5`) and opacity
  - `neutral` → default blue/purple
- Accepts `timeOfDay` from `useTimeOfDay` to shift ambient temperature:
  - `morning` → cooler blue tones, slightly higher brightness
  - `afternoon` → neutral (current default)
  - `evening` → warmer purple/magenta tones
  - `night` → deeper, lower-opacity, blue-shifted
- Respects `useReducedMotion` — disables animations, shows static gradient
- Respects `useDeviceCapability` — reduces blur amounts, disables 3rd orb on low-end
- Applies `will-change: transform` during animation, removes after mount

**Implementation approach:**
- Use inline styles for dynamic hue/speed values derived from mood/time hooks
- Orb elements use the existing `float-orb-1/2/3` keyframes but with CSS variable-driven speed:
  ```css
  animation-duration: calc(20s / var(--ambient-orb-speed));
  ```
- Gradient colors computed from mood → HSL hue mapping

### 3B. Update `src/components/layout/AppLayout.tsx`

- Remove `main-ambient-background` class from the root div
- Render `<AmbientBackground />` as first child (positioned absolute, z-0)
- Pass `mood` and `timeOfDay` props (from hooks used at this level)
- All other content renders on top with higher z-index (already z-1 on glass panels)

### 3C. Update `src/index.css` — Ambient Orb Speed Variable

Modify the existing `float-orb-*` keyframe usage to respect a CSS variable for animation speed:
```css
.ambient-orb {
  animation-duration: calc(var(--orb-base-duration, 20s) / var(--ambient-orb-speed, 1));
}
```

---

## Phase 4: Depth & Parallax System

### 4A. Create `src/components/shared/ParallaxLayer.tsx`

Wrapper component that applies a subtle transform offset based on scroll or mouse position.

**Props:**
- `depth: number` (0-3) — higher depth = more shift. 0 = no parallax, 3 = maximum
- `type: 'scroll' | 'mouse'` — which input drives the offset
- `children: React.ReactNode`

**Behavior:**
- `scroll`: Uses `useScrollPosition` from parent context. Applies `translateY(scrollY * depth * 0.5px)` capped at ±10px
- `mouse`: Uses `useMousePosition`. Applies `translate(mouseX * depth * 3px, mouseY * depth * 3px)` relative to center
- Applies `will-change: transform` during active interaction, removes on idle
- No-op when `useReducedMotion()` returns `true`
- Uses `transform` only (GPU-composited, no layout thrashing)

### 4B. Apply Parallax Depth Assignments

Apply `ParallaxLayer` to key component groups:

| Component | Depth | Type | Rationale |
|-----------|-------|------|-----------|
| Dashboard cards (MarketSnapshot, etc.) | 1 | scroll | Base-level cards shift slightly |
| SentinelPanel article grid | 1 | scroll | Content cards |
| SignalsSidebar | 0 | — | Fixed sidebar, no parallax |
| CommandPalette modal | 2 | mouse | Overlay floats above |
| OnboardingOverlay | 2 | mouse | Overlay floats above |
| ScannerDrawer | 2 | mouse | Drawer floats above |
| AnalystChat panel | 2 | mouse | Floating panel |
| ToastContainer / SignalToast | 3 | mouse | Highest elevation |

Implementation: Wrap the relevant container `<div>` in each component with `<ParallaxLayer>`.

---

## Phase 5: Interactive Glass Effects

### 5A. Create `src/components/shared/CursorGlow.tsx`

Renders a radial gradient spotlight that follows the mouse within a container.

**Props:**
- `color?: string` — glow color (default: `rgba(59, 130, 246, 0.08)`)
- `size?: number` — radius in px (default: `200`)
- `containerRef: React.RefObject<HTMLElement>`

**Behavior:**
- Uses `useMousePosition(containerRef)` to get normalized x/y
- Renders an absolutely positioned `<div>` with:
  ```css
  background: radial-gradient(circle 200px, rgba(59, 130, 246, 0.08), transparent);
  transform: translate(mouseX, mouseY);
  pointer-events: none;
  ```
- Smoothed with `requestAnimationFrame` for 60fps tracking
- Fades in on `mouseenter`, fades out on `mouseleave`
- No-op when reduced motion or low-end device

### 5B. Apply `CursorGlow` to Key Panels

- **Sidebar** (`src/components/layout/Sidebar.tsx`): Add `<CursorGlow color="rgba(59, 130, 246, 0.06)" />` inside the `<aside>` container
- **SignalsSidebar** (`src/components/sentinel/SignalsSidebar.tsx`): Add `<CursorGlow color="rgba(245, 158, 11, 0.06)" />` (amber for signals)

### 5C. Create `src/components/shared/GlassSmudge.tsx`

Small component for the fingerprint smudge interaction effect.

**Props:**
- `x: number, y: number` — click position relative to container
- `onComplete: () => void` — callback when animation finishes (for cleanup)

**Behavior:**
- Renders a `<div className="glass-smudge">` at the click position
- Calls `onComplete` after 2.5s (matching CSS animation duration)
- Parent component tracks active smudges in state, adds on `onClick`, removes on complete

### 5D. Apply Glass Smudge to Interactive Cards

Add click smudge to:
- `ArticleCard.tsx` — on card body click
- `SignalsSidebar.tsx` — on ticker group click
- `MarketSnapshot.tsx` — on ticker cell click

Each component gets:
```tsx
const [smudges, setSmudges] = useState<{id: number, x: number, y: number}[]>([]);
const handleSmudge = (e: React.MouseEvent) => {
  const rect = e.currentTarget.getBoundingClientRect();
  setSmudges(prev => [...prev, { id: Date.now(), x: e.clientX - rect.left, y: e.clientY - rect.top }]);
};
```

### 5E. Update Focus Styles Globally

In components that use `focus:ring-*` Tailwind classes, replace with `glass-focus-ring` class:
- `FilterBar.tsx` — search input, select, buttons
- `ScannerDrawer.tsx` — ticker input
- `CommandPalette.tsx` — search input
- `Sidebar.tsx` — nav links (add `focus-visible:` variant)

---

## Phase 6: Transitions & Motion

### 6A. Create `src/components/shared/GlassMaterialize.tsx`

Wrapper that applies the glass materialize entrance animation to its children.

**Props:**
- `delay?: number` — stagger delay in ms (for cascade effect)
- `children: React.ReactNode`

**Behavior:**
- Uses Framer Motion `motion.div` with:
  ```tsx
  initial={{ opacity: 0, y: 8, filter: 'blur(8px)' }}
  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
  transition={{ duration: 0.4, delay: delay / 1000, ease: 'easeOut' }}
  ```
- Falls back to simple fade when `useReducedMotion()` is true

### 6B. Apply Staggered Cascade to Dashboard

In `src/pages/Dashboard.tsx` (or equivalent page component):
- Wrap each dashboard widget (`MarketSnapshot`, `PortfolioOverview`, `MarketTrends`, etc.) in `<GlassMaterialize delay={i * 50}>` where `i` is the widget index
- Each card starts blurred and transparent, then sharpens in sequence (50ms stagger)

### 6C. Apply Staggered Cascade to Article Grid

In `src/components/sentinel/SentinelPanel.tsx`:
- Wrap each `ArticleCard` in `<GlassMaterialize delay={index * 50}>` (capped at 10 items to prevent long delays)

### 6D. Update ScannerDrawer Glass Transition

In `src/components/sentinel/ScannerDrawer.tsx`:
- Replace simple `translate-x` transition with enhanced entrance:
  - Content starts at `filter: blur(32px)` and transitions to `blur(0)` over 300ms
  - Use Framer Motion `AnimatePresence` + `motion.div` for the drawer panel
  - Backdrop darkens and blurs simultaneously (already has `backdrop-blur-sm`)
- Reclassify drawer panel from `bg-sentinel-950` to `glass-panel-light` for lighter blur (16px) — drawer is an overlay (closer to camera)

### 6E. Create `src/hooks/useScrollFade.ts`

Hook for scroll-linked opacity on feed items.

**Input:** `containerRef`, `itemRef`
**Output:** `{ opacity: number, blur: number }` — computed from item's position within viewport

**Behavior:**
- Items near the center of the scroll container: full opacity (1.0), no blur
- Items approaching top/bottom edges: opacity decreases to 0.7, blur increases to 2px
- Uses `IntersectionObserver` with multiple thresholds for efficient detection
- Falls back to no-op on reduced motion

### 6F. Apply Scroll-Linked Fade to News Feeds

In `src/components/dashboard/NewsFeed.tsx` and `SentinelPanel.tsx` article grid:
- Apply computed `opacity` and `filter: blur()` to each feed item based on scroll position
- Items entering/leaving the viewport gently fade in/out at edges

### 6G. Apply Glass Condensation to Loading States

Replace `skeleton-shimmer` class usage with `glass-condensing` class in:
- `src/components/shared/SkeletonPrimitives.tsx` — `SkeletonCard` and `SkeletonSignalFeed`
- Loading states in `PortfolioOverview.tsx`, `MarketSnapshot.tsx`, `NewsFeed.tsx`
- The glass surface "fogs up" with high noise opacity + heavy blur, then clears as content loads

---

## Phase 7: Component-Specific Improvements

### 7A. Sidebar Active Pill Enhancement

In `src/components/layout/Sidebar.tsx`:
- Update the `sidebar-active-pill` `motion.div` (line 90-94):
  - Add `backdrop-filter: blur(8px)` via inline style
  - Add brighter specular highlight: `box-shadow: inset 0 1px 0 0 rgba(255,255,255,0.2), 0 0 12px rgba(59,130,246,0.15)`
  - Change background from `bg-blue-500/10` to `bg-blue-500/12`
  - This makes the active indicator look like a glass lens floating over the sidebar

### 7B. Toast Surface Ripple

In `src/components/notifications/ToastContainer.tsx`:
- Add a ripple `motion.div` inside each toast that:
  - Starts as a small circle at the entry origin (left edge for slide-in)
  - Expands outward with opacity fading from 0.15 to 0
  - Duration: 400ms, ease-out
  - Uses `borderRadius: '50%'`, scales from `scale(0)` to `scale(4)`
  - Background: `rgba(255, 255, 255, 0.05)`

### 7C. BriefingBar Internal Glass Dividers

In `src/components/sentinel/BriefingBar.tsx`:
- Replace `divide-sentinel-700/30` dividers with styled separator elements:
  ```tsx
  <div className="w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />
  ```
- Add `inset 0 1px 0 rgba(255,255,255,0.03)` to each content section for micro inset highlight
- This creates glass-like internal dividers rather than flat lines

### 7D. FilterBar Embedded Input Styling

In `src/components/sentinel/FilterBar.tsx`:
- Add `shadow-inner` (Tailwind `shadow-inner`) to the search input to make it look recessed into the glass
- Update input background to slightly darker: `bg-sentinel-950/60` (was `bg-sentinel-900/50`)
- Add `inset 0 2px 4px rgba(0,0,0,0.3)` via inline style for recessed depth
- Apply same treatment to the sentiment `<select>` element

### 7E. SignalsSidebar Ticker Group Hover Enhancement

In `src/components/sentinel/SignalsSidebar.tsx`:
- Update the ticker group div hover state:
  - Currently: `hover:border-sentinel-600`
  - Enhanced: On hover, dynamically set background tint based on consensus direction:
    - Bullish (ups > downs): `hover:bg-emerald-500/5`
    - Bearish (downs > ups): `hover:bg-red-500/5`
    - Neutral: `hover:bg-sentinel-800/50`
  - Add subtle inner glow matching consensus color
  - Brightness increase from `bg-sentinel-900/40` to `bg-sentinel-800/50` on hover

---

## Phase 8: Micro-Interactions

### 8A. Glass Clink on Toggle

In components with toggle actions:
- `FilterBar.tsx` — High Impact toggle button
- `FilterBar.tsx` — Category filter buttons
- `Sidebar.tsx` — Collapse/expand button

Add a micro spring animation on click:
```tsx
whileTap={{ scale: 0.985 }}
transition={{ type: 'spring', stiffness: 600, damping: 15, duration: 0.15 }}
```

This creates a quick "clink" feel — the glass contracts 1.5% and bounces back.

### 8B. Scroll Momentum Glass Wobble

In scrollable containers (`NewsFeed.tsx`, `SentinelPanel.tsx` article grid, `SignalsSidebar.tsx`):
- Detect when scroll reaches the end (via `useScrollPosition.isAtEnd`)
- Apply a brief elastic overscroll effect using Framer Motion:
  ```tsx
  animate={{ y: [0, -2, 1, 0] }}
  transition={{ duration: 0.3, ease: 'easeOut' }}
  ```
- Trigger only when `velocity > threshold` at scroll boundary
- Only 1-2px displacement — subtle liquid settling feel

### 8C. Magnetic Snap Effect

Create `src/components/shared/MagneticButton.tsx`:

**Props:**
- `children: React.ReactNode`
- `strength?: number` (default: 0.15) — how strongly the element pulls toward cursor
- All standard button props

**Behavior:**
- Track mouse position relative to button center
- When cursor is within 20px radius, apply subtle `translate()` pulling element toward cursor:
  ```
  translateX = (mouseX - centerX) * strength
  translateY = (mouseY - centerY) * strength
  ```
- Capped at 3px max displacement
- Spring back on mouse leave: `transition: transform 0.3s ease-out`
- No-op on touch devices and reduced motion

Apply `MagneticButton` to:
- `ScannerDrawer.tsx` — "Scan" submit button
- `AnalystChat.tsx` — floating chat toggle button
- `FilterBar.tsx` — High Impact toggle
- `CommandPalette.tsx` — result items (subtle, strength: 0.08)

---

## Phase 9: Performance & Polish

### 9A. Backdrop-Filter Containment Audit

Audit all 73+ instances of `backdrop-filter` usage and:
- Identify nested glass panels that create unnecessary compositing layers
- Use `contain: layout paint` on glass panels that don't need to affect ancestors
- Remove `backdrop-filter` from elements fully covered by opaque children
- Document decisions in code comments

**Key areas to audit:**
- `SentinelPanel.tsx` → `BriefingBar` + `FilterBar` + `ArticleCard` grid — 3 nested glass layers
- `Sidebar.tsx` → `glass-panel-heavy` with nav items that have their own backgrounds
- `AnalystChat.tsx` → Panel with message bubbles that have semi-transparent backgrounds

### 9B. GPU Compositing Lifecycle

Create utility `src/utils/animationUtils.ts`:
```typescript
export function useWillChange(ref: RefObject<HTMLElement>, properties: string, duration: number) {
  // Sets will-change on mount, removes after `duration` ms
  // Prevents GPU memory leaks from permanent will-change
}
```

Apply to:
- Ambient orbs (remove `will-change` 2s after initial animation stabilizes)
- Toast notifications (remove after entrance animation: ~500ms)
- ScannerDrawer (remove after slide-in: ~300ms)
- CommandPalette (remove after open animation: ~400ms)

### 9C. Progressive Blur Degradation

In `src/components/layout/AppLayout.tsx`:
- On mount, check `useDeviceCapability()`
- If `isLowEnd`:
  - Set `document.documentElement.style.setProperty('--glass-blur-scale', '0.5')`
  - Set `document.documentElement.style.setProperty('--noise-opacity', '0')`
  - This halves all blur values and disables noise textures globally via CSS variables
- This preserves the glass aesthetic (transparency, borders, shadows) while reducing GPU load

### 9D. Integrate `useReducedMotion` Across All New Components

Ensure every new component/hook created in this plan checks `useReducedMotion()`:
- `AmbientBackground` — static gradient, no orb animation
- `ParallaxLayer` — render children without transform
- `CursorGlow` — don't render
- `GlassMaterialize` — simple opacity fade only (no blur transition)
- `GlassSmudge` — don't render
- `MagneticButton` — render as normal button
- `useScrollFade` — return static `{ opacity: 1, blur: 0 }`
- Scroll wobble — disabled

---

## File Change Summary

### New Files (12)
| File | Purpose |
|------|---------|
| `src/hooks/useReducedMotion.ts` | Reduced motion media query |
| `src/hooks/useDeviceCapability.ts` | Low-end device detection |
| `src/hooks/useMousePosition.ts` | Mouse tracking relative to ref |
| `src/hooks/useScrollPosition.ts` | Scroll position/velocity tracking |
| `src/hooks/useTimeOfDay.ts` | Time period for ambient theming |
| `src/hooks/useMarketMood.ts` | Market sentiment for orb colors |
| `src/hooks/useScrollFade.ts` | Scroll-linked opacity/blur |
| `src/components/layout/AmbientBackground.tsx` | Reactive ambient orbs |
| `src/components/shared/ParallaxLayer.tsx` | Depth parallax wrapper |
| `src/components/shared/CursorGlow.tsx` | Mouse-following glow |
| `src/components/shared/GlassSmudge.tsx` | Click smudge effect |
| `src/components/shared/GlassMaterialize.tsx` | Blur→clear entrance |
| `src/components/shared/MagneticButton.tsx` | Magnetic snap buttons |
| `src/utils/animationUtils.ts` | GPU compositing lifecycle |

### Modified Files (16)
| File | Changes |
|------|---------|
| `src/index.css` | All new CSS classes, keyframes, custom properties, reduced-motion overrides |
| `src/components/layout/AppLayout.tsx` | AmbientBackground integration, device capability check |
| `src/components/layout/Sidebar.tsx` | Active pill glass effect, cursor glow, magnetic buttons |
| `src/components/sentinel/SentinelPanel.tsx` | Staggered cascade, scroll fade |
| `src/components/sentinel/BriefingBar.tsx` | Glass dividers |
| `src/components/sentinel/FilterBar.tsx` | Embedded input styling, glass focus, glass clink |
| `src/components/sentinel/ScannerDrawer.tsx` | Glass transition, blur reveal, glass-panel-light |
| `src/components/sentinel/SignalsSidebar.tsx` | Hover tint, cursor glow |
| `src/components/sentinel/ArticleCard.tsx` | Glass smudge, glass materialize |
| `src/components/notifications/ToastContainer.tsx` | Surface ripple |
| `src/components/notifications/SignalToast.tsx` | Parallax depth |
| `src/components/shared/CommandPalette.tsx` | Glass focus, parallax |
| `src/components/shared/OnboardingOverlay.tsx` | Parallax |
| `src/components/shared/SkeletonPrimitives.tsx` | Glass condensation loading |
| `src/components/dashboard/NewsFeed.tsx` | Scroll fade, scroll wobble |
| `src/pages/Dashboard.tsx` (or equivalent) | Staggered cascade |

---

## Implementation Order

1. **Phase 1** (Hooks) — No dependencies, can be built in parallel
2. **Phase 2** (CSS) — No dependencies, can be built in parallel with Phase 1
3. **Phase 3** (Ambient Background) — Depends on Phase 1 hooks + Phase 2 CSS variables
4. **Phase 4** (Parallax) — Depends on Phase 1 hooks
5. **Phase 5** (Interactive Effects) — Depends on Phase 1 hooks + Phase 2 CSS
6. **Phase 6** (Transitions) — Depends on Phase 2 CSS + Phase 1 hooks
7. **Phase 7** (Component-Specific) — Depends on Phase 2 CSS
8. **Phase 8** (Micro-Interactions) — Depends on Phase 1 hooks
9. **Phase 9** (Performance) — Final pass, depends on everything above

---

## Testing Strategy

After each phase, run:
```bash
npx tsc --noEmit    # TypeScript strict check
npm run build       # Vite production build
```

Visual verification:
- Check glass panels at different viewport sizes
- Verify reduced motion behavior via browser dev tools (`prefers-reduced-motion: reduce`)
- Test on throttled CPU (Chrome DevTools → Performance → 4x slowdown) to verify low-end degradation
- Confirm no layout shifts from parallax or magnetic effects
- Verify backdrop-filter compositing layers in Chrome DevTools → Layers panel

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Backdrop-filter performance on mobile | Progressive degradation via `useDeviceCapability`, CSS variable scaling |
| Parallax causing layout shifts | Transform-only (no layout properties), capped displacement |
| Too many compositing layers | Phase 9A audit, `contain: layout paint`, will-change lifecycle |
| Chromatic aberration clashing with noise | Combine into single `::before` pseudo-element |
| Mouse tracking causing jank | `requestAnimationFrame` throttling in `useMousePosition` |
| Over-animation making UI feel busy | All effects are intentionally subtle (1-3px, 2-5% opacity), plus reduced-motion escape hatch |
