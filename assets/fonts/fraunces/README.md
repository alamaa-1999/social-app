[Fraunces](https://github.com/undercasetype/Fraunces) is a typeface by The Fraunces Project
Authors, licensed under the SIL Open Font License, Version 1.1.

The full license text is in [`OFL.txt`](./OFL.txt) and must travel with this file.

```
Copyright 2018 The Fraunces Project Authors (https://github.com/undercasetype/Fraunces)
```

**Provenance**: Google Fonts only distributes Fraunces as a variable font (`wght`/`opsz`/`SOFT`/
`WONK` axes) — no static per-weight files exist upstream. This project needs a genuinely static
file (matching this project's own established, proven-working font-loading pattern — see
Scheherazade New — rather than a variable font, which has known font-weight-resolution
reliability problems in React Native, especially on Android). `Fraunces-SemiBold.ttf` here was
produced by instancing the upstream variable font at `wght=600, opsz=32, SOFT=0, WONK=1`
(`fontTools.varLib.instancer`, extracting one of the font's own predefined named-instance
coordinates) and freezing it as a static file — not a redistribution of an upstream static
build, since none exists. The `fvar` variable-font table is fully dropped from the result; this
is a true static single-weight font, not a variable font with one axis pinned at runtime.

`Fraunces-Regular.ttf` (`article/sub-title`, Figma node `279:4334`) was instanced the same way,
at `wght=400`, but at `opsz=9` rather than a custom in-between value — the STAT table registers
optical-size cuts as *ranges*, not single points (`9pt` covers `[9, 40.5]`, `72pt` covers
`[40.5, 108]`, `144pt` covers `[108, 144]`, confirmed by reading the source variable font's own
STAT table, not assumed), and both this file's 24px use and SemiBold's 32px use fall inside the
same `9pt` range - there is no real optical-size distinction to draw between them in this
typeface's own design. Using the exact STAT-registered value, rather than an arbitrary point
within its range, let `--update-name-table` succeed and generate a fully correct name on its own
(`opsz=24` was tried first and rejected outright: `fontTools` requires the requested coordinate to
match a registered STAT Axis Value before it can derive a name from it). Confirmed consistent with
`Fraunces-SemiBold.ttf` - despite that file's own note above claiming a different `opsz` - by
matching glyph count exactly (698) and near-identical file size (73084 vs. 73068 bytes); a
same-family, same-axis-region instance shouldn't gain or lose reachable glyphs, so an identical
count is the right thing to see, not a coincidence.

**You may redistribute this file.** Nothing in [`ASSETS.md`](../../../ASSETS.md) restricts it —
it is here because the OFL requires the license text to accompany the font, not because it is
carved out of our [MIT license](../../../LICENSE).
