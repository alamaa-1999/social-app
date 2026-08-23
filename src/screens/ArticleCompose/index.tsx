import {useRef, useState} from 'react'
import {Pressable, TextInput, View} from 'react-native'
import {type AtUriString} from '@atproto/syntax'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'
import {useQueryClient} from '@tanstack/react-query'

import {type ArticleEditRef, publishArticle} from '#/lib/api/articles'
import {uploadBlob} from '#/lib/api/upload-blob'
import {SUNNAHSKY_SERVICE} from '#/lib/constants'
import {useRequireStrikerForArticleAuthoring} from '#/lib/hooks/useRequireStrikerForArticleAuthoring'
import {openPicker} from '#/lib/media/picker'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
  type NavigationProp,
} from '#/lib/routes/types'
import {niceDate} from '#/lib/strings/time'
import {
  DOCUMENT_RQKEY,
  type LoadedArticleDocument,
  RQKEY,
  useArticleDocumentQuery,
  waitForArticleIndexed,
} from '#/state/queries/articles'
import {useAppviewClient, usePdsClient, useSession} from '#/state/session'
import {atoms as a, useBreakpoints, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {TimesLarge_Stroke2_Corner0_Rounded as XIcon} from '#/components/icons/Times'
import {Loader} from '#/components/Loader'
import {Portal} from '#/components/Portal'
import * as Prompt from '#/components/Prompt'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {IS_WEB} from '#/env'
import {type site} from '#/lexicons'
import {isAllowedColorValue} from './colorAllowlist'
import {DraftsButton} from './drafts/DraftsButton'
import {draftFacetsToEditorFacets} from './drafts/state/api'
import {
  useCleanupPublishedArticleDraftMutation,
  useSaveArticleDraftMutation,
} from './drafts/state/queries'
import {type ArticleDraftSummary} from './drafts/state/schema'
import {
  articleDocumentToComposeState,
  type EditingArticleState,
} from './loadedArticle'
import {Metadata, type MetadataValue} from './Metadata'
import {
  addFacet,
  byteSlice,
  detectParagraphStyle,
  type EditorState,
  facetsToWireFormat,
  getLineByteRange,
  insertLinePrefix,
  insertOrderedListPrefix,
  insertText,
  type ParagraphStyleId,
  utf8Length,
  wrapSelection,
} from './state'
import {RTL_MARK, Toolbar} from './Toolbar'

const encoder = new TextEncoder()

/** Maps a UTF-16 selection range (what `TextInput` reports) to UTF-8 byte offsets (what `state.ts` and the lexicon's facets use). */
function utf16SelectionToByteRange(
  markdown: string,
  start: number,
  end: number,
) {
  return {
    byteStart: encoder.encode(markdown.slice(0, start)).byteLength,
    byteEnd: encoder.encode(markdown.slice(0, end)).byteLength,
  }
}

/**
 * The article-authoring screen (`articles client ui plan.md` Phase 2). New
 * screen, not a composer extension - `Composer.tsx`'s reducer is shaped
 * entirely around post/thread/quote/reply semantics that don't apply here.
 * Desktop renders as a centered modal (matching the confirmed Figma design,
 * `58:4961`); mobile renders full-screen with an accordion metadata card
 * (`58:5153`/`58:5222`) - both share this same state and logic, only the
 * outer chrome differs.
 *
 * Self-contained - only needs an `onClose` callback. Registered as a plain
 * `Stack.Screen` (`ArticleComposeScreen` below adapts the two), mirroring
 * `StarterPackWizard`/`Wizard` rather than Composer's global-overlay
 * architecture - this component already draws its own full-bleed backdrop,
 * so it needs no extra screen-level chrome (`articles client ui plan.md`
 * Phase 3).
 */
export function ArticleCompose({
  onClose,
  initialArticle,
}: {
  onClose: () => void
  initialArticle?: LoadedArticleDocument
}) {
  const {_, i18n} = useLingui()
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  const pdsClient = usePdsClient()
  const appviewClient = useAppviewClient()
  const {currentAccount} = useSession()
  const queryClient = useQueryClient()
  const requireStriker = useRequireStrikerForArticleAuthoring()

  const [initial] = useState(() =>
    initialArticle
      ? articleDocumentToComposeState(initialArticle, {
          did: pdsClient.assertDid,
        })
      : undefined,
  )
  const [title, setTitle] = useState(initial?.title ?? '')
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? '')
  const [editor, setEditor] = useState<EditorState>(
    initial?.editor ?? {markdown: '', facets: []},
  )
  const [metadata, setMetadata] = useState<MetadataValue>(
    initial?.metadata ?? {
      authors: [],
      translators: [],
      categories: [],
      tags: [],
    },
  )
  const [coverImage, setCoverImage] = useState<
    site.standard.document.Main['coverImage']
  >(initial?.coverImage)
  const [coverImagePreviewUri, setCoverImagePreviewUri] = useState<
    string | undefined
  >(initial?.coverImagePreviewUri)
  const [flavor] = useState<'gfm' | 'commonmark'>(initial?.flavor ?? 'gfm')
  const [isPublishing, setIsPublishing] = useState(false)
  const [draftId, setDraftId] = useState<string | undefined>(undefined)
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | undefined>(
    undefined,
  )
  const [editingArticle, setEditingArticle] = useState<
    EditingArticleState | undefined
  >(initial?.editingArticle)

  const bodyInputRef = useRef<TextInput>(null)
  const selection = useRef({start: 0, end: 0})

  // Baseline-snapshot dirty tracking, not a reducer's per-action `isDirty`
  // flag like the post Composer's - there's no reducer here (plain
  // `useState` fields), and sprinkling `setIsDirty(true)` across every
  // handler is easy to miss one. Reset on mount, after a successful
  // save-to-draft, and after loading a selected draft.
  //
  // `snapshotOf` takes explicit values rather than closing over
  // title/subtitle/editor/metadata/coverImage directly, because the two
  // handlers below (`onClearComposer`/`onSelectDraft`) need to compute the
  // new baseline in the same synchronous call that calls `setTitle` etc. -
  // `setState` doesn't flush before the next line runs, so reading the
  // component's own state variables right after setting them would capture
  // the stale pre-update values, not what was just set.
  const snapshotOf = (v: {
    title: string
    subtitle: string
    markdown: string
    metadata: MetadataValue
    coverImage: site.standard.document.Main['coverImage']
  }) => JSON.stringify(v)
  const snapshot = () =>
    snapshotOf({
      title,
      subtitle,
      markdown: editor.markdown,
      metadata,
      coverImage,
    })
  const baselineRef = useRef(snapshot())
  const isDirty = snapshot() !== baselineRef.current

  const hasContent =
    !!title.trim() ||
    !!subtitle.trim() ||
    !!editor.markdown.trim() ||
    !!coverImage ||
    metadata.authors.length > 0 ||
    metadata.translators.length > 0 ||
    metadata.categories.length > 0 ||
    metadata.tags.length > 0

  const {mutateAsync: saveArticleDraft} = useSaveArticleDraftMutation()
  const {mutate: cleanupPublishedDraft} =
    useCleanupPublishedArticleDraftMutation()
  const discardPromptControl = Prompt.usePromptControl()
  const discardEditPromptControl = Prompt.usePromptControl()

  const applyEdit = (next: EditorState) => {
    setEditor(next)
  }

  const onToggleMark = (mark: 'bold' | 'italic' | 'strikethrough') => {
    const markers = {bold: '**', italic: '*', strikethrough: '~~'}[mark]
    const {byteStart, byteEnd} = utf16SelectionToByteRange(
      editor.markdown,
      selection.current.start,
      selection.current.end,
    )
    const result = wrapSelection(editor, byteStart, byteEnd, markers, markers)
    applyEdit(result.state)
  }

  const onToggleUnderline = () => {
    const {byteStart, byteEnd} = utf16SelectionToByteRange(
      editor.markdown,
      selection.current.start,
      selection.current.end,
    )
    if (byteStart === byteEnd) return
    applyEdit(
      addFacet(editor, byteStart, byteEnd, {
        $type: 'com.sunnahsky.richtext.facets.formatting#underline',
      }),
    )
  }

  const onSetColor = (hex: string) => {
    // Finding 20 enforcement point: the toolbar's own menu only ever offers
    // PRESET_COLORS, which already passes this trivially, but that's the
    // caller being well-behaved, not a structural guarantee. This is the
    // one place a #color.value actually gets constructed, so the allowlist
    // has to live here, not upstream - any future caller (a free-text color
    // input, say) is protected for free instead of having to remember to
    // re-check.
    if (!isAllowedColorValue(hex)) return
    const {byteStart, byteEnd} = utf16SelectionToByteRange(
      editor.markdown,
      selection.current.start,
      selection.current.end,
    )
    if (byteStart === byteEnd) return
    applyEdit(
      addFacet(editor, byteStart, byteEnd, {
        $type: 'com.sunnahsky.richtext.facets.formatting#color',
        value: hex,
      }),
    )
  }

  const onSetAlign = (align: 'left' | 'center' | 'right' | 'justify') => {
    const {byteStart} = utf16SelectionToByteRange(
      editor.markdown,
      selection.current.start,
      selection.current.start,
    )
    const line = getLineByteRange(editor.markdown, byteStart)
    applyEdit(
      addFacet(editor, line.byteStart, line.byteEnd, {
        $type: 'com.sunnahsky.richtext.facets.blocks#textAlign',
        value: align,
      }),
    )
  }

  const onInsertList = () => {
    const {byteStart} = utf16SelectionToByteRange(
      editor.markdown,
      selection.current.start,
      selection.current.start,
    )
    applyEdit(insertLinePrefix(editor, byteStart, '- '))
  }

  /**
   * The 9-option Paragraph-style dropdown (Title/Sub-Heading 1/Sub-Heading
   * 2/Paragraph/Arabic Paragraph/Block Quote/Arabic Block Quote/Bulleted
   * List/Numbered List). Arabic Block Quote composes two operations against
   * the SAME `EditorState` value in one synchronous call, not two separate
   * `setEditor` updates - per the security review's explicit ordering
   * requirement, the `>` prefix must be inserted first, then the typography
   * facet's byte range computed against the now-shifted line. Splitting this
   * into two separate handlers/state updates would read stale
   * pre-prefix `editor.markdown` for the facet computation (React state
   * updates aren't synchronously visible in the same tick).
   */
  const onSelectParagraphStyle = (style: ParagraphStyleId) => {
    const {byteStart} = utf16SelectionToByteRange(
      editor.markdown,
      selection.current.start,
      selection.current.start,
    )
    switch (style) {
      case 'title':
        applyEdit(insertLinePrefix(editor, byteStart, '# '))
        return
      case 'subheading1':
        applyEdit(insertLinePrefix(editor, byteStart, '## '))
        return
      case 'subheading2':
        applyEdit(insertLinePrefix(editor, byteStart, '### '))
        return
      case 'paragraph':
        return
      case 'arabicParagraph': {
        const line = getLineByteRange(editor.markdown, byteStart)
        applyEdit(
          addFacet(editor, line.byteStart, line.byteEnd, {
            $type: 'com.sunnahsky.richtext.facets.blocks#typography',
            value: 'arabicParagraph',
          }),
        )
        return
      }
      case 'blockQuote':
        applyEdit(insertLinePrefix(editor, byteStart, '> '))
        return
      case 'arabicBlockQuote': {
        const withPrefix = insertLinePrefix(editor, byteStart, '> ')
        const line = getLineByteRange(withPrefix.markdown, byteStart)
        applyEdit(
          addFacet(withPrefix, line.byteStart, line.byteEnd, {
            $type: 'com.sunnahsky.richtext.facets.blocks#typography',
            value: 'arabicQuote',
          }),
        )
        return
      }
      case 'bulletedList':
        applyEdit(insertLinePrefix(editor, byteStart, '- '))
        return
      case 'numberedList':
        applyEdit(insertOrderedListPrefix(editor, byteStart))
        return
    }
  }

  const onInsertHonorific = (codepoint: number) => {
    const {byteStart} = utf16SelectionToByteRange(
      editor.markdown,
      selection.current.start,
      selection.current.start,
    )
    const inserted = String.fromCodePoint(codepoint) + RTL_MARK
    const next = insertText(editor, byteStart, inserted)
    applyEdit(next)
    // The popover closes right after this (see onRequestBodyFocus below),
    // and Radix returns focus to the trigger by default rather than the
    // body input - `selection.current` is what onRequestBodyFocus restores
    // the caret to, so it has to land on the new post-insert position, not
    // wherever it was before the honorific went in.
    const newByteIndex = byteStart + utf8Length(inserted)
    const newCharIndex = byteSlice(next.markdown, 0, newByteIndex).length
    selection.current = {start: newCharIndex, end: newCharIndex}
  }

  const onInsertLink = () => {
    const {byteStart, byteEnd} = utf16SelectionToByteRange(
      editor.markdown,
      selection.current.start,
      selection.current.end,
    )
    if (byteStart === byteEnd) {
      applyEdit(insertText(editor, byteStart, '[link text](https://)'))
    } else {
      const result = wrapSelection(
        editor,
        byteStart,
        byteEnd,
        '[',
        '](https://)',
      )
      applyEdit(result.state)
    }
  }

  const onInsertImage = async () => {
    const images = await openPicker({selectionLimit: 1})
    const image = images[0]
    if (!image) return
    const {blob} = await uploadBlob(pdsClient, image.path, image.mime)
    const {byteStart} = utf16SelectionToByteRange(
      editor.markdown,
      selection.current.start,
      selection.current.start,
    )
    // com.atproto.sync.getBlob is a standard, unauthenticated atproto
    // endpoint (did+cid, both required) - a real, spec-compliant blob URL,
    // not a workaround. BlobRef is a union (current TypedBlobRef vs. the
    // legacy string-cid shape) - a freshly uploaded blob is always the
    // former, but narrow properly rather than assuming.
    const cid = 'ref' in blob ? blob.ref.toString() : blob.cid
    const url = `${SUNNAHSKY_SERVICE}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(pdsClient.assertDid)}&cid=${encodeURIComponent(cid)}`
    applyEdit(insertText(editor, byteStart, `![image](${url})`))
  }

  const onPressCoverImage = async () => {
    const images = await openPicker({selectionLimit: 1})
    const image = images[0]
    if (!image) return
    const {blob} = await uploadBlob(pdsClient, image.path, image.mime)
    setCoverImage(blob)
    setCoverImagePreviewUri(image.path)
  }

  const doSaveDraft = async (): Promise<{success: boolean}> => {
    try {
      const {draftId: savedId} = await saveArticleDraft({
        state: {
          title,
          subtitle,
          markdown: editor.markdown,
          facets: editor.facets,
          metadata,
          coverImage,
        },
        existingDraftId: draftId,
      })
      setDraftId(savedId)
      setDraftUpdatedAt(new Date().toISOString())
      baselineRef.current = snapshot()
      return {success: true}
    } catch {
      Toast.show(_(msg`Couldn't save draft. Please try again.`), {
        type: 'error',
      })
      return {success: false}
    }
  }

  // Clears in-progress content back to a fresh empty draft, without closing
  // the screen - used by the header Drafts button's "Discard" path (Cancel's
  // own "Discard" instead closes the screen entirely, via onClose).
  const onClearComposer = () => {
    const empty = {
      title: '',
      subtitle: '',
      markdown: '',
      metadata: {authors: [], translators: [], categories: [], tags: []},
      coverImage: undefined,
    }
    setTitle(empty.title)
    setSubtitle(empty.subtitle)
    setEditor({markdown: empty.markdown, facets: []})
    setMetadata(empty.metadata)
    setCoverImage(empty.coverImage)
    setCoverImagePreviewUri(undefined)
    setDraftId(undefined)
    setDraftUpdatedAt(undefined)
    // Defense-in-depth, not reachable in practice today - the Drafts UI
    // this is called from only renders when `!hasContent`, which is never
    // true while editing a published article.
    setEditingArticle(undefined)
    baselineRef.current = snapshotOf(empty)
  }

  const onSelectDraft = (summary: ArticleDraftSummary) => {
    const {draft} = summary
    const next = {
      title: draft.title ?? '',
      subtitle: draft.description ?? '',
      markdown: draft.markdown ?? '',
      metadata: {
        authors: draft.authors ?? [],
        translators: draft.translators ?? [],
        categories: draft.categories ?? [],
        tags: draft.tags ?? [],
      },
      coverImage: draft.coverImage,
    }
    setTitle(next.title)
    setSubtitle(next.subtitle)
    setEditor({
      markdown: next.markdown,
      facets: draftFacetsToEditorFacets(draft.facets),
    })
    setMetadata(next.metadata)
    setCoverImage(next.coverImage)
    if (next.coverImage) {
      const cid =
        'ref' in next.coverImage
          ? next.coverImage.ref.toString()
          : next.coverImage.cid
      setCoverImagePreviewUri(
        `${SUNNAHSKY_SERVICE}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(pdsClient.assertDid)}&cid=${encodeURIComponent(cid)}`,
      )
    } else {
      setCoverImagePreviewUri(undefined)
    }
    setDraftId(summary.id)
    setDraftUpdatedAt(summary.updatedAt)
    // Defense-in-depth, not reachable in practice today - see the matching
    // note in `onClearComposer`.
    setEditingArticle(undefined)
    baselineRef.current = snapshotOf(next)
  }

  const onPressCancel = () => {
    if (editingArticle) {
      if (isDirty) {
        discardEditPromptControl.open()
      } else {
        onClose()
      }
      return
    }
    if (hasContent && (!draftId || isDirty)) {
      discardPromptControl.open()
    } else {
      onClose()
    }
  }

  const doPublish = async () => {
    if (isPublishing || !title.trim() || !editor.markdown.trim()) return
    if (editingArticle && !isDirty) return
    setIsPublishing(true)
    try {
      const editing: ArticleEditRef | undefined = editingArticle
        ? {
            documentUri: editingArticle.uri,
            documentRkey: editingArticle.rkey,
            documentCid: editingArticle.cid,
            publishedAt: editingArticle.publishedAt,
            postUri: editingArticle.postUri,
            postRkey: editingArticle.postRkey,
          }
        : undefined
      const {postUri, documentUri} = await publishArticle({
        pdsClient,
        draft: {
          title: title.trim(),
          description: subtitle.trim() || title.trim(),
          markdown: editor.markdown,
          flavor,
          facets: facetsToWireFormat(editor.facets),
          tags: metadata.tags,
          categories: metadata.categories.length
            ? metadata.categories
            : undefined,
          authors: metadata.authors.length ? metadata.authors : undefined,
          translators: metadata.translators.length
            ? metadata.translators
            : undefined,
          contributors: [],
          coverImage,
        },
        editing,
      })
      Toast.show(
        editingArticle
          ? _(msg`Article updated!`)
          : _(
              msg`Article published! It may take a few seconds to appear on your profile.`,
            ),
        {type: 'success'},
      )
      const did = currentAccount?.did
      if (did) {
        if (editingArticle) {
          void queryClient.invalidateQueries({queryKey: RQKEY(did)})
          void queryClient.invalidateQueries({
            queryKey: DOCUMENT_RQKEY(documentUri),
          })
        } else {
          // Best-effort: the AppView needs a moment to index the new
          // companion post before the Articles tab can resolve it (see
          // waitForArticleIndexed's doc comment). Not awaited - publish
          // should close immediately regardless of how long indexing takes.
          void waitForArticleIndexed(appviewClient, postUri).then(indexed => {
            if (indexed) {
              void queryClient.invalidateQueries({queryKey: RQKEY(did)})
            }
          })
        }
      }
      // Best-effort cleanup, matching the post Composer's own post-publish
      // draft cleanup - the article already published successfully, so a
      // failure here is logged, not surfaced (see the mutation's onError).
      // Unchanged by the edit-published-article mode: `draftId` and
      // `editingArticle` are mutually exclusive by construction, since the
      // Drafts UI is only reachable when `!hasContent`, never true here.
      if (draftId) {
        cleanupPublishedDraft({draftId})
      }
      onClose()
    } finally {
      setIsPublishing(false)
    }
  }
  const onPressPublish = requireStriker(() => void doPublish())

  const wordCount = editor.markdown.trim()
    ? editor.markdown.trim().split(/\s+/).length
    : 0
  const charCount = utf8Length(editor.markdown)
  // Approximation, not a fully live indicator - `selection` is a ref, not
  // React state (deliberately, to avoid re-rendering on every cursor move),
  // so this reflects the cursor's line as of the last edit, not necessarily
  // its position after a plain arrow-key/click move with no edit. See
  // `detectParagraphStyle`'s own doc comment in state.ts.
  const activeParagraphStyle = detectParagraphStyle(
    editor.markdown,
    editor.facets,
    utf16SelectionToByteRange(
      editor.markdown,
      selection.current.start,
      selection.current.start,
    ).byteStart,
  )

  // Never "Save and close" while editing a published article - there's
  // deliberately no save-progress-without-publishing path for that mode
  // (see the plan's Context section), so the label would be misleading.
  const closeLabel =
    isDirty && !editingArticle ? _(msg`Save and close`) : _(msg`Close`)

  const content = (
    <View
      style={[
        a.flex_1,
        t.atoms.bg,
        gtMobile && [
          {
            width: 1000,
            maxWidth: '100%',
            height: '85%',
            minHeight: 480,
            maxHeight: 900,
          },
          a.rounded_md,
          a.overflow_hidden,
        ],
      ]}>
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.justify_between,
          {paddingHorizontal: 18, paddingVertical: 12},
          a.border_b,
          t.atoms.border_contrast_low,
        ]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          accessibilityHint=""
          onPress={onPressCancel}>
          <Text
            style={[a.text_md, a.font_medium, {color: t.palette.primary_600}]}>
            {closeLabel}
          </Text>
        </Pressable>
        <View style={[a.flex_row, a.align_center, {gap: 18}]}>
          {!hasContent ? (
            <DraftsButton
              onSelectDraft={onSelectDraft}
              onSaveDraft={doSaveDraft}
              onDiscard={onClearComposer}
              hasContent={hasContent}
              isDirty={isDirty}
              isEditingDraft={!!draftId}
            />
          ) : editingArticle ? (
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              <Trans>
                Published on{' '}
                {niceDate(i18n, editingArticle.publishedAt, 'medium', 'none')}.
              </Trans>
              {editingArticle.updatedAt && (
                <Trans>
                  {' '}
                  Last Modified:{' '}
                  {niceDate(i18n, editingArticle.updatedAt, 'medium', 'none')}.
                </Trans>
              )}
              {isDirty && <Trans> • Unsaved edits.</Trans>}
            </Text>
          ) : draftId && !isDirty ? (
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              <Trans>
                Draft saved{' '}
                {niceDate(
                  i18n,
                  draftUpdatedAt ?? new Date().toISOString(),
                  'medium',
                  'none',
                )}
                .
              </Trans>
            </Text>
          ) : (
            <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
              <Trans>Unsaved draft.</Trans>
            </Text>
          )}
          <Button
            label={editingArticle ? _(msg`Update`) : _(msg`Publish`)}
            variant="solid"
            color="primary"
            size="small"
            disabled={
              isPublishing ||
              !title.trim() ||
              !editor.markdown.trim() ||
              (!!editingArticle && !isDirty)
            }
            onPress={onPressPublish}>
            <ButtonText>
              {isPublishing ? (
                editingArticle ? (
                  <Trans>Updating...</Trans>
                ) : (
                  <Trans>Publishing...</Trans>
                )
              ) : editingArticle ? (
                <Trans>Update</Trans>
              ) : (
                <Trans>Publish</Trans>
              )}
            </ButtonText>
          </Button>
        </View>
      </View>

      <Prompt.Outer control={discardPromptControl}>
        <Prompt.Content>
          <Prompt.TitleText>
            {draftId ? (
              <Trans>Save changes?</Trans>
            ) : (
              <Trans>Save draft?</Trans>
            )}
          </Prompt.TitleText>
          <Prompt.DescriptionText>
            {draftId ? (
              <Trans>
                You have unsaved changes to this draft, would you like to save
                them?
              </Trans>
            ) : (
              <Trans>
                Would you like to save this as a draft to edit later?
              </Trans>
            )}
          </Prompt.DescriptionText>
        </Prompt.Content>
        <Prompt.Actions>
          <Prompt.Action
            cta={draftId ? _(msg`Save changes`) : _(msg`Save draft`)}
            onPress={() =>
              void doSaveDraft().then(({success}) => {
                if (success) onClose()
              })
            }
            color="primary"
          />
          <Prompt.Action
            cta={_(msg`Discard`)}
            onPress={onClose}
            color="negative_subtle"
          />
          <Prompt.Cancel cta={_(msg`Keep editing`)} />
        </Prompt.Actions>
      </Prompt.Outer>

      <Prompt.Basic
        control={discardEditPromptControl}
        title={_(msg`Discard changes?`)}
        description={_(
          msg`You have unsaved edits to this article. If you close now, they will be lost.`,
        )}
        onConfirm={onClose}
        confirmButtonCta={_(msg`Discard`)}
        confirmButtonColor="negative"
        cancelButtonCta={_(msg`Keep editing`)}
      />

      <Metadata
        value={metadata}
        onChange={setMetadata}
        coverImagePreviewUri={coverImagePreviewUri}
        onPressCoverImage={() => void onPressCoverImage()}
      />

      <View style={[a.flex_1, {padding: 18}, a.gap_md]}>
        <Toolbar
          onToggleMark={onToggleMark}
          onToggleUnderline={onToggleUnderline}
          activeParagraphStyle={activeParagraphStyle}
          onSelectParagraphStyle={onSelectParagraphStyle}
          onInsertList={onInsertList}
          onSetAlign={onSetAlign}
          onSetColor={onSetColor}
          onInsertHonorific={onInsertHonorific}
          onRequestBodyFocus={() => {
            bodyInputRef.current?.focus()
            // Restores the caret to wherever `selection.current` says it
            // should be - the post-insert position if a glyph was just
            // clicked (see onInsertHonorific), or the untouched original
            // position if the popover was dismissed without inserting
            // anything (selection.current was never written in that case).
            // react-native-web's TextInput doesn't implement RN's
            // `.setSelection()` at runtime (a real gap the TS types don't
            // catch) - the underlying DOM node's own `.setSelectionRange()`
            // is the actual web equivalent.
            if (IS_WEB) {
              ;(
                bodyInputRef.current as unknown as HTMLTextAreaElement | null
              )?.setSelectionRange?.(
                selection.current.start,
                selection.current.end,
              )
            } else {
              bodyInputRef.current?.setSelection(
                selection.current.start,
                selection.current.end,
              )
            }
          }}
          onInsertLink={onInsertLink}
          onInsertImage={() => void onInsertImage()}
        />

        <View
          style={[
            a.flex_1,
            a.border,
            a.rounded_md,
            t.atoms.border_contrast_low,
            {padding: 20, gap: 16},
          ]}>
          {/*
           * Plain TextInput, not TextField.Input, for all three fields -
           * Figma shows Title/Sub-title/Body as borderless typography with
           * no input-box chrome, matching Body's existing pattern exactly
           * (confirmed by auditing TextField.tsx: neither field uses
           * isInvalid, so no chrome/validation feature is lost by skipping
           * it - see `articles client ui plan.md`/the ArticleCompose Figma
           * plan for the full audit). TextField.Input's fontFamily is also
           * unconditionally overwritten by applyFonts(), which would
           * silently clobber the custom article fonts below.
           */}
          {/* Own nested group with a tighter 12px gap (space-lg) - the
          outer 16px gap (space-lg... the OTHER space-lg, Figma's two
          differently-scoped spacing tokens) is between this group and Body. */}
          <View style={[{gap: 12}]}>
            <TextInput
              accessibilityLabel={_(msg`Title`)}
              accessibilityHint=""
              defaultValue={title}
              onChangeText={setTitle}
              placeholder={_(msg`Article title...`)}
              placeholderTextColor={t.palette.contrast_500}
              style={[
                {
                  // Baked into the static instance's own name table, not
                  // "Fraunces" + fontWeight - see assets/fonts/fraunces/README.md.
                  fontFamily: 'Fraunces SemiBold',
                  fontSize: 32,
                  lineHeight: 32 * 1.15,
                  padding: 0,
                  margin: 0,
                },
                t.atoms.text,
              ]}
            />
            <TextInput
              accessibilityLabel={_(msg`Sub-title`)}
              accessibilityHint=""
              defaultValue={subtitle}
              onChangeText={setSubtitle}
              placeholder={_(msg`Sub-title (optional)...`)}
              placeholderTextColor={t.palette.contrast_500}
              style={[
                {
                  fontFamily: 'Archivo SemiBold',
                  fontSize: 24,
                  lineHeight: 24 * 1.2,
                  padding: 0,
                  margin: 0,
                },
                t.atoms.text,
              ]}
            />
          </View>
          <TextInput
            accessibilityLabel={_(msg`Article body`)}
            accessibilityHint=""
            ref={bodyInputRef}
            multiline
            value={editor.markdown}
            onChangeText={text => setEditor(e => ({...e, markdown: text}))}
            onSelectionChange={evt => {
              selection.current = evt.nativeEvent.selection
            }}
            placeholder={_(msg`Write your article...`)}
            placeholderTextColor={t.palette.contrast_500}
            style={[
              a.flex_1,
              {
                fontFamily: 'Vollkorn',
                fontSize: 18,
                lineHeight: 18 * 1.65,
                padding: 0,
                margin: 0,
              },
              t.atoms.text,
              {textAlignVertical: 'top'},
            ]}
          />
        </View>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          <Trans>
            Word count: {wordCount} • Character count: {charCount}
          </Trans>
        </Text>
      </View>
    </View>
  )

  return (
    <ComposerOverlay onPressCancel={onPressCancel}>{content}</ComposerOverlay>
  )
}

/**
 * Shared full-bleed backdrop/Portal chrome for `ArticleCompose` - desktop
 * centered modal vs. mobile full-screen, per the confirmed Figma design.
 * Extracted so `ArticleEditLoadingGate` below can share the exact same
 * chrome instead of duplicating it, rather than rendering unstyled while an
 * article loads.
 */
function ComposerOverlay({
  children,
  onPressCancel,
}: {
  children: React.ReactNode
  onPressCancel?: () => void
}) {
  const {_} = useLingui()
  const t = useTheme()
  const {gtMobile} = useBreakpoints()

  if (gtMobile) {
    return (
      <Portal>
        <View
          style={[
            a.fixed,
            a.inset_0,
            // No explicit z-index, deliberately - this wrapper and any
            // Dialog.Outer/Prompt.Outer opened from within it (e.g.
            // DraftsListDialog) render as siblings through the same shared
            // Portal/Outlet. Dialog.Outer's own outer wrapper computes to an
            // *explicit* z-index:0 (not auto), which creates its own
            // stacking context - meaning ANY explicit z-index here, even a
            // small one, would always out-rank it regardless of DOM order,
            // trapping the dialog's real z-index (10) inside a losing
            // sibling subtree where it's never actually compared. Leaving
            // this at the implicit z-index:auto lets normal DOM order decide
            // instead: a dialog opened later mounts later in the DOM and
            // correctly wins, the same mechanism that already makes stacked
            // dialogs work everywhere else in the app. Still reliably paints
            // above the base app screen behind it - `position: fixed` alone
            // is enough for that, since the base screen isn't independently
            // positioned/z-indexed to begin with.
            a.align_center,
            a.justify_center,
            {backgroundColor: 'rgba(0,0,0,0.75)'},
            web({
              paddingTop: '50px' as unknown as number,
              paddingBottom: '50px' as unknown as number,
            }),
          ]}>
          {children}
        </View>
      </Portal>
    )
  }

  return (
    <Portal>
      <View style={[a.absolute, a.inset_0, t.atoms.bg]}>
        {children}
        {onPressCancel && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={_(msg`Cancel`)}
            accessibilityHint=""
            onPress={onPressCancel}
            style={[a.absolute, {top: 12, right: 12}, a.p_sm]}>
            <XIcon width={20} style={[t.atoms.text_contrast_medium]} />
          </Pressable>
        )}
      </View>
    </Portal>
  )
}

/**
 * `Stack.Screen` adapter - see the doc comment on `ArticleCompose` above.
 * Shared between `ArticleCompose` (create) and `ArticleEdit` (edit an
 * already-published article) - mirrors `StarterPackWizard`/`StarterPackEdit`
 * sharing `Wizard`. `rkey` is only ever present for the edit route; the
 * document URI it derives always uses the *current signed-in account's own*
 * DID, never anything route-suppliable, so this can never load another
 * account's article regardless of what `rkey` a deep link supplies.
 */
export function ArticleComposeScreen({
  route,
}: NativeStackScreenProps<
  CommonNavigatorParams,
  'ArticleCompose' | 'ArticleEdit'
>) {
  // `useNavigation<NavigationProp>()`, not the screen's own narrower
  // `navigation` prop - mirrors `Layout.Header.BackButton`'s `onPressBack`
  // exactly, which needs the app-wide route union (including `Home`) that
  // the stack-scoped prop type doesn't expose.
  const navigation = useNavigation<NavigationProp>()
  const {currentAccount} = useSession()
  const params = route.params ?? {}
  const rkey: string | undefined =
    'rkey' in params && typeof params.rkey === 'string'
      ? params.rkey
      : undefined
  const uri: AtUriString | undefined = rkey
    ? `at://${currentAccount!.did}/site.standard.document/${rkey}`
    : undefined
  const {
    data: initialArticle,
    isLoading,
    isError,
    refetch,
  } = useArticleDocumentQuery(uri)

  const onClose = () => {
    // `goBack()` silently no-ops if there's nothing in history to pop
    // (e.g. a direct URL load/refresh). Unlike `BackButton`'s fallback,
    // this uses `replace` rather than `navigate`: on a cold direct-URL
    // load, Home isn't in `state.routes` yet, so `navigate('Home')`
    // would *push* it on top instead of jumping to an existing entry -
    // leaving this route's own entry (and therefore its still-mounted,
    // still-visible component, per the LRU mount-caching in
    // `createNativeStackNavigatorWithAuth`) sitting right underneath.
    // `replace` removes this route from the stack outright, so it
    // actually unmounts instead of lingering as a phantom "back"
    // target for the next Cancel press.
    if (navigation.canGoBack()) {
      navigation.goBack()
    } else {
      navigation.replace('Home')
    }
  }

  if (rkey && (isLoading || (!initialArticle && !isError))) {
    return (
      <ArticleEditLoadingGate
        isError={false}
        onClose={onClose}
        onRetry={() => void refetch()}
      />
    )
  }
  if (rkey && (isError || !initialArticle)) {
    return (
      <ArticleEditLoadingGate
        isError
        onClose={onClose}
        onRetry={() => void refetch()}
      />
    )
  }

  return <ArticleCompose onClose={onClose} initialArticle={initialArticle} />
}

function ArticleEditLoadingGate({
  isError,
  onClose,
  onRetry,
}: {
  isError: boolean
  onClose: () => void
  onRetry: () => void
}) {
  const {_} = useLingui()
  const t = useTheme()
  return (
    <ComposerOverlay onPressCancel={onClose}>
      <View
        style={[
          a.flex_1,
          a.align_center,
          a.justify_center,
          t.atoms.bg,
          {gap: 16},
        ]}>
        {isError ? (
          <>
            <Text
              style={[a.text_md, a.text_center, t.atoms.text_contrast_medium]}>
              <Trans>Couldn't load this article.</Trans>
            </Text>
            <Button
              label={_(msg`Retry`)}
              variant="solid"
              color="primary"
              size="small"
              onPress={onRetry}>
              <ButtonText>
                <Trans>Retry</Trans>
              </ButtonText>
            </Button>
          </>
        ) : (
          <Loader size="xl" />
        )}
      </View>
    </ComposerOverlay>
  )
}
