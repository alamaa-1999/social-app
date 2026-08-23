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

**You may redistribute this file.** Nothing in [`ASSETS.md`](../../../ASSETS.md) restricts it —
it is here because the OFL requires the license text to accompany the font, not because it is
carved out of our [MIT license](../../../LICENSE).
