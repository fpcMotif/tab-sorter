# Chrome Native+ — notes

Thesis: Tab Sorter should feel like a feature Chrome shipped, not an extension bolted on — so every surface borrows Chrome's own GM3 (Material 3 "Chrome Refresh") system rather than inventing one: tonal surface-container steps instead of drop shadows, 20px+ pill controls, and the 9 real tab-group hues doing double duty as both decoration and information (a colored dot *is* the domain's identity, everywhere it appears).

Typography: `"Google Sans"/"Google Sans Text", Roboto` leading the stack with system sans fallbacks — Google Sans for the app name and hero label (display weight, slightly geometric), Google Sans Text/Roboto for body and controls, matching how Chrome itself splits display vs. UI text. All sentence case, no exclamation marks.

Palette: primary blue `#0B57D0` / dark `#A8C7FA` (Chrome's own GM3 accent, not generic Material purple), surfaces stepped across five `surface-container` tonal stops instead of elevation shadows, and the 9 canonical tab-group colors (grey/blue/red/yellow/green/pink/purple/cyan/orange) each carrying a dot + a soft tonal chip pair — verified ≥5:1 contrast in both themes. Dark mode swaps to lighter, more saturated tonal fills (dynamic-color feel) rather than just dimming.
