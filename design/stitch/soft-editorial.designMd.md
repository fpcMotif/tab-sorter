---
name: Precision Minimalist
colors:
  surface: '#fbf9f9'
  surface-dim: '#dbdad9'
  surface-bright: '#fbf9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#e9e8e7'
  surface-container-highest: '#e3e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#464555'
  inverse-surface: '#303031'
  inverse-on-surface: '#f2f0f0'
  outline: '#777587'
  outline-variant: '#c7c4d8'
  surface-tint: '#4d44e3'
  primary: '#3525cd'
  on-primary: '#ffffff'
  primary-container: '#4f46e5'
  on-primary-container: '#dad7ff'
  inverse-primary: '#c3c0ff'
  secondary: '#5f5e5e'
  on-secondary: '#ffffff'
  secondary-container: '#e2dfde'
  on-secondary-container: '#636262'
  tertiary: '#7e3000'
  on-tertiary: '#ffffff'
  tertiary-container: '#a44100'
  on-tertiary-container: '#ffd2be'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e2dfff'
  primary-fixed-dim: '#c3c0ff'
  on-primary-fixed: '#0f0069'
  on-primary-fixed-variant: '#3323cc'
  secondary-fixed: '#e5e2e1'
  secondary-fixed-dim: '#c8c6c5'
  on-secondary-fixed: '#1c1b1b'
  on-secondary-fixed-variant: '#474746'
  tertiary-fixed: '#ffdbcc'
  tertiary-fixed-dim: '#ffb695'
  on-tertiary-fixed: '#351000'
  on-tertiary-fixed-variant: '#7b2f00'
  background: '#fbf9f9'
  on-background: '#1b1c1c'
  surface-variant: '#e3e2e2'
typography:
  headline-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: -0.01em
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0em
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0em
  label-xs:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 12px
    letterSpacing: 0.05em
  headline-sm-mobile:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style
The design system is built on a foundation of hyper-efficiency, clarity, and structural precision. Inspired by modern developer tools and high-performance productivity software, the aesthetic is ultra-minimal and flat, prioritizing content density without sacrificing legibility. 

The emotional response should be one of "calm focus"—a workspace that feels both lightweight and robust. It avoids unnecessary decoration, relying instead on hairline strokes, purposeful whitespace, and a restrained color palette to establish hierarchy. The style is **Modern Corporate Minimalism**, utilizing subtle layering and crisp geometry to create a professional, high-utility environment.

## Colors
The palette is centered on a high-neutrality foundation to ensure the primary accent retains maximum functional impact.

- **Surface Logic:** The background uses a cool-toned gray (`#EEF0F3`) to provide a distinct contrast against the primary UI surfaces (`#FAFAFA`), creating a "floating sheet" effect without heavy shadows.
- **Typography:** Deep Charcoal (`#1A1A1A`) is used for primary headings and body text to ensure AA/AAA accessibility. Muted text (`#737373`) is reserved for metadata, placeholders, and secondary descriptions.
- **Accents:** Calm Indigo-Blue (`#4F46E5`) is the sole driver of action. It is used sparingly for primary buttons, active states, and focus indicators.
- **Dividers:** All borders and dividers use a hairline 1px stroke in `#E5E7EB` to maintain a sharp, technical feel.

## Typography
This design system utilizes **Inter** for its neutral, systematic qualities and excellent legibility at small sizes. 

- **Hierarchy:** We prioritize a narrow range of sizes (11px to 16px) to maintain a dense, tool-like interface. Titles are differentiated by weight (`Semibold`) rather than massive scale increases.
- **Micro-copy:** Use the `label-xs` style for category headers, table column headers, and overline text. The increased letter-spacing and uppercase styling ensure distinct separation from body content.
- **Rendering:** All text should utilize `antialiased` font-smoothing to preserve the hairline aesthetic of the Inter typeface.

## Layout & Spacing
The layout follows a strict **4px baseline grid** to ensure mathematical harmony between small UI elements like badges, icons, and input heights.

- **Grid Model:** A 12-column fluid grid is used for main content areas, but internal component layouts (like sidebars and property panels) use fixed widths (e.g., 240px or 320px) to mimic desktop application behavior.
- **Density:** Padding is intentionally lean. Use `sm` (8px) for internal component padding and `md` (16px) for layout gaps.
- **Breakpoints:**
  - **Mobile (<768px):** Single column, full-width cards, 16px margins.
  - **Desktop (>768px):** Multi-pane layout (Navigation | Content | Inspector), 32px margins.

## Elevation & Depth
Elevation is communicated through **Tonal Layers** and **Hairline Outlines** rather than traditional shadows.

- **The Base:** The bottom-most layer is the `#EEF0F3` backdrop.
- **The Surface:** Main cards and content containers use `#FAFAFA` with a 1px solid border (`#E5E7EB`). 
- **Shadows:** Use a single, extremely soft "Ambient Shadow" for elevated states like dropdowns or modals: `0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)`.
- **Active State:** Elements do not "pop" off the screen; instead, they use a subtle inset or a 1px primary-colored border to indicate focus.

## Shapes
The shape language is sophisticated and controlled. A standard corner radius of **10px to 12px** is applied to all primary containers and buttons.

- **Standard (10px):** Default for buttons, input fields, and segmented controls.
- **Large (12px):** Default for cards, modals, and main content areas.
- **Full (Pill):** Reserved exclusively for status badges and favicon-style dots.

## Components
- **Buttons:** Slim height (32px or 36px). Primary buttons use the Indigo background with white text. Secondary buttons use a white background with a 1px border.
- **Inputs:** Height 36px. Subtle 16px icons placed inside the left/right padding. Use a 1px `#4F46E5` border for the `:focus` state.
- **Segmented Controls:** A flat, light gray track with a white, slightly shadowed "sliding" active state. The height should match buttons.
- **Lists:** Rows are 40px - 48px high. Use small 8px circular dots for status indicators. Count badges should be small, using the `label-xs` type style with a subtle gray background.
- **Cards:** No heavy drop shadows. Defined by their `#FAFAFA` fill and `#E5E7EB` border. Internal padding should be a consistent 16px.
- **Badges:** Small, non-intrusive, and pill-shaped. Text should be `label-xs`.