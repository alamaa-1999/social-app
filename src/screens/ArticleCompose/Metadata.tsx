import {useState} from 'react'
import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {atoms as a, useBreakpoints, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import {ChevronBottom_Stroke2_Corner0_Rounded as ChevronDownIcon} from '#/components/icons/Chevron'
import {Photo_Stroke2_Corner0_Rounded as PhotoIcon} from '#/components/icons/Photo'
import {Text} from '#/components/Typography'
import {type ContributorEntry, ContributorPicker} from './ContributorPicker'

export interface MetadataValue {
  author: string
  translator: string
  category: string
  tags: string
  contributors: ContributorEntry[]
  hasCoverImage: boolean
}

/**
 * Author/translator/category/tags/cover-image/contributors. Two confirmed
 * layouts from the real Figma designs (fetched live this session): desktop
 * shows these as an inline, divider-separated chevron-chip row; mobile
 * collapses them into an accordion card, with the toolbar's secondary row
 * (color/align/list/link/audio/image) only appearing once the accordion is
 * collapsed (real, confirmed behavior - screen space goes to whichever one
 * is active). Each field here is a plain, directly-editable TextField
 * rather than a chevron-triggered popover per field - simpler, and no
 * fidelity loss for a text field specifically (a popover buys nothing a
 * direct input doesn't already give).
 */
export function Metadata({
  value,
  onChange,
  onPressCoverImage,
}: {
  value: MetadataValue
  onChange: (next: MetadataValue) => void
  onPressCoverImage: () => void
}) {
  const {_} = useLingui()
  const t = useTheme()
  const {gtMobile} = useBreakpoints()
  const [expanded, setExpanded] = useState(gtMobile)

  const set = (patch: Partial<MetadataValue>) => onChange({...value, ...patch})

  const fields = (
    <View
      style={
        gtMobile
          ? [a.flex_row, a.flex_wrap, a.align_center, a.gap_md]
          : [a.gap_sm]
      }>
      <TextField.Root style={gtMobile ? [{width: 160}] : undefined}>
        <TextField.Input
          label={_(msg`Author (optional)`)}
          defaultValue={value.author}
          onChangeText={text => set({author: text})}
          maxLength={100}
        />
      </TextField.Root>
      <TextField.Root style={gtMobile ? [{width: 160}] : undefined}>
        <TextField.Input
          label={_(msg`Translator (optional)`)}
          defaultValue={value.translator}
          onChangeText={text => set({translator: text})}
          maxLength={100}
        />
      </TextField.Root>
      <TextField.Root style={gtMobile ? [{width: 160}] : undefined}>
        <TextField.Input
          label={_(msg`Category (optional)`)}
          defaultValue={value.category}
          onChangeText={text => set({category: text})}
        />
      </TextField.Root>
      <TextField.Root style={gtMobile ? [{width: 200}] : undefined}>
        <TextField.Input
          label={_(msg`Tags, comma separated (optional)`)}
          defaultValue={value.tags}
          onChangeText={text => set({tags: text})}
        />
      </TextField.Root>
      <Button
        label={_(msg`Edit cover image`)}
        variant="outline"
        color="secondary"
        size="small"
        onPress={onPressCoverImage}
        style={[a.flex_row, a.align_center, a.gap_xs]}>
        <PhotoIcon width={16} style={[t.atoms.text_contrast_medium]} />
        <ButtonText>
          {value.hasCoverImage ? (
            <Trans>Change cover image</Trans>
          ) : (
            <Trans>Edit cover image</Trans>
          )}
        </ButtonText>
      </Button>
      <View style={[a.w_full, a.pt_sm]}>
        <Text
          style={[
            a.text_sm,
            a.font_semi_bold,
            t.atoms.text_contrast_medium,
            a.pb_xs,
          ]}>
          <Trans>Contributors (optional)</Trans>
        </Text>
        <ContributorPicker
          contributors={value.contributors}
          onChangeContributors={contributors => set({contributors})}
        />
      </View>
    </View>
  )

  if (gtMobile) {
    return (
      <View
        style={[
          a.flex_row,
          a.align_center,
          a.px_lg,
          a.py_sm,
          a.border_b,
          t.atoms.border_contrast_low,
        ]}>
        {fields}
      </View>
    )
  }

  return (
    <View style={[a.border_b, t.atoms.border_contrast_low]}>
      <Button
        label={_(msg`Article details`)}
        variant="ghost"
        color="secondary"
        onPress={() => setExpanded(!expanded)}
        style={[
          a.flex_row,
          a.align_center,
          a.justify_between,
          a.px_lg,
          a.py_md,
          a.rounded_0,
        ]}>
        <Text
          style={[a.text_sm, a.font_semi_bold, t.atoms.text_contrast_medium]}>
          <Trans>Article details</Trans>
        </Text>
        <ChevronDownIcon
          width={16}
          style={[
            t.atoms.text_contrast_medium,
            expanded && {transform: [{rotate: '180deg'}]},
          ]}
        />
      </Button>
      {expanded && <View style={[a.px_lg, a.pb_lg]}>{fields}</View>}
    </View>
  )
}
