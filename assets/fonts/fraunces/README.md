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

**You may redistribute this file.** Nothing in [`ASSETS.md`](../../../ASSETS.md) restricts it —
it is here because the OFL requires the license text to accompany the font, not because it is
carved out of our [MIT license](../../../LICENSE).
