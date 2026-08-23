import {useCallback, useMemo} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {atoms as a, select, useBreakpoints, useTheme, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as Dialog from '#/components/Dialog'
import {PageX_Stroke2_Corner0_Rounded_Large as PageXIcon} from '#/components/icons/PageX'
import {ListFooter} from '#/components/Lists'
import {Loader} from '#/components/Loader'
import {Text} from '#/components/Typography'
import {IS_NATIVE} from '#/env'
import {ArticleDraftItem} from './ArticleDraftItem'
import {draftViewToArticleSummary} from './state/api'
import {
  useArticleDraftsQuery,
  useDeleteArticleDraftMutation,
} from './state/queries'
import {type ArticleDraftSummary} from './state/schema'

export function DraftsListDialog({
  control,
  onSelectDraft,
}: {
  control: Dialog.DialogControlProps
  onSelectDraft: (draft: ArticleDraftSummary) => void
}) {
  const {_} = useLingui()
  const t = useTheme()
  const {gtPhone} = useBreakpoints()
  const {data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage} =
    useArticleDraftsQuery()
  const {mutate: deleteDraft} = useDeleteArticleDraftMutation()

  const drafts = useMemo(
    () =>
      data?.pages.flatMap(page => page.drafts.map(draftViewToArticleSummary)) ??
      [],
    [data],
  )

  const handleSelectDraft = useCallback(
    (summary: ArticleDraftSummary) => {
      control.close(() => {
        onSelectDraft(summary)
      })
    },
    [control, onSelectDraft],
  )

  const handleDeleteDraft = useCallback(
    (draftSummary: ArticleDraftSummary) => {
      deleteDraft({draftId: draftSummary.id})
    },
    [deleteDraft],
  )

  const backButton = useCallback(
    () => (
      <Button
        label={_(msg`Back`)}
        onPress={() => control.close()}
        size="small"
        color="primary"
        variant="ghost">
        <ButtonText style={[a.text_md]}>
          <Trans>Back</Trans>
        </ButtonText>
      </Button>
    ),
    [control, _],
  )

  const renderItem = useCallback(
    ({item}: {item: ArticleDraftSummary}) => {
      return (
        <View style={[gtPhone ? [a.px_md, a.pt_md] : [a.px_sm, a.pt_sm]]}>
          <ArticleDraftItem
            draft={item}
            onSelect={handleSelectDraft}
            onDelete={handleDeleteDraft}
          />
        </View>
      )
    },
    [handleSelectDraft, handleDeleteDraft, gtPhone],
  )

  const header = useMemo(
    () => (
      <Dialog.Header renderLeft={backButton}>
        <Dialog.HeaderText>
          <Trans>Drafts</Trans>
        </Dialog.HeaderText>
      </Dialog.Header>
    ),
    [backButton],
  )

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      void fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage])

  const emptyComponent = useMemo(() => {
    if (isLoading) {
      return (
        <View style={[a.py_xl, a.align_center]}>
          <Loader size="lg" />
        </View>
      )
    }
    return (
      <View
        style={[a.justify_center, a.align_center, {minHeight: 500}, a.gap_sm]}>
        <PageXIcon width={48} fill={t.atoms.text_contrast_low.color} />
        <Text style={[a.text_md, t.atoms.text_contrast_medium]}>
          <Trans>No drafts yet</Trans>
        </Text>
      </View>
    )
  }, [isLoading, t])

  return (
    <Dialog.Outer control={control} nativeOptions={{fullHeight: true}}>
      {IS_NATIVE && header}
      <Dialog.InnerFlatList
        data={drafts}
        renderItem={renderItem}
        keyExtractor={(item: ArticleDraftSummary) => item.id}
        ListHeaderComponent={web(header)}
        stickyHeaderIndices={web([0])}
        ListEmptyComponent={emptyComponent}
        ListFooterComponent={
          <ListFooter
            isFetchingNextPage={isFetchingNextPage}
            hasNextPage={hasNextPage}
            style={[a.border_transparent]}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        style={[
          a.px_0,
          web({minHeight: 500}),
          {
            backgroundColor: select(t.name, {
              light: t.palette.contrast_50,
              dark: t.palette.contrast_0,
              dim: '#000000',
            }),
          },
        ]}
        webInnerContentContainerStyle={[a.py_0]}
        contentContainerStyle={[a.pb_xl]}
      />
    </Dialog.Outer>
  )
}
