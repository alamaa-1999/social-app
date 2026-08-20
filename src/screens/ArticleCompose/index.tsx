import {useRef, useState} from 'react'
import {Pressable, TextInput, View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'
import {useQueryClient} from '@tanstack/react-query'

import {publishArticle} from '#/lib/api/articles'
import {uploadBlob} from '#/lib/api/upload-blob'
import {SUNNAHSKY_SERVICE} from '#/lib/constants'
import {useRequireStrikerForArticleAuthoring} from '#/lib/hooks/useRequireStrikerForArticleAuthoring'
import {openPicker} from '#/lib/media/picker'
import {
  type CommonNavigatorParams,
  type NativeStackScreenProps,
} from '#/lib/routes/types'
import {RQKEY, waitForArticleIndexed} from '#/state/queries/articles'
import {useAppviewClient, usePdsClient, useSession} from '#/state/session'
import {atoms as a, useBreakpoints, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import {TimesLarge_Stroke2_Corner0_Rounded as XIcon} from '#/components/icons/Times'
import * as Toast from '#/components/Toast'
import {Text} from '#/components/Typography'
import {type site} from '#/lexicons'
import {isAllowedColorValue} from './colorAllowlist'
import {Metadata, type MetadataValue} from './Metadata'
import {
  addFacet,
  type EditorState,
  facetsToWireFormat,
  getLineByteRange,
  insertLinePrefix,
  insertText,
  utf8Length,
  wrapSelection,
} from './state'
import {Toolbar} from './Toolbar'

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
export function ArticleCompose({onClose}: {onClose: () => void}) {
  const {_} = useLingui()
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  const pdsClient = usePdsClient()
  const appviewClient = useAppviewClient()
  const {currentAccount} = useSession()
  const queryClient = useQueryClient()
  const requireStriker = useRequireStrikerForArticleAuthoring()

  const [title, setTitle] = useState('')
  const [subtitle, setSubtitle] = useState('')
  const [editor, setEditor] = useState<EditorState>({
    markdown: '',
    facets: [],
  })
  const [metadata, setMetadata] = useState<MetadataValue>({
    author: '',
    translator: '',
    category: '',
    tags: '',
    contributors: [],
    hasCoverImage: false,
  })
  const [coverImage, setCoverImage] =
    useState<site.standard.document.Main['coverImage']>(undefined)
  const [isPublishing, setIsPublishing] = useState(false)

  const bodyInputRef = useRef<TextInput>(null)
  const selection = useRef({start: 0, end: 0})

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

  const onSetHeading = (level: 1 | 2 | 3 | undefined) => {
    const {byteStart} = utf16SelectionToByteRange(
      editor.markdown,
      selection.current.start,
      selection.current.start,
    )
    if (!level) return
    applyEdit(insertLinePrefix(editor, byteStart, '#'.repeat(level) + ' '))
  }

  const onInsertList = () => {
    const {byteStart} = utf16SelectionToByteRange(
      editor.markdown,
      selection.current.start,
      selection.current.start,
    )
    applyEdit(insertLinePrefix(editor, byteStart, '- '))
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
    setMetadata(m => ({...m, hasCoverImage: true}))
  }

  const doPublish = async () => {
    if (isPublishing || !title.trim() || !editor.markdown.trim()) return
    setIsPublishing(true)
    try {
      const {postUri} = await publishArticle({
        pdsClient,
        draft: {
          title: title.trim(),
          description: subtitle.trim() || title.trim(),
          markdown: editor.markdown,
          flavor: 'gfm',
          facets: facetsToWireFormat(editor.facets),
          tags: metadata.tags
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean),
          category: metadata.category.trim() || undefined,
          author: metadata.author.trim() || undefined,
          translator: metadata.translator.trim() || undefined,
          contributors: metadata.contributors,
          coverImage,
        },
      })
      Toast.show(
        _(
          msg`Article published! It may take a few seconds to appear on your profile.`,
        ),
        {type: 'success'},
      )
      // Best-effort: the AppView needs a moment to index the new companion
      // post before the Articles tab can resolve it (see
      // waitForArticleIndexed's doc comment). Not awaited - publish should
      // close immediately regardless of how long indexing takes.
      const did = currentAccount?.did
      if (did) {
        void waitForArticleIndexed(appviewClient, postUri).then(indexed => {
          if (indexed) {
            void queryClient.invalidateQueries({queryKey: RQKEY(did)})
          }
        })
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

  const content = (
    <View
      style={[
        a.flex_1,
        t.atoms.bg,
        gtMobile && [
          {width: 1000, maxWidth: '100%', height: 726},
          a.rounded_md,
          a.overflow_hidden,
        ],
      ]}>
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.justify_between,
          a.px_lg,
          a.py_md,
          a.border_b,
          t.atoms.border_contrast_low,
        ]}>
        <Button
          label={_(msg`Cancel`)}
          variant="ghost"
          color="secondary"
          size="small"
          onPress={onClose}>
          <ButtonText>
            <Trans>Cancel</Trans>
          </ButtonText>
        </Button>
        <Button
          label={_(msg`Publish`)}
          variant="solid"
          color="primary"
          size="small"
          disabled={isPublishing || !title.trim() || !editor.markdown.trim()}
          onPress={onPressPublish}>
          <ButtonText>
            {isPublishing ? (
              <Trans>Publishing...</Trans>
            ) : (
              <Trans>Publish</Trans>
            )}
          </ButtonText>
        </Button>
      </View>

      <Metadata
        value={metadata}
        onChange={setMetadata}
        onPressCoverImage={() => void onPressCoverImage()}
      />

      <View style={[a.flex_1, a.p_lg, a.gap_md]}>
        <Toolbar
          onToggleMark={onToggleMark}
          onToggleUnderline={onToggleUnderline}
          onSetHeading={onSetHeading}
          onInsertList={onInsertList}
          onSetAlign={onSetAlign}
          onSetColor={onSetColor}
          onInsertLink={onInsertLink}
          onInsertImage={() => void onInsertImage()}
        />

        <View
          style={[
            a.flex_1,
            a.border,
            a.rounded_md,
            t.atoms.border_contrast_low,
            a.p_lg,
            a.gap_md,
          ]}>
          <TextField.Root>
            <TextField.Input
              label={_(msg`Title`)}
              defaultValue={title}
              onChangeText={setTitle}
              style={[a.text_2xl, a.font_bold]}
            />
          </TextField.Root>
          <TextField.Root>
            <TextField.Input
              label={_(msg`Sub-title (optional)`)}
              defaultValue={subtitle}
              onChangeText={setSubtitle}
              style={[a.text_lg]}
            />
          </TextField.Root>
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
            placeholderTextColor={t.atoms.text_contrast_low.color}
            style={[
              a.flex_1,
              a.text_md,
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

  if (gtMobile) {
    return (
      <View
        style={[
          a.fixed,
          a.inset_0,
          a.align_center,
          a.justify_center,
          {backgroundColor: 'rgba(0,0,0,0.75)'},
          web({paddingTop: '50px' as unknown as number}),
        ]}>
        {content}
      </View>
    )
  }

  return (
    <View style={[a.absolute, a.inset_0, t.atoms.bg]}>
      {content}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={_(msg`Cancel`)}
        accessibilityHint=""
        onPress={onClose}
        style={[a.absolute, {top: 12, right: 12}, a.p_sm]}>
        <XIcon width={20} style={[t.atoms.text_contrast_medium]} />
      </Pressable>
    </View>
  )
}

/** `Stack.Screen` adapter - see the doc comment on `ArticleCompose` above. */
export function ArticleComposeScreen({
  navigation,
}: NativeStackScreenProps<CommonNavigatorParams, 'ArticleCompose'>) {
  return <ArticleCompose onClose={() => navigation.goBack()} />
}
