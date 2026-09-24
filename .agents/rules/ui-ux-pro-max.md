# UI/UX Pro Max — Design System & Interface Quality Standards

This rule enforces professional UI/UX standards across all client-facing dashboard and web interface development for TrendTok Analytics, based on the **UI/UX Pro Max** intelligence framework.

---

## 1. Design System & Palette (Light-Theme SaaS)

* **Visual Aesthetic**: Modern, clean, data-dense SaaS interface inspired by Linear and Stripe.
* **Theme**: Crisp light theme with high legibility, subtle borders, and layered card elevations.
* **Semantic Tokens**: All colors, paddings, and radii must use CSS Custom Properties (`--bg-primary`, `--text-primary`, `--border-color`, `--radius-md`, etc.).
* **Typography**:
  * Headings & UI: Clean neo-grotesque sans-serif (`Plus Jakarta Sans` / `Inter`).
  * Metrics & Telemetry: Monospace tabular numerals (`JetBrains Mono` / `Fira Code`).

---

## 2. Professional UI Checklist (Pre-Delivery Mandatory)

1. **Icons & Visual Elements**:
   * **Zero Emojis as Icons**: Never use raw emojis (🔥, 🚀, 📈, ⚙️) as UI icons or status markers. Use inline scalable SVG vectors (Lucide / Heroicons style).
   * **Consistent Stroke Width**: 1.5px or 2px uniform stroke across all visual icons.
2. **Accessibility (WCAG 2.1 AA)**:
   * **Text Contrast**: Minimum 4.5:1 contrast ratio against background surfaces for normal text.
   * **Visible Focus Indicators**: Interactive elements must retain clear, high-contrast focus rings (`outline: 2px solid var(--accent-indigo); outline-offset: 2px;`) for keyboard navigation.
   * **Accessible Touch Targets**: Minimum 44×44px interactive bounding box.
   * **Motion Accessibility**: All animations must respect `@media (prefers-reduced-motion: reduce)`.
3. **Interactions & Feedback**:
   * **Cursor Affordance**: Explicit `cursor: pointer` on all buttons, links, clickable table rows, and interactive chips.
   * **Smooth Micro-Interactions**: Hover, press, and focus transitions between 150ms and 250ms with `cubic-bezier(0.16, 1, 0.3, 1)`.
   * **Hover Stability**: Avoid layout-shifting hover transforms that shift surrounding content.
4. **Responsive Layout & Text Resilience**:
   * Support breakpoints: `375px` (mobile), `768px` (tablet), `1024px` (laptop), `1440px` (desktop).
   * No horizontal scroll on mobile viewports.
   * Chips and tags must wrap or use operational disclosure (`+n`), never clip illegibly.

---

## 3. Design Intelligence Tooling

Whenever designing new UI features, finding color schemes, or selecting layout styles, execute the local UI/UX Pro Max search engine:

```bash
# Search by domain (style, color, typography, chart, ux, icon)
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain <domain>

# Generate full design system for a specific product context
python3 .agents/skills/ui-ux-pro-max/scripts/design_system.py "<context description>"
```
