import Blockquote from '@tiptap/extension-blockquote'
import Bold from '@tiptap/extension-bold'
import {Color} from '@tiptap/extension-color'
import Heading from '@tiptap/extension-heading'
import Image from '@tiptap/extension-image'
import Italic from '@tiptap/extension-italic'
import Link from '@tiptap/extension-link'
import BulletList from '@tiptap/extension-bullet-list'
import ListItem from '@tiptap/extension-list-item'
import OrderedList from '@tiptap/extension-ordered-list'
import Strike from '@tiptap/extension-strike'
import {TextStyle} from '@tiptap/extension-text-style'
import {MarkdownManager} from 'tiptap-markdown-fixed'

import Document from 'tiptap-extension-document-fixed'
import Paragraph from 'tiptap-extension-paragraph-fixed'
import Text from 'tiptap-extension-text-fixed'
import {UnderlineBridge} from '../bridges/underline'

/**
 * The one `MarkdownManager` instance for the whole web bundle - shared by
 * `AdvancedEditor.tsx` (load path: `applyFacetsToParsedDoc`) and
 * `bridges/content.ts` (save path: `serializeToMarkdownAndFacets`), so
 * there is exactly one place that has to know the real editor's full
 * node/mark set, not two independently-maintained lists that could drift
 * apart silently.
 *
 * Extension list mirrors what `AdvancedEditor.tsx`'s real `bridges` array
 * actually registers as node/mark types (not attribute-only extensions
 * like `TextAlignBridge`/`TypographyBridge`/`HonorificBridge`/
 * `ParagraphStyleBridge` - those add attributes or orchestrate existing
 * nodes, they don't introduce a node/mark type of their own, so they need
 * no entry here; `serializeToMarkdownAndFacets`/`applyFacetsToParsedDoc`
 * read/write their attributes directly off the parsed JSON, not through
 * the manager's own schema awareness). `OrderedList` is included even
 * though the pre-existing test-fixture `makeManager()` helpers in this
 * directory's own test suite omit it - confirmed directly, not assumed,
 * that this was a real, previously-latent gap: the Toolbar's "Numbered
 * List" paragraph style (`ParagraphStyleBridge`'s `toggleOrderedList`)
 * would otherwise round-trip through a manager that has never heard of
 * ordered lists at all.
 *
 * `UnderlineBridge.tiptapExtension` (this app's own, from `../bridges/
 * underline` - not the bare `@tiptap/extension-underline` `TenTapStartKit`
 * ships by default) specifically, so the manager's markdown rendering
 * matches the real editor's suppressed-`++text++` behavior exactly - using
 * the default extension here would silently reintroduce the conflict that
 * bridge exists to close.
 */
export const manager = new MarkdownManager({
  extensions: [
    Document,
    Paragraph,
    Text,
    Bold,
    Italic,
    Strike,
    Blockquote,
    UnderlineBridge.tiptapExtension,
    TextStyle,
    Color,
    Heading,
    Link,
    BulletList,
    OrderedList,
    ListItem,
    Image,
  ] as never,
})
