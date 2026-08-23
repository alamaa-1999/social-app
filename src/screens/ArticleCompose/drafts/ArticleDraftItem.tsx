import {useCallback} from 'react'
import {Pressable, View} from 'react-native'
import {msg, plural} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'

import {TimeElapsed} from '#/view/com/util/TimeElapsed'
import {atoms as a, select, useTheme} from '#/alf'
import {Button} from '#/components/Button'
import {DotGrid3x1_Stroke2_Corner0_Rounded as DotsIcon} from '#/components/icons/DotGrid'
import * as Prompt from '#/components/Prompt'
import {Text} from '#/components/Typography'
import {type ArticleDraftSummary} from './state/schema'

export function ArticleDraftItem({
  draft,
  onSelect,
  onDelete,
}: {
  draft: ArticleDraftSummary
  onSelect: (draft: ArticleDraftSummary) => void
  onDelete: (draft: ArticleDraftSummary) => void
}) {
  const {_} = useLingui()
  const t = useTheme()
  const discardPromptControl = Prompt.usePromptControl()

  const handleDelete = useCallback(() => {
    onDelete(draft)
  }, [onDelete, draft])

  return (
    <>
      <View style={[a.relative]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={_(msg`Open draft`)}
          accessibilityHint={_(msg`Opens this draft in the article composer`)}
          onPress={() => onSelect(draft)}
          style={({pressed, hovered}) => [
            a.rounded_md,
            a.border,
            t.atoms.shadow_sm,
            pressed || hovered
              ? t.atoms.border_contrast_medium
              : t.atoms.border_contrast_low,
            {
              backgroundColor: select(t.name, {
                light: t.atoms.bg.backgroundColor,
                dark: t.atoms.bg_contrast_25.backgroundColor,
                dim: t.atoms.bg_contrast_25.backgroundColor,
              }),
            },
          ]}>
          <View
            style={[
              a.rounded_md,
              a.overflow_hidden,
              a.p_lg,
              a.pb_md,
              a.gap_xs,
              {paddingTop: 20 + a.pt_md.paddingTop},
            ]}>
            <Text style={[a.text_md, a.font_bold]} numberOfLines={1}>
              {draft.title}
            </Text>
            {!!draft.excerpt && (
              <Text
                style={[
                  a.text_sm,
                  a.leading_snug,
                  t.atoms.text_contrast_medium,
                ]}
                numberOfLines={2}>
                {draft.excerpt}
              </Text>
            )}
            {draft.wordCount > 0 && (
              <Text
                style={[a.text_xs, a.leading_tight, t.atoms.text_contrast_low]}>
                {plural(draft.wordCount, {
                  one: '# word',
                  other: '# words',
                })}
              </Text>
            )}
          </View>
        </Pressable>

        {/* Timestamp */}
        <View
          pointerEvents="none"
          style={[
            a.absolute,
            a.pointer_events_none,
            {top: a.pt_md.paddingTop, left: a.pl_lg.paddingLeft},
          ]}>
          <TimeElapsed timestamp={draft.updatedAt}>
            {({timeElapsed}) => (
              <Text
                style={[
                  a.text_sm,
                  t.atoms.text_contrast_medium,
                  a.leading_tight,
                ]}
                numberOfLines={1}>
                {timeElapsed}
              </Text>
            )}
          </TimeElapsed>
        </View>

        {/* Menu button */}
        <View
          style={[
            a.absolute,
            {top: a.pt_md.paddingTop, right: a.pr_md.paddingRight},
          ]}>
          <Button
            label={_(msg`More options`)}
            hitSlop={8}
            onPress={e => {
              e.stopPropagation()
              discardPromptControl.open()
            }}
            style={[a.pointer, a.rounded_full, {height: 20, width: 20}]}>
            {({pressed, hovered}) => (
              <>
                <View
                  style={[
                    a.absolute,
                    a.rounded_full,
                    {
                      top: -4,
                      bottom: -4,
                      left: -4,
                      right: -4,
                      backgroundColor:
                        pressed || hovered
                          ? select(t.name, {
                              light: t.atoms.bg_contrast_50.backgroundColor,
                              dark: t.atoms.bg_contrast_100.backgroundColor,
                              dim: t.atoms.bg_contrast_100.backgroundColor,
                            })
                          : 'transparent',
                    },
                  ]}
                />
                <DotsIcon
                  width={16}
                  fill={t.atoms.text_contrast_low.color}
                  style={[a.z_20]}
                />
              </>
            )}
          </Button>
        </View>
      </View>

      <Prompt.Basic
        control={discardPromptControl}
        title={_(msg`Discard draft?`)}
        description={_(msg`This draft will be permanently deleted.`)}
        onConfirm={handleDelete}
        confirmButtonCta={_(msg`Discard`)}
        confirmButtonColor="negative"
      />
    </>
  )
}
