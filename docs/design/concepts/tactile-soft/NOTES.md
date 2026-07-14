# Tactile Soft — direction notes

Thesis: the popup should feel like a well-made physical switch panel, not a floating pane of glass — every control has weight, travel and a resting shadow, so pressing Tidy feels like an event, not a click on a rectangle.

Typography: `ui-rounded`/SF Pro Rounded leading the stack (with Nunito/system-ui fallback) for warm, soft terminals at 15px base; hero title 800 weight, body 400–600, `kbd` chips set in monospace to read as tiny keycaps.

Palette: warm cream canvas (#F7F1E7 / #221E27 dark) with six pastel section tints (mint, lavender, peach, sky, butter) that never touch full saturation — all the punch is reserved for one deep terracotta primary (#C2431B → #F0754A in dark) so Tidy is unmistakably the one thing to press.

Shadows: layered soft-shadow recipe (inset highlight + tight contact shadow + broad ambient blur) drives every raised surface; pressed states swap it for a single inset shadow plus a 2–3px translateY, and dark mode trades warm-brown shadows for black glows to keep the same physicality.

Motion: 150ms with a mild-overshoot cubic-bezier(.22,1.4,.36,1) everywhere, fully disabled under `prefers-reduced-motion`.
