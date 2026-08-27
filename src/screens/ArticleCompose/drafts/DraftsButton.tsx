import {Pressable} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useTheme} from '#/alf'
import * as Dialog from '#/components/Dialog'
import * as Prompt from '#/components/Prompt'
import {Text} from '#/components/Typography'
import {DraftsListDialog} from './DraftsListDialog'
import {useSaveArticleDraftMutation} from './state/queries'
import {type ArticleDraftSummary} from './state/schema'

/**
 * Header "Drafts" link (Figma node 161:1621 - plain text, matching the
 * Cancel link's exact styling, not the post composer's `Button
 * variant="ghost"`). Otherwise mirrors the post composer's `DraftsButton`
 * shape exactly: pressing it with unsaved content opens a save-first
 * prompt before the drafts list, matching Cancel's own confirm flow.
 */
export function DraftsButton({
  onSelectDraft,
  onSaveDraft,
  onDiscard,
  getFreshHasContentAndIsDirty,
  isEditingDraft,
}: {
  onSelectDraft: (draft: ArticleDraftSummary) => void
  onSaveDraft: () => Promise<{success: boolean}>
  onDiscard: () => void
  /**
   * Pulls a fresh `{hasContent, isDirty}` read - via `editorBridge.
   * getTitleAndSubtitle()`, not the live-mirrored `title`/`subtitle` state -
   * right before `handlePress` decides. Title/Sub-title live in the WebView
   * now, mirrored to `index.tsx` on a debounced (~100ms) push for display
   * purposes only; this button is an RN control outside that WebView, with
   * no reliable way to blur-flush it first, so trusting the mirror directly
   * here would open the drafts list with no save prompt if pressed inside
   * that debounce window right after typing or pasting a title. See
   * `bridges/titleSubtitle.ts`'s own doc comment for the full reasoning -
   * `onPressCancel` in `index.tsx` has the identical fix, for the identical
   * reason.
   */
  getFreshHasContentAndIsDirty: () => Promise<{
    hasContent: boolean
    isDirty: boolean
  }>
  isEditingDraft: boolean
}) {
  const {_} = useLingui()
  const t = useTheme()
  const draftsDialogControl = Dialog.useDialogControl()
  const savePromptControl = Prompt.usePromptControl()
  const {isPending: isSaving} = useSaveArticleDraftMutation()

  const handlePress = async () => {
    const {hasContent, isDirty} = await getFreshHasContentAndIsDirty()
    if (!hasContent || (isEditingDraft && !isDirty)) {
      draftsDialogControl.open()
    } else {
      savePromptControl.open()
    }
  }

  const handleSaveAndOpen = async () => {
    const {success} = await onSaveDraft()
    if (success) {
      draftsDialogControl.open()
    }
  }

  const handleDiscardAndOpen = () => {
    onDiscard()
    draftsDialogControl.open()
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={_(msg`Drafts`)}
        accessibilityHint=""
        disabled={isSaving}
        onPress={() => void handlePress()}>
        <Text
          style={[
            {fontSize: 15, fontWeight: '500', color: t.palette.primary_600},
          ]}>
          <Trans>Drafts</Trans>
        </Text>
      </Pressable>

      <DraftsListDialog
        control={draftsDialogControl}
        onSelectDraft={onSelectDraft}
      />

      <Prompt.Outer control={savePromptControl}>
        <Prompt.Content>
          <Prompt.TitleText>
            {isEditingDraft ? (
              <Trans>Save changes?</Trans>
            ) : (
              <Trans>Save draft?</Trans>
            )}
          </Prompt.TitleText>
          <Prompt.DescriptionText>
            {isEditingDraft ? (
              <Trans>
                You have unsaved changes. Would you like to save them before
                viewing your drafts?
              </Trans>
            ) : (
              <Trans>
                Would you like to save this as a draft before viewing your
                drafts?
              </Trans>
            )}
          </Prompt.DescriptionText>
        </Prompt.Content>
        <Prompt.Actions>
          <Prompt.Action
            cta={isEditingDraft ? _(msg`Save changes`) : _(msg`Save draft`)}
            onPress={() => void handleSaveAndOpen()}
            color="primary"
          />
          <Prompt.Action
            cta={_(msg`Discard`)}
            onPress={handleDiscardAndOpen}
            color="negative_subtle"
          />
          <Prompt.Cancel cta={_(msg`Keep editing`)} />
        </Prompt.Actions>
      </Prompt.Outer>
    </>
  )
}
