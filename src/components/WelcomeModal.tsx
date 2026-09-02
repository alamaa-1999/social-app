import {useEffect, useState} from 'react'
import {Pressable, View} from 'react-native'
import {ImageBackground} from 'expo-image'
import {Trans, useLingui} from '@lingui/react/macro'
import {FocusGuards, FocusScope} from 'radix-ui/internal'

import {useLoggedOutViewControls} from '#/state/shell/logged-out'
import {Logo} from '#/view/icons/Logo'
import {atoms as a, flatten, useBreakpoints, web} from '#/alf'
import {Button, ButtonText} from '#/components/Button'
import {type WelcomeModalControl} from '#/components/hooks/useWelcomeModal.shared'
import {Text} from '#/components/Typography'
import {useAnalytics} from '#/analytics'

const welcomeModalBg = require('../../assets/images/welcome-modal-bg.jpg')

interface WelcomeModalProps {
  control: WelcomeModalControl
}

export function WelcomeModal({control}: WelcomeModalProps) {
  const {t: l} = useLingui()
  const ax = useAnalytics()
  const {requestSwitchToAccount} = useLoggedOutViewControls()
  const {gtMobile} = useBreakpoints()
  const [signInLinkHovered, setSignInLinkHovered] = useState(false)

  useEffect(() => {
    if (control.isOpen) {
      ax.metric('welcomeModal:presented', {})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [control.isOpen])

  const onPressCreateAccount = () => {
    ax.metric('welcomeModal:signupClicked', {})
    control.close()
    requestSwitchToAccount({requestedAccount: 'new'})
  }

  const onPressSignIn = () => {
    ax.metric('welcomeModal:signinClicked', {})
    control.close()
    requestSwitchToAccount({requestedAccount: 'existing'})
  }

  FocusGuards.useFocusGuards()

  return (
    <View
      role="dialog"
      aria-modal
      style={[
        a.fixed,
        a.inset_0,
        a.justify_center,
        a.align_center,
        {zIndex: 9999, backgroundColor: 'rgba(0,0,0,0.2)'},
        web({backdropFilter: 'blur(15px)'}),
        a.fade_in,
      ]}>
      <FocusScope.FocusScope asChild loop trapped>
        <View
          style={flatten([
            {
              maxWidth: 800,
              maxHeight: 600,
              width: '90%',
              height: '90%',
              backgroundColor: '#C0DCF0',
            },
            a.rounded_lg,
            a.overflow_hidden,
            a.zoom_in,
          ])}>
          <ImageBackground
            source={welcomeModalBg}
            style={[a.flex_1, a.justify_center]}
            contentFit="cover">
            <View style={[a.gap_2xl, a.align_center, a.p_4xl]}>
              <View
                style={[
                  a.flex_row,
                  a.align_center,
                  a.justify_center,
                  a.w_full,
                  a.p_0,
                ]}>
                <View style={[a.flex_row, a.align_center, a.gap_xs]}>
                  <Logo allowVariants={false} width={26} />
                  <Text
                    style={[
                      a.text_2xl,
                      a.font_semi_bold,
                      a.user_select_none,
                      {color: '#354358', letterSpacing: -0.5},
                    ]}>
                    sunnahsky
                  </Text>
                </View>
              </View>
              <View style={[a.gap_sm, a.align_center, a.pt_3xl, a.pb_3xl]}>
                <Text
                  style={[
                    gtMobile ? a.text_4xl : a.text_3xl,
                    a.font_semi_bold,
                    a.text_center,
                    {color: '#354358'},
                    web({
                      backgroundImage:
                        'linear-gradient(180deg, #313F54 0%, #667B99 83.65%, rgba(102, 123, 153, 0.50) 100%)',
                      backgroundClip: 'text',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      color: 'transparent',
                      lineHeight: 1.2,
                      letterSpacing: -0.5,
                    }),
                  ]}>
                  <Trans>Sit down with a book and a cup of tea.</Trans>
                  {'\n'}
                  <Trans>
                    But if you do need to go online; sunnahsky is here:
                  </Trans>
                  {'\n'}
                  <Trans>
                    Real people. Real Marakiz. Real benefits. No manipulation.
                  </Trans>
                </Text>
              </View>
              <View style={[a.gap_md, a.align_center]}>
                <View>
                  <Button
                    onPress={onPressCreateAccount}
                    label={l`Create account`}
                    size="large"
                    color="primary"
                    style={{
                      width: 200,
                      backgroundColor: '#006AFF',
                    }}>
                    <ButtonText>
                      <Trans>Create account</Trans>
                    </ButtonText>
                  </Button>
                </View>
                <View style={[a.align_center, {minWidth: 200}]}>
                  <Text
                    style={[
                      a.text_md,
                      a.text_center,
                      {color: '#405168', lineHeight: 24},
                    ]}>
                    <Trans>Already have an account?</Trans>{' '}
                    <Pressable
                      onPress={onPressSignIn}
                      onPointerEnter={() => setSignInLinkHovered(true)}
                      onPointerLeave={() => setSignInLinkHovered(false)}
                      accessibilityRole="button"
                      accessibilityLabel={l`Sign in`}
                      accessibilityHint="">
                      <Text
                        style={[
                          a.font_medium,
                          {
                            color: '#006AFF',
                            fontSize: undefined,
                          },
                          signInLinkHovered && a.underline,
                        ]}>
                        <Trans>Sign in</Trans>
                      </Text>
                    </Pressable>
                  </Text>
                </View>
              </View>
            </View>
          </ImageBackground>
        </View>
      </FocusScope.FocusScope>
    </View>
  )
}
