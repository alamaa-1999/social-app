/**
 * @jest-environment jsdom
 *
 * `bridges/underline.ts` imports the bare `@10play/tentap-editor` root
 * (see that file's own doc comment for why `/web` isn't viable), which
 * eagerly pulls in `RichText.tsx` via its barrel export - harmless in the
 * real Vite bundle (nothing here uses `RichText`, so it tree-shakes away)
 * but fatal under Jest, which eagerly evaluates the whole `require()` graph
 * regardless of what's actually used. Two separate, real crashes surfaced
 * getting this file to import at all, both confirmed directly rather than
 * guessed around:
 * - `RichText.tsx` requires `react-native-webview`, which throws
 *   `TurboModuleRegistry.getEnforcing(...): 'RNCWebViewModule' could not be
 *   found` outside a real native binary. Mocking the native module
 *   directly (not the whole `@10play/tentap-editor` package) is the
 *   narrowest fix - it lets that one `require()` resolve to something
 *   inert.
 * - Past that, `webEditorUtils/focusListener.tsx` calls
 *   `window.addEventListener` at module-load time, which throws under
 *   Jest's default (non-browser) test environment for this project - the
 *   same class of problem `sanitize.test.ts` already documents for
 *   `@tiptap/markdown`'s `parseHTMLToken`. The same fix applies: this
 *   file-level `@jest-environment jsdom` pragma, not a second mock.
 */
jest.mock('react-native-webview', () => ({}))

import Document from 'tiptap-extension-document-fixed'
import Paragraph from 'tiptap-extension-paragraph-fixed'
import Text from 'tiptap-extension-text-fixed'
import {MarkdownManager} from 'tiptap-markdown-fixed'

import {UnderlineBridge} from '../underline'

describe('UnderlineBridge - the real production bridge, not a test-only stand-in', () => {
  it('imports and clones cleanly from the real TenTap UnderlineBridge', () => {
    expect(UnderlineBridge.name).toBe('underline')
    expect(UnderlineBridge.tiptapExtension).toBeDefined()
  })

  it('suppresses the default ++text++ markdown rendering, using the real bridge extension', () => {
    const manager = new MarkdownManager({
      extensions: [
        Document,
        Paragraph,
        Text,
        UnderlineBridge.tiptapExtension,
      ] as never,
    })
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'plain '},
            {type: 'text', text: 'underlined', marks: [{type: 'underline'}]},
          ],
        },
      ],
    }
    const markdown = manager.serialize(doc)
    expect(markdown).not.toContain('++')
    expect(markdown).toBe('plain underlined')
  })

  it('still exposes the real TenTap toggle/state logic - cloned, not reimplemented', () => {
    expect(typeof UnderlineBridge.onBridgeMessage).toBe('function')
    expect(typeof UnderlineBridge.extendEditorState).toBe('function')
    expect(typeof UnderlineBridge.extendEditorInstance).toBe('function')
  })
})
