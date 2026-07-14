# Utility Dense — Notes

Thesis: Tab Sorter should feel like a Raycast/Linear instrument, not a "cute" extension — density and legibility signal that the tool respects the user's time, so every row earns its 28-32px and nothing is decorative.
Typography: system UI stack at 13px for all labels/copy (never smaller than 11px, even for consequence sentences), with a monospace stack reserved strictly for numerals, counts, regex, and keyboard chips — mixing the two fonts is the visual cue for "this is data" vs "this is prose."
Palette: cool near-black neutrals (no warm greys) with a single restrained indigo-violet accent (#5457E5) used only for the Tidy hero, active segments, and links — danger (dupes) and success (undo/toast) get their own muted semantic colors so the accent's meaning ("primary action") never gets diluted.
Chrome's 9 tab-group colors appear only as small identity dots on domain rows and the success toast's group strip — desaturated slightly so they read as data, not confetti.
Borders do the elevation work (1px, two tones: --border for structure, --border-strong for interactive edges); shadows are reserved for the floating popup frame itself.
Motion is a single 140ms ease-out, fully gated by prefers-reduced-motion, used only for state changes (arm/disarm, disclosure, toggle) — never for entrance flourishes.
