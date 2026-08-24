/**
 * @jest-environment jsdom
 *
 * Lives under `editor-web/`, not `bridges/__tests__/`, deliberately: this
 * is the one place `createContentBridgeMessageHandler` (from
 * `bridges/content.ts`) gets wired to the real `manager`/
 * `serializeToMarkdownAndFacets`/`applyFacetsToParsedDoc` - exactly how
 * `AdvancedEditor.tsx` wires it in production. `bridges/content.ts` itself
 * deliberately has no import of `editor-web/` at all (see that file's own
 * top comment: it's imported by native code too, and `editor-web/` pulls
 * in `@tiptap/markdown`/`@tiptap/core`, the isolated Vite bundle's own
 * dependencies) - putting this test under `editor-web/`'s own excluded
 * tree (`tsconfig.check.json`) keeps that boundary real: a test importing
 * both `bridges/content.ts` and `editor-web/manager` from *outside*
 * `editor-web/` would pull the whole excluded tree back into the main
 * app's typecheck, exactly the transitive-inclusion problem
 * `tsconfig.check.json`'s own fix (see `state.ts`'s `validateFacetBounds`
 * doc comment and the Week 3 engineering notes) exists to prevent.
 *
 * `bridges/content.ts`'s own native-safe pieces (`extendEditorInstance`/
 * `onEditorMessage`'s async request/response plumbing, `extendEditorState`)
 * are tested separately, in `bridges/__tests__/content.test.ts`, without
 * ever importing anything from here - that split mirrors the real
 * production boundary, not just a testing convenience.
 */
jest.mock('react-native-webview', () => ({}))

import '../serializer/__tests__/_jsdomTextEncoderPolyfill'

import {createContentBridgeMessageHandler} from '../../bridges/content'
import {type EditorFacet} from '../../state'
import {manager} from '../manager'
import {
  applyFacetsToParsedDoc,
  serializeToMarkdownAndFacets,
} from '../serializer'

const handler = createContentBridgeMessageHandler({
  serialize: doc => serializeToMarkdownAndFacets(manager, doc as never),
  parse: (markdown, facets) =>
    applyFacetsToParsedDoc(manager, markdown, facets as never),
})

describe('createContentBridgeMessageHandler - GetMarkdownAndFacets', () => {
  it('serializes the live editor.getJSON() doc and sends it back tagged with the request messageId', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {type: 'text', text: 'hello '},
            {type: 'text', text: 'world', marks: [{type: 'bold'}]},
          ],
        },
      ],
    }
    const expected = serializeToMarkdownAndFacets(manager, doc)
    const mockEditor = {getJSON: () => doc, commands: {setContent: jest.fn()}}
    const sendMessageBack = jest.fn()

    handler(
      mockEditor,
      {
        type: 'get-markdown-and-facets' as never,
        payload: {messageId: 'req-1'},
      },
      sendMessageBack,
    )

    expect(sendMessageBack).toHaveBeenCalledWith({
      type: 'send-markdown-and-facets-to-native',
      payload: {
        markdown: expected.markdown,
        facets: expected.facets,
        messageId: 'req-1',
      },
    })
  })

  it("round-trips numbered lists correctly - a real, previously-latent gap in this manager's extension list, confirmed fixed", () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [
                {type: 'paragraph', content: [{type: 'text', text: 'first'}]},
              ],
            },
            {
              type: 'listItem',
              content: [
                {type: 'paragraph', content: [{type: 'text', text: 'second'}]},
              ],
            },
          ],
        },
      ],
    }
    const sendMessageBack = jest.fn()
    handler(
      {getJSON: () => doc, commands: {setContent: jest.fn()}},
      {type: 'get-markdown-and-facets' as never, payload: {messageId: 'x'}},
      sendMessageBack,
    )
    const sent = sendMessageBack.mock.calls[0][0] as {
      payload: {markdown: string}
    }
    expect(sent.payload.markdown).toContain('1. first')
    expect(sent.payload.markdown).toContain('2. second')
  })
})

describe('createContentBridgeMessageHandler - LoadMarkdownAndFacets', () => {
  it('runs the real applyFacetsToParsedDoc (correlation + sanitization) before calling setContent', () => {
    const markdown = 'before <script>window.__FIRED__ = true</script> after'
    const facets: EditorFacet[] = []
    const expected = applyFacetsToParsedDoc(manager, markdown, facets)
    const setContent = jest.fn<void, [unknown]>()
    const mockEditor = {getJSON: () => ({}), commands: {setContent}}

    handler(
      mockEditor,
      {
        type: 'load-markdown-and-facets' as never,
        payload: {markdown, facets},
      },
      () => {},
    )

    expect(setContent).toHaveBeenCalledWith(expected.doc)
    // The point of routing through applyFacetsToParsedDoc at all, not a
    // raw CoreBridge setContent - confirms this path is genuinely
    // sanitized, not just structurally equal to some other unsanitized
    // computation by coincidence.
    expect(JSON.stringify(setContent.mock.calls[0][0])).not.toContain('script')
  })

  it('loading a numbered-list markdown string parses it back into a real orderedList node, not dropped text', () => {
    const markdown = '1. first\n2. second'
    const setContent = jest.fn<void, [unknown]>()
    handler(
      {getJSON: () => ({}), commands: {setContent}},
      {
        type: 'load-markdown-and-facets' as never,
        payload: {markdown, facets: []},
      },
      () => {},
    )
    expect(JSON.stringify(setContent.mock.calls[0][0])).toContain('orderedList')
  })
})
