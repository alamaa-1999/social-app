import {View} from 'react-native'
import {msg} from '@lingui/core/macro'
import {useLingui} from '@lingui/react'
import {Trans} from '@lingui/react/macro'

import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {CenteredView} from '#/view/com/util/Views'
import {atoms as a} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {useHeaderOffset} from '#/components/hooks/useHeaderOffset'
import {Text} from '#/components/Typography'

/**
 * Replaces the home feed entirely for signed-out visitors - not a feed with
 * an empty/error state, just this message. `WelcomeModal` is the primary
 * wall (shown as soon as a signed-out visitor lands on Home), but it's a
 * separate mechanism with its own route/session-timing logic; this is what
 * renders underneath it regardless, so a gap in that timing (or the modal
 * failing to mount at all) still leaves a signed-out visitor looking at a
 * correct message instead of an attempted feed fetch or a blank screen.
 */
export function LoggedOutHome() {
  const {_} = useLingui()
  const headerOffset = useHeaderOffset()
  const {requestSwitchToAccount} = useLoggedOutViewControls()

  return (
    <CenteredView sideBorders style={[a.h_full_vh]}>
      <View
        style={[
          a.align_center,
          a.h_full_vh,
          a.py_3xl,
          a.px_xl,
          {
            paddingTop: headerOffset + a.py_3xl.paddingTop,
          },
        ]}>
        <View style={[a.align_center, a.gap_sm, a.pb_xl]}>
          <Text style={[a.text_xl, a.font_semi_bold]}>
            <Trans>Sign in to see what's happening</Trans>
          </Text>
          <Text
            style={[a.text_md, a.text_center, a.leading_snug, {maxWidth: 340}]}>
            <Trans>Create an account or sign in to browse the feed.</Trans>
          </Text>
        </View>

        <View style={[a.flex_row, a.gap_md, a.justify_center, a.flex_wrap]}>
          <Button
            label={_(msg`Create account`)}
            size="large"
            variant="solid"
            color="primary"
            onPress={() => requestSwitchToAccount({requestedAccount: 'new'})}>
            <ButtonText>{_(msg`Create account`)}</ButtonText>
          </Button>
          <Button
            label={_(msg`Sign in`)}
            size="large"
            variant="solid"
            color="secondary"
            onPress={() =>
              requestSwitchToAccount({requestedAccount: 'existing'})
            }>
            <ButtonText>{_(msg`Sign in`)}</ButtonText>
          </Button>
        </View>
      </View>
    </CenteredView>
  )
}
