# Company Zero — Product Design System 2026

## Thesis
Company Zero should feel like a premium operating product, not a developer dashboard. The visual system is **Carbon / Paper / Acid**: dark product chrome, a warm paper work surface, and one high-voltage acid accent reserved for live state and decisive action.

## Product principles
1. **Work is the hero.** Chrome recedes; useful work and results carry visual weight.
2. **One accent earns attention.** Acid is not decoration. Use it for primary action, live state, and the organism.
3. **Surfaces over outlines.** Prefer tonal separation, whitespace, radius, and elevation. Borders are structural only.
4. **Readable by default.** Body copy is 11–17px depending on role; tiny metadata is never the primary communication layer.
5. **Editorial hierarchy.** Large, tightly tracked display type; calm body type; restrained uppercase eyebrows.
6. **The organism is alive, not a spinner.** It appears only around genuine active work and uses organic deformation rather than rotation.
7. **Human language above system language.** Runtime concepts belong in Advanced.
8. **Desktop is dense enough to feel valuable, never dense enough to feel like telemetry.**

## Color
- Carbon `#111310`: product chrome and high-trust dark surfaces.
- Paper `#F3F2EC`: primary work canvas.
- Surface `#FBFAF6`: cards and input material.
- Ink `#171915`: primary text / dark action.
- Acid `#B9F34A`: live state and decisive brand voltage.
- Amber: attention / waiting.
- Red: destructive action only.

## Shape
- 10px: compact controls
- 16–18px: normal cards
- 22–24px: important work surfaces
- 26–30px: hero surfaces
- Pills only for tags/status/suggestions, never every button.

## Elevation
Two levels only. Small cards use restrained ambient shadow. Hero/work surfaces can use a larger soft shadow. Never combine thick borders + shadows + gradients.

## Typography
- Display: 38–78px, weight 620, tracking -4% to -6%.
- Section title: 22–28px, weight 580–620.
- Product body: 12–17px.
- Metadata: 9–11px, muted.
- Uppercase eyebrow: 10px, 0.11em tracking.

## Motion
- Hover: 140–180ms, 1px lift maximum.
- Modal/backdrop: 180–240ms.
- Organism: 4–6s irregular deformation.
- Respect `prefers-reduced-motion`.

## Layout
- Desktop chrome: 248px carbon sidebar + warm work canvas.
- Main content: max 1120px.
- Returning home: command + active work + updates/results.
- Active work: 1fr + 300px context rail; context collapses below main content on smaller screens.
- Mobile: sidebar becomes a drawer; composer remains full-width and never overlays content.

## Anti-patterns
- No terminal-green hairline grids.
- No repeated bordered rectangles.
- No 8px primary copy.
- No giant empty hero after work exists.
- No decorative live dots everywhere.
- No generic glassmorphism.
- No emoji/unicode icons in controls.
- No internal runtime nouns in primary UI.
