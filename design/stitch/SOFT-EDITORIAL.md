# Tab Sorter — "Soft Editorial" design language

Warm, typeset, calm, premium. Paper surfaces, sage accent, serif/sans pairing.
Source: Stitch design system `Soft Editorial` (asset `8f2a052188ba46babdf398d1eb09c7ce`,
project `7985049921010490402`). Tokens below are the source of truth for the WXT/React build.

## Screens (renders + live HTML in this folder)
- `soft-editorial-popup-light.*` — popup, light
- `soft-editorial-dark.*` — popup, warm-dark
- `soft-editorial-settings.*` — options page

## Color tokens
| Role | Light | Warm-dark |
|------|-------|-----------|
| Backdrop (paper) | `#F6F4EF` | `#18150F` |
| Card surface | `#FBFAF6` | `#221E18` |
| Hairline border | `#E6E2D4` | `#38322B` |
| Divider | `#E2DFD6` | `#2E2922` |
| Text primary | `#2C2C2C` | `#F3EFE7` |
| Text secondary | `#595959` | `#BDB4A6` |
| Text muted | `#8C8C8C` | `#8C8377` |
| Accent — sage base | `#7A8B7A` | `#8FA08F` |
| Accent — sage deep (active text) | `#526052` | `#A8B9A8` |
| Accent — sage light | `#A3B1A3` | — |
| Selected/hover tint | `#EFECE3` | sage @ ~12% |
| Error | `#BA1A1A` | `#FFB4AB` |

## Type
- **Serif — Crimson Pro** (titles/branding): `display-lg` 32/600 (-0.02em), `headline-md` 24/500, `title-sm` 18/500.
- **Sans — Inter** (all UI): `body-md` 14/400, `label-caps` 11/600 UPPERCASE +0.08em, `badge` 12/500, `kbd` 11/500.

## Shape & spacing
- Radius: cards **12px**, inputs/controls **8px**, kbd **4px**, pills/dots **full**.
- Spacing scale (px): 4 · 8 · 12 · 16 · 24 · 32. Card padding 12–16; section gaps 24 (airy).
- Depth = tonal layers + 1px hairlines. **No shadows, no gradients, no emoji.**

## Component notes
- **Segmented control:** sage-tinted active segment, muted inactive.
- **Toggle:** sage `#7A8B7A` when on.
- **Regex preset:** sage pill label + muted mono pattern + `×` remove; dashed "+ Add preset" in sage.
- **kbd chip:** paper bg + 1px border, muted text.
- **Favicon dot / count badge:** small, soft, pill-shaped.

> Reconciliation note: the earlier Figma build + first Stitch screen used a cool **indigo `#3B82F6`/`#4F46E5`** accent. This Soft Editorial track replaces that with **sage `#7A8B7A`** + Crimson Pro. Pick one before implementation — this file assumes Soft Editorial wins.
