/**
 * Exact codepoint/name/meaning data for the 16-glyph Insert Honorific grid,
 * supplied directly by the project owner - not re-derived from glyph
 * rendering. Rendered via Scheherazade New (already loaded, Phase 2a). A
 * further 8+ entries from the owner's own reference list are deliberately
 * not included here - reference/future, not part of this build.
 *
 * Lives in its own plain, platform-agnostic module rather than inside
 * `Toolbar.tsx` (its original home, and still its main consumer) because
 * `editor-web/serializer/index.ts` needs the same codepoints to re-derive
 * honorific bidi isolation on load, and that file is part of the web-only
 * Vite bundle - importing `Toolbar.tsx` there would drag React Native,
 * Lingui and icon imports into a bundle that has no business containing
 * them. Same split, and same reasoning, as `state.ts`/`colorAllowlist.ts`,
 * which the serializer already imports today.
 */
export const HONORIFICS: {
  codepoint: number
  name: string
  meaning: string
}[] = [
  {
    codepoint: 0xfdfe,
    name: 'Subhaanahu wa Taaalaa',
    meaning:
      'May He be praised and exalted (Glorified and Lofty). The most common honorific for God.',
  },
  {
    codepoint: 0xfdff,
    name: 'Azza wa Jall',
    meaning:
      'The Glorified/Exalted/Mighty and Sublime. The second most common honorific for God.',
  },
  {
    codepoint: 0xfd4e,
    name: 'Tabaaraka wa-Taaalaa',
    meaning:
      'May he be blessed and exalted. One of the honorifics used only for God himself.',
  },
  {
    codepoint: 0xfdfa,
    name: 'Sallallahou Alayhe Wasallam',
    meaning:
      'The blessings and peace of God be upon him. Used after the name of a major prophet, especially the Prophet of Islam.',
  },
  {
    codepoint: 0xfd4a,
    name: 'Alayhi as-Salaatu was-Salaam',
    meaning:
      'Blessings and Peace be upon him. A lesser-used honorific for a prophet/Archangel.',
  },
  {
    codepoint: 0xfd47,
    name: 'Alayhi as-Salaam',
    meaning:
      "Peace be upon him. The normal honorific after a prophet's/Archangel's name.",
  },
  {
    codepoint: 0xfd49,
    name: 'Alayhimaa as-Salaam',
    meaning: 'Peace be upon them (both). Used for prophets and angels.',
  },
  {
    codepoint: 0xfd4d,
    name: 'Alayhaa as-Salaam',
    meaning:
      'Peace be upon her. Used after the name of a woman who was the mother of a prophet.',
  },
  {
    codepoint: 0xfd48,
    name: 'Alayhim as-Salaam',
    meaning:
      'Peace be upon them (masculine plural). Used for two or more prophets.',
  },
  {
    codepoint: 0xfd41,
    name: 'Radi Allaahu Anh',
    meaning: 'May God be pleased with him. Used for companions of the Prophet.',
  },
  {
    codepoint: 0xfd42,
    name: 'Radi Allaahu Anhaa',
    meaning:
      "May God be pleased with her. Companions of the Prophet, also Mary/Jesus' apostles in some regions.",
  },
  {
    codepoint: 0xfd44,
    name: 'Radi Allaahu Anhumaa',
    meaning:
      'May God be pleased with them (both). Used for companions of the Prophet.',
  },
  {
    codepoint: 0xfd43,
    name: 'Radi Allaahu Anhum',
    meaning:
      'May God be pleased with them (masc. plural, or mixed group). Used for companions of the Prophet.',
  },
  {
    codepoint: 0xfd45,
    name: 'Radi Allaahu Anhunna',
    meaning:
      'May God be pleased with them (feminine). Used for companions of the Prophet.',
  },
  {
    codepoint: 0xfd40,
    name: 'Rahimahu Allaah',
    meaning:
      'May God have mercy upon him. Companions of the Prophet, widely recognized scholars, or any deceased believer.',
  },
  {
    codepoint: 0xfd4f,
    name: 'Rahimahum Allaah',
    meaning:
      'God have mercy upon them (masculine). Widely recognized scholars, also ordinary believers.',
  },
]

/**
 * Every honorific codepoint, as a lookup set - the single source of truth
 * `serializer/index.ts`'s `applyHonorificIsolation` walks text nodes
 * against, so the glyph list never has to be maintained in two places.
 */
export const HONORIFIC_CODEPOINTS = new Set(HONORIFICS.map(h => h.codepoint))
