/**
 * @jest-environment jsdom
 *
 * `content.ts` imports `BridgeExtension` from the bare `@10play/tentap-editor`
 * root, which pulls in `react-native-webview`/`focusListener.tsx` under
 * Jest the same way every other bridge here does - same two-layer fix as
 * `underline.test.ts`/`paragraphStyle.test.ts`.
 *
 * Tests only `ContentBridge`'s own native-safe surface -
 * `extendEditorInstance`/`onEditorMessage`'s async request/response
 * plumbing, `extendEditorState`'s wordCount/charCount - deliberately
 * without ever importing `editor-web/manager`/`editor-web/serializer`.
 * `createContentBridgeMessageHandler` (the manager-dependent piece
 * `content.ts` itself never imports either - see its own top comment) is
 * tested separately, wired to the real manager, in
 * `editor-web/__tests__/content.test.ts` - keeping that import out of
 * *this* file mirrors the real production boundary `content.ts` was
 * restructured to enforce, not just a testing-convenience split.
 */
jest.mock('react-native-webview', () => ({}))

import '../../editor-web/serializer/__tests__/_jsdomTextEncoderPolyfill'

import {type EditorFacet} from '../../state'
import {ContentBridge} from '../content'

/** Loose shape covering every message `sendBridgeMessage` sends in these tests - typing the mock with this (rather than leaving it implicit `any`) is what makes `.mock.calls` accesses below safe to index into. */
type SentMessage = {type: string; payload: Record<string, unknown>}

describe('ContentBridge.onBridgeMessage is unset by default - assigned only by AdvancedEditor.tsx', () => {
  it('confirms the bridge itself carries no manager-dependent handler, by design', () => {
    expect(ContentBridge.onBridgeMessage).toBeUndefined()
  })
})

describe('ContentBridge native request/response round trip', () => {
  it('getMarkdownAndFacets() resolves with whatever the matching SendMarkdownAndFacetsToNative response carries', async () => {
    const sendBridgeMessage = jest.fn<void, [SentMessage]>()
    const instance = ContentBridge.extendEditorInstance?.(
      sendBridgeMessage,
      undefined,
      undefined,
      undefined,
      'ios',
    )
    const resultPromise = instance?.getMarkdownAndFacets()

    expect(sendBridgeMessage).toHaveBeenCalledTimes(1)
    const sentMessage = sendBridgeMessage.mock.calls[0][0] as {
      type: string
      payload: {messageId: string}
    }
    expect(sentMessage.type).toBe('get-markdown-and-facets')
    const {messageId} = sentMessage.payload

    const response = {markdown: 'roundtrip text', facets: [] as EditorFacet[]}
    ContentBridge.onEditorMessage?.(
      {
        type: 'send-markdown-and-facets-to-native' as never,
        payload: {...response, messageId},
      },
      {} as never,
    )

    await expect(resultPromise).resolves.toEqual(response)
  })

  it('two concurrent requests resolve independently, matched by their own messageId', async () => {
    const sendBridgeMessage = jest.fn<void, [SentMessage]>()
    const instance = ContentBridge.extendEditorInstance?.(
      sendBridgeMessage,
      undefined,
      undefined,
      undefined,
      'ios',
    )
    const first = instance?.getMarkdownAndFacets()
    const second = instance?.getMarkdownAndFacets()
    const [firstId, secondId] = sendBridgeMessage.mock.calls.map(
      call => call[0].payload.messageId as string,
    )
    expect(firstId).not.toBe(secondId)

    ContentBridge.onEditorMessage?.(
      {
        type: 'send-markdown-and-facets-to-native' as never,
        payload: {markdown: 'second', facets: [], messageId: secondId},
      },
      {} as never,
    )
    ContentBridge.onEditorMessage?.(
      {
        type: 'send-markdown-and-facets-to-native' as never,
        payload: {markdown: 'first', facets: [], messageId: firstId},
      },
      {} as never,
    )

    await expect(first).resolves.toMatchObject({markdown: 'first'})
    await expect(second).resolves.toMatchObject({markdown: 'second'})
  })

  it('loadMarkdownAndFacets() sends a plain fire-and-forget message, no messageId, no pending promise', () => {
    const sendBridgeMessage = jest.fn<void, [SentMessage]>()
    const instance = ContentBridge.extendEditorInstance?.(
      sendBridgeMessage,
      undefined,
      undefined,
      undefined,
      'ios',
    )
    instance?.loadMarkdownAndFacets('hello', [])
    expect(sendBridgeMessage).toHaveBeenCalledWith({
      type: 'load-markdown-and-facets',
      payload: {markdown: 'hello', facets: []},
    })
  })
})

describe('ContentBridge.extendEditorState - wordCount/charCount', () => {
  it('computes word count and utf-8 byte length from editor.getText(), not the raw markdown string', () => {
    const mockEditor = {getText: () => 'hello world'}
    const state = ContentBridge.extendEditorState?.(mockEditor as never)
    expect(state).toEqual({wordCount: 2, charCount: 11})
  })

  it('counts multibyte characters by their utf-8 byte length, not their string length', () => {
    const mockEditor = {getText: () => 'مرحبا'}
    const state = ContentBridge.extendEditorState?.(mockEditor as never)
    expect(state?.wordCount).toBe(1)
    expect(state?.charCount).toBe(Buffer.byteLength('مرحبا', 'utf-8'))
    expect(state?.charCount).toBeGreaterThan('مرحبا'.length)
  })

  it('empty content is zero words, zero chars, not one', () => {
    const mockEditor = {getText: () => ''}
    const state = ContentBridge.extendEditorState?.(mockEditor as never)
    expect(state).toEqual({wordCount: 0, charCount: 0})
  })
})
