[Vollkorn](https://github.com/FAlthausen/Vollkorn-Typeface) is a typeface by The Vollkorn Project
Authors, licensed under the SIL Open Font License, Version 1.1.

The full license text is in [`OFL.txt`](./OFL.txt) and must travel with this file.

```
Copyright 2017 The Vollkorn Project Authors (https://github.com/FAlthausen/Vollkorn-Typeface)
```

**Provenance**: Google Fonts only distributes Vollkorn as a variable font (`wght` axis) — no
static per-weight files exist upstream. `Vollkorn-Regular.ttf` here was produced by instancing
the upstream variable font at `wght=400` (`fontTools.varLib.instancer`) and freezing it as a
static file, matching this project's established, proven-working font-loading pattern (see
Scheherazade New) rather than shipping a variable font — React Native's font-weight resolution
for variable fonts is known to be unreliable, especially on Android. The `fvar` variable-font
table is fully dropped from the result.

`Vollkorn-Bold.ttf` was instanced the same way, at `wght=700` (the font's own named-instance
value for "Bold", confirmed from its `fvar` table rather than assumed). **Use
`--update-name-table` when doing this** — without it, the instancer sets `OS/2.usWeightClass`
correctly (700) but leaves the name table's family/subfamily/full/PostScript names exactly as
they were for the default instance ("Regular"), a real and easy-to-miss mismatch since the file
still looks superficially correct (loads, renders, has the right weight class) right up until
something tries to resolve it by name/style. Confirmed by diffing the name table against
`Vollkorn-Regular.ttf` before shipping this file. Even with the flag, the instancer produced
`VollkornRoman-Bold` for the full/PostScript names (from the source font's own PS-name-prefix
metadata) rather than `Vollkorn-Bold` — patched by hand afterward to match `Vollkorn-Regular.ttf`'s
own naming exactly, so the two weights agree on more than just the family name.

`Vollkorn-Italic.ttf` (`wght=400`) and `Vollkorn-BoldItalic.ttf` (`wght=700`) are real italic
cuts, not a synthetic slant of the upright — confirmed by `post.italicAngle` being `-11` on both
(vs. `0` on Regular/Bold) and by the fact that Google Fonts ships Vollkorn's italic as its own
separate upstream variable font, `Vollkorn-Italic[wght].ttf`, with its own named instances
(`Italic` at `wght=400`, `Bold Italic` at `wght=700`, confirmed from its `fvar` table). Instanced
the same way as Regular/Bold, with `--update-name-table`. Even with the flag, the instancer named
both `VollkornItalic-Italic`/`VollkornItalic-BoldItalic` for the full/PostScript names (the
"Italic" source file's own PS-name-prefix bleeding through, the same class of artifact `Bold` hit
with "Roman") rather than `Vollkorn-Italic`/`Vollkorn-BoldItalic` — patched by hand to match, so
all four weights agree on naming. Glyph count is lower than Regular/Bold (1835 vs. 2303) — normal
for an italic cut with a smaller alternates/ligature set, not a defect; checked that basic Latin,
digits, and common punctuation are all still covered before shipping.

**You may redistribute this file.** Nothing in [`ASSETS.md`](../../../ASSETS.md) restricts it —
it is here because the OFL requires the license text to accompany the font, not because it is
carved out of our [MIT license](../../../LICENSE).
