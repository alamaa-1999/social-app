import {useEffect, useState} from 'react'
import {useNavigation} from '@react-navigation/native'

import {getCurrentRoute} from '#/lib/routes/helpers'
import {type NavigationProp} from '#/lib/routes/types'
import {useSession} from '#/state/session'
import {useLoggedOutView} from '#/state/shell/logged-out'
import {IS_WEB} from '#/env'
import {type WelcomeModalControl} from './useWelcomeModal.shared'

export function useWelcomeModal(): WelcomeModalControl {
  const {hasSession} = useSession()
  const {showLoggedOut} = useLoggedOutView()
  const navigation = useNavigation<NavigationProp>()
  const [isOpen, setIsOpen] = useState(false)

  const open = () => setIsOpen(true)
  const close = () => setIsOpen(false)

  useEffect(() => {
    /*
     * Signed-out visitors must sign in to see the home feed - this is a
     * standing gate, not a one-time tip, so (unlike the localStorage-backed
     * version this replaced) it opens every time and has no dismiss path
     * (see WelcomeModal.tsx). Direct links - articles, posts, profiles -
     * are unaffected; only the home feed itself is gated, and `Home.tsx`'s
     * own signed-out branch (`LoggedOutHome`) is the real backstop if this
     * modal doesn't show for any reason - it never attempts a feed fetch
     * at all when signed out, so there's no broken feed underneath either
     * way.
     *
     * `navigation.getState()` here, not `useNavigationState()`: this hook
     * is called from `ShellInner`, a *sibling* of the actual navigator
     * (`<FlatNavigator>`, `view/shell/index.web.tsx`), not a descendant of
     * it, and `useNavigationState()` throws ("Couldn't get the navigation
     * state. Is your component inside a navigator?") when called from
     * outside a navigator's own subtree - confirmed directly, this crashed
     * the entire shell (blank page) on a cold load of any non-Home route.
     * `navigator.addListener('state', ...)` already does the identical
     * "react to navigation changes" job one line above in `ShellInner`
     * itself without that restriction, so this mirrors that proven path
     * instead.
     *
     * `getCurrentRoute` itself defaults to `{name: 'Home'}` when handed an
     * undefined state (by design, for callers that need *some* current
     * route even before one exists) - the wrong default for a gating
     * decision, so an undefined/not-yet-available state is treated here as
     * "not confirmed home" rather than trusting that fallback.
     *
     * `showLoggedOut` covers a second gap: `onPressCreateAccount`/
     * `onPressSignIn` close this via `requestSwitchToAccount`, which only
     * flips that flag - it never touches `hasSession` or the route.
     * Without watching it too, backing out of that flow without completing
     * sign-up (`onPressDismiss` in `LoggedOut.tsx`) landed back on Home,
     * signed out, with the wall gone for good until a hard reload.
     */
    const evaluate = () => {
      const state = navigation.getState()
      const isAtHome = state ? getCurrentRoute(state).name === 'Home' : false
      if (IS_WEB && !hasSession && isAtHome && !showLoggedOut) {
        open()
      } else {
        close()
      }
    }
    evaluate()
    return navigation.addListener('state', evaluate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession, showLoggedOut, navigation])

  return {isOpen, open, close}
}
