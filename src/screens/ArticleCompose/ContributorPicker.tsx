import {useState} from 'react'
import {View} from 'react-native'
import {type DidString} from '@atproto/syntax'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {sanitizeDisplayName} from '#/lib/strings/display-names'
import {sanitizeHandle} from '#/lib/strings/handles'
import {useActorAutocompleteQuery} from '#/state/queries/actor-autocomplete'
import {UserAvatar} from '#/view/com/util/UserAvatar'
import {atoms as a, useTheme} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import * as TextField from '#/components/forms/TextField'
import {Text} from '#/components/Typography'
import {type site} from '#/lexicons'

export type ContributorEntry = site.standard.document.Contributor

/**
 * "Add contributor" flow for finding 18 (`site.standard.document.
 * contributors[]`) - credits a real Sunnahsky account distinct from the
 * posting Striker (e.g. an institutional account publishing a named
 * scholar's own account's work). Adapted from the StarterPack Wizard's
 * add/remove picker (`StepProfiles.tsx` + `WizardListCard.tsx`'s toggle/
 * dispatch pattern), with one real addition that pattern doesn't have:
 * `#contributor.role` is per-item free text (finding 18), not a bare
 * toggle, so each added contributor gets its own small role input.
 */
export function ContributorPicker({
  contributors,
  onChangeContributors,
}: {
  contributors: ContributorEntry[]
  onChangeContributors: (next: ContributorEntry[]) => void
}) {
  const {_} = useLingui()
  const t = useTheme()
  const [query, setQuery] = useState('')
  const {data: results} = useActorAutocompleteQuery(query, true, 8)

  const addContributor = (did: DidString, displayName?: string) => {
    if (contributors.some(c => c.did === did)) return
    onChangeContributors([...contributors, {did, displayName}])
    setQuery('')
  }
  const removeContributor = (did: string) => {
    onChangeContributors(contributors.filter(c => c.did !== did))
  }
  const setRole = (did: string, role: string) => {
    onChangeContributors(
      contributors.map(c => (c.did === did ? {...c, role} : c)),
    )
  }

  return (
    <View style={[a.gap_sm]}>
      {contributors.map(c => (
        <View
          key={c.did}
          style={[
            a.flex_row,
            a.align_center,
            a.gap_sm,
            a.p_sm,
            a.rounded_sm,
            a.border,
            t.atoms.border_contrast_low,
          ]}>
          <Text style={[a.flex_1]} numberOfLines={1}>
            {c.displayName || c.did}
          </Text>
          <TextField.Root style={[{flex: 1, maxWidth: 160}]}>
            <TextField.Input
              label={_(msg`Role (optional)`)}
              defaultValue={c.role}
              onChangeText={text => setRole(c.did, text)}
              maxLength={100}
            />
          </TextField.Root>
          <Button
            label={_(msg`Remove contributor`)}
            variant="ghost"
            color="secondary"
            size="small"
            onPress={() => removeContributor(c.did)}>
            <ButtonText>
              <Trans>Remove</Trans>
            </ButtonText>
          </Button>
        </View>
      ))}

      <TextField.Root>
        <TextField.Input
          label={_(msg`Search Sunnahsky accounts to credit`)}
          value={query}
          onChangeText={setQuery}
        />
      </TextField.Root>
      {query.length > 0 && results && results.length > 0 && (
        <View style={[a.gap_xs]}>
          {results
            .filter(p => !contributors.some(c => c.did === p.did))
            .map(p => {
              const displayName = p.displayName
                ? sanitizeDisplayName(p.displayName)
                : sanitizeHandle(p.handle)
              return (
                <Button
                  key={p.did}
                  label={_(msg`Add ${displayName} as a contributor`)}
                  variant="ghost"
                  color="secondary"
                  size="small"
                  onPress={() => addContributor(p.did, displayName)}
                  style={[
                    a.flex_row,
                    a.align_center,
                    a.gap_sm,
                    a.justify_start,
                  ]}>
                  <UserAvatar size={24} avatar={p.avatar ?? null} type="user" />
                  <Text numberOfLines={1}>{displayName}</Text>
                </Button>
              )
            })}
        </View>
      )}
    </View>
  )
}
