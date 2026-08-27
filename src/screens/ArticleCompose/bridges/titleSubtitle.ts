import {BridgeExtension} from '@10play/tentap-editor'
import {Extension} from '@tiptap/core'

import {sendToNative} from '../editor-web/sendToNative'

/**
 * Title and Sub-title as two plain `<textarea>` elements living inside the
 * WebView, above `.ProseMirror` - not ProseMirror nodes, no rich-text
 * capability, no marks. Moved in from RN so the whole composer is one page
 * that can own its own `overflow: auto` scroll, instead of an outer RN
 * `ScrollView` trying to stay frame-synced with a separately-measured
 * WebView (`bridges/contentHeight.ts`, removed alongside this file, proved
 * that sync path has too many sharp edges to be worth it).
 *
 * Two separate signals travel web -> native, deliberately not one - "mirror
 * for hints, pull for decisions":
 *
 * - `Changed` is a debounced (100ms), fire-and-forget push on every `input`.
 *   `index.tsx` mirrors it into `title`/`subtitle` state for things that are
 *   fine being approximately fresh - the Publish button's visual appearance,
 *   a live "unsaved changes" indicator. It is never read for an actual
 *   decision: a dropped or out-of-order message would silently diverge from
 *   what is on screen, and nothing here would notice.
 * - `getTitleAndSubtitle()` is a request/response *pull*, shaped exactly
 *   like `content.ts`'s own `getMarkdownAndFacets()` (its own small
 *   `PendingRequests`, not a shared one - matching that file's own stated
 *   reason for not reusing TenTap's internal `asyncMessages`). Every
 *   consequential decision - `doPublish`, `doSaveDraft`, the Cancel path,
 *   the Drafts button's save-prompt-vs-direct-open choice - calls this and
 *   uses *its* result, never the mirrored state. This is why the body's own
 *   markdown was never at risk from a dropped message, and why title/
 *   subtitle now aren't either.
 *
 * `ActiveField` reports focus, and *only* focus - there is deliberately no
 * `blur` handler anywhere in this file. `Toolbar.tsx` already has real
 * focus-preservation logic (Radix's `DropdownMenu.Content` auto-focusing its
 * trigger on close, intercepted to keep the caret on the article; the same
 * again for `InsertHonorificPopover`), built because focus genuinely does
 * get stolen momentarily today. On web the WebView is an iframe, so opening
 * a toolbar popover moves DOM focus to a Radix element in the *parent*
 * document, which can fire a `blur` inside the iframe on whatever was last
 * focused there. Reporting blur-to-nothing as "left the body" would disable
 * the formatting toolbar the instant its own popover opens. Reporting only
 * affirmative focus onto one of the three known elements means losing focus
 * to anything outside that set simply sends nothing, and `activeField` stays
 * at whatever it last correctly was.
 */

export enum TitleSubtitleActionType {
  Set = 'title-subtitle-set',
  Get = 'title-subtitle-get',
  GetResponse = 'title-subtitle-get-response',
  Changed = 'title-subtitle-changed',
  ActiveField = 'title-subtitle-active-field',
}

export type ActiveField = 'title' | 'subtitle' | 'body'

type TitleAndSubtitle = {title: string; subtitle: string}

type TitleSubtitleMessage =
  | {type: TitleSubtitleActionType.Set; payload: TitleAndSubtitle}
  | {type: TitleSubtitleActionType.Get; payload: {messageId: string}}
  | {
      type: TitleSubtitleActionType.GetResponse
      payload: TitleAndSubtitle & {messageId: string}
    }
  | {type: TitleSubtitleActionType.Changed; payload: TitleAndSubtitle}
  | {type: TitleSubtitleActionType.ActiveField; payload: {field: ActiveField}}

type Listeners = {
  change?: (value: TitleAndSubtitle) => void
  activeField?: (field: ActiveField) => void
}

const listeners: Listeners = {}

/**
 * Registers the screen's handlers for both signals. Single-subscriber,
 * matching `subscribeToImageBlockEvents` - two composers are never mounted
 * at once.
 */
export function subscribeToTitleSubtitleEvents(next: Listeners): () => void {
  listeners.change = next.change
  listeners.activeField = next.activeField
  return () => {
    listeners.change = undefined
    listeners.activeField = undefined
  }
}

/** Mirrors `content.ts`'s own small `PendingRequests` - not shared, deliberately; see that file's doc comment for why. */
class PendingRequests {
  private resolvers: Record<string, (value: TitleAndSubtitle) => void> = {}

  resolve(messageId: string, value: TitleAndSubtitle) {
    this.resolvers[messageId]?.(value)
    delete this.resolvers[messageId]
  }

  wait(messageId: string): Promise<TitleAndSubtitle> {
    return new Promise(resolve => {
      this.resolvers[messageId] = resolve
    })
  }
}

const pendingRequests = new PendingRequests()

type TitleSubtitleEditorInstance = {
  /** Native -> web push. Used by `onClearComposer`/`onSelectDraft`. */
  setTitleAndSubtitle: (title: string, subtitle: string) => void
  /** Web -> native pull. The only source ever treated as authoritative. */
  getTitleAndSubtitle: () => Promise<TitleAndSubtitle>
}

declare module '@10play/tentap-editor' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface EditorBridge extends TitleSubtitleEditorInstance {}
}

/**
 * Matches `index.tsx`'s own (now-removed) `firstLineOnly` exactly, including
 * the exact behavior of truncating at the first break rather than joining
 * subsequent lines - Title/Sub-title publish as plain strings with no stated
 * tolerance for embedded breaks. Handles `\r\n`/`\r`/`\n` alike, since paste
 * sources don't agree on which they use.
 */
function firstLineOnly(text: string): {line: string; hasBreak: boolean} {
  const match = text.match(/\r\n|\r|\n/)
  if (!match || match.index === undefined) return {line: text, hasBreak: false}
  return {line: text.slice(0, match.index), hasBreak: true}
}

function autoGrow(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

let titleEl: HTMLTextAreaElement | null = null
let subtitleEl: HTMLTextAreaElement | null = null
let proseMirrorEl: HTMLElement | null = null

/**
 * A plain TipTap `Extension`, not a Node/Mark - Title/Sub-title are not part
 * of the ProseMirror document, so this only needs the `onCreate` lifecycle
 * hook to wire up the two `<textarea>` elements exactly once, at the point
 * the editor (and so the DOM around it) first exists. `extendEditorState`
 * (the mechanism `wordCount`/`charCount` use) only re-runs on a ProseMirror
 * transaction and would never fire for typing into an element outside the
 * document tree - this is why the two signals above travel as plain
 * messages instead.
 */
const titleSubtitleExtension = Extension.create({
  name: 'titleSubtitleFields',
  onCreate() {
    titleEl = document.getElementById(
      'article-title',
    ) as HTMLTextAreaElement | null
    subtitleEl = document.getElementById(
      'article-subtitle',
    ) as HTMLTextAreaElement | null
    proseMirrorEl = document.querySelector('.ProseMirror') as HTMLElement | null
    if (!titleEl || !subtitleEl) return

    const initial = (
      window as unknown as {
        initialContent?: {
          title?: string
          subtitle?: string
          titleLabel?: string
          titlePlaceholder?: string
          subtitleLabel?: string
          subtitlePlaceholder?: string
        }
      }
    ).initialContent
    if (initial) {
      titleEl.value = initial.title ?? ''
      subtitleEl.value = initial.subtitle ?? ''
      // Localized RN-side via Lingui and passed through here - this bundle
      // has no i18n runtime of its own, so it only ever renders what
      // arrives. Locale changes after the composer is already open won't
      // re-render these, the same limitation every other field carried
      // through `window.initialContent` already has.
      if (initial.titleLabel)
        titleEl.setAttribute('aria-label', initial.titleLabel)
      if (initial.titlePlaceholder)
        titleEl.placeholder = initial.titlePlaceholder
      if (initial.subtitleLabel)
        subtitleEl.setAttribute('aria-label', initial.subtitleLabel)
      if (initial.subtitlePlaceholder)
        subtitleEl.placeholder = initial.subtitlePlaceholder
    }
    autoGrow(titleEl)
    autoGrow(subtitleEl)

    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    const reportChange = () => {
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        sendToNative({
          type: TitleSubtitleActionType.Changed,
          payload: {
            title: titleEl?.value ?? '',
            subtitle: subtitleEl?.value ?? '',
          },
        })
      }, 100)
    }

    const wireField = (
      el: HTMLTextAreaElement,
      field: ActiveField,
      focusNext: () => void,
    ) => {
      el.addEventListener('input', () => {
        // Fires for typing and paste alike, matching how `onChangeText`
        // covered both on the RN version - a `keydown`-on-Enter-only
        // listener would miss a pasted multi-line string entirely, since
        // pasting fires no Enter keydown.
        const {line, hasBreak} = firstLineOnly(el.value)
        if (hasBreak) {
          el.value = line
          focusNext()
        }
        autoGrow(el)
        reportChange()
      })
      el.addEventListener('focus', () => {
        sendToNative({
          type: TitleSubtitleActionType.ActiveField,
          payload: {field},
        })
        keepFocusedFieldVisible()
      })
    }

    // `.ProseMirror`'s own 400px `min-height` (so an empty draft still has a
    // real writing area, and clicking below the last line still focuses it)
    // means its full bounding box is almost always taller than whatever's
    // left of the screen once the on-screen keyboard is up. Chrome's default
    // scroll-into-view-on-focus goes off that whole box, not the caret, so
    // it over-scrolls - past Title and Sub-title entirely - to bring the
    // box's top edge into view. Re-driven off `visualViewport`'s own
    // `resize`/`scroll` (not a one-shot check after `focus`) because the
    // keyboard's height isn't known yet at the moment focus fires - it
    // arrives progressively as the keyboard animates in, so this converges
    // to the right scroll position over those same events instead of
    // guessing a delay.
    const keepFocusedFieldVisible = () => {
      const active = document.activeElement
      if (
        !active ||
        (active !== titleEl &&
          active !== subtitleEl &&
          active !== proseMirrorEl)
      ) {
        return
      }
      const rect = getCaretRect(active)
      const visibleBottom = window.visualViewport?.height ?? window.innerHeight
      const margin = 8
      if (rect.top < margin) {
        window.scrollBy(0, rect.top - margin)
      } else if (rect.bottom > visibleBottom - margin) {
        window.scrollBy(0, rect.bottom - visibleBottom + margin)
      }
    }
    window.visualViewport?.addEventListener('resize', keepFocusedFieldVisible)
    window.visualViewport?.addEventListener('scroll', keepFocusedFieldVisible)

    wireField(titleEl, 'title', () => subtitleEl?.focus())
    wireField(subtitleEl, 'subtitle', () => proseMirrorEl?.focus())
    proseMirrorEl?.addEventListener('focus', () => {
      sendToNative({
        type: TitleSubtitleActionType.ActiveField,
        payload: {field: 'body'},
      })
      keepFocusedFieldVisible()
    })
  },
})

/**
 * The body's real caret position, not `.ProseMirror`'s own (400px-floor,
 * almost always much taller than the caret's actual line) bounding box - a
 * collapsed `Range` at an empty paragraph can report an all-zero rect, which
 * falls back to the element's own edge, still far closer to the truth than
 * the whole box. Title/Sub-title have no such gap: as single-line, auto-
 * growing `<textarea>`s their own bounding box already tracks their content.
 */
function getCaretRect(el: Element): {top: number; bottom: number} {
  if (el === proseMirrorEl) {
    const selection = window.getSelection()
    if (selection && selection.rangeCount > 0) {
      const rect = selection.getRangeAt(0).getBoundingClientRect()
      if (rect.width > 0 || rect.height > 0) return rect
    }
  }
  return el.getBoundingClientRect()
}

export const TitleSubtitleBridge = new BridgeExtension<
  unknown,
  TitleSubtitleEditorInstance,
  TitleSubtitleMessage
>({
  tiptapExtension: titleSubtitleExtension as never,

  onBridgeMessage: (_editor, message, sendMessageBack) => {
    switch (message.type) {
      case TitleSubtitleActionType.Set:
        if (titleEl) {
          titleEl.value = message.payload.title
          autoGrow(titleEl)
        }
        if (subtitleEl) {
          subtitleEl.value = message.payload.subtitle
          autoGrow(subtitleEl)
        }
        return true
      case TitleSubtitleActionType.Get:
        sendMessageBack({
          type: TitleSubtitleActionType.GetResponse,
          payload: {
            messageId: message.payload.messageId,
            title: titleEl?.value ?? '',
            subtitle: subtitleEl?.value ?? '',
          },
        })
        return false
      default:
        return false
    }
  },

  onEditorMessage: message => {
    switch (message.type) {
      case TitleSubtitleActionType.Changed:
        listeners.change?.(message.payload)
        return true
      case TitleSubtitleActionType.ActiveField:
        listeners.activeField?.(message.payload.field)
        return true
      case TitleSubtitleActionType.GetResponse:
        pendingRequests.resolve(message.payload.messageId, {
          title: message.payload.title,
          subtitle: message.payload.subtitle,
        })
        return true
      default:
        return false
    }
  },

  extendEditorInstance: sendBridgeMessage => {
    return {
      setTitleAndSubtitle: (title, subtitle) =>
        sendBridgeMessage({
          type: TitleSubtitleActionType.Set,
          payload: {title, subtitle},
        }),
      getTitleAndSubtitle: () => {
        const messageId = Math.random().toString(36).slice(2)
        const result = pendingRequests.wait(messageId)
        sendBridgeMessage({
          type: TitleSubtitleActionType.Get,
          payload: {messageId},
        })
        return result
      },
    }
  },
})
