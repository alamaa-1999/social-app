[Archivo](https://github.com/Omnibus-Type/Archivo) is a typeface by The Archivo Project Authors,
licensed under the SIL Open Font License, Version 1.1.

The full license text is in [`OFL.txt`](./OFL.txt) and must travel with this file.

```
Copyright 2020 The Archivo Project Authors (https://github.com/Omnibus-Type/Archivo)
```

**Provenance**: Google Fonts only distributes Archivo as a variable font (`wght`/`wdth` axes) —
no static per-weight files exist upstream. `Archivo-SemiBold.ttf` here was produced by instancing
the upstream variable font at `wght=600, wdth=100` (`fontTools.varLib.instancer`) and freezing it
as a static file, matching this project's established, proven-working font-loading pattern (see
Scheherazade New) rather than shipping a variable font — React Native's font-weight resolution
for variable fonts is known to be unreliable, especially on Android. The `fvar` variable-font
table is fully dropped from the result.

`Archivo-SemiBoldItalic.ttf` is a real italic cut, not a synthetic slant — confirmed by
`post.italicAngle` being `-10` (vs. `0` on the upright) and by Google Fonts shipping Archivo's
italic as its own separate upstream variable font, `Archivo-Italic[wdth,wght].ttf`. Instanced at
the same `wght=600, wdth=100` as `Archivo-SemiBold.ttf`, with `--update-name-table`. Same naming
artifact as Vollkorn's italic cuts (the source file's own `ArchivoItalic-` PS-name-prefix bled
into the full/PostScript names) — patched by hand to `Archivo-SemiBoldItalic`, matching the
upright's naming.

**You may redistribute this file.** Nothing in [`ASSETS.md`](../../../ASSETS.md) restricts it —
it is here because the OFL requires the license text to accompany the font, not because it is
carved out of our [MIT license](../../../LICENSE).

`Archivo-Regular.ttf` was instanced the same way, at `wght=400, wdth=100`, from the same
upstream variable font (`google/fonts` repo, `ofl/archivo/Archivo[wdth,wght].ttf`) via
`fontTools.varLib.instancer --update-name-table`. Confirmed consistent with the shipped
SemiBold file via matching glyph count (834) and near-identical file size. Registered as its
own `'Archivo Regular'` family (not a second weight under `'Archivo SemiBold'`), matching how
Fraunces SemiBold/Regular are split into two families above rather than sharing one.
