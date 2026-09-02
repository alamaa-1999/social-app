import {useEffect, useState} from 'react'

import {useNavigationTabState} from '#/lib/hooks/useNavigationTabState'
import {useSession} from '#/state/session'
import {useLoggedOutView} from '#/state/shell/logged-out'
import {IS_WEB} from '#/env'
import {type WelcomeModalControl} from './useWelcomeModal.shared'

export function useWelcomeModal(): WelcomeModalControl {
  const {hasSession} = useSession()
  const {isAtHome} = useNavigationTabState()
  const {showLoggedOut} = useLoggedOutView()
  const [isOpen, setIsOpen] = useState(false)

  const open = () => setIsOpen(true)
  const close = () => setIsOpen(false)

  useEffect(() => {
    /*
     * Signed-out visitors must sign in to see the home feed - this is a
     * standing gate, not a one-time tip, so (unlike the localStorage-backed
     * version this replaced) it opens every time and has no dismiss path
     * (see WelcomeModal.tsx). Direct links - articles, posts, profiles -
     * are unaffected; only the home feed itself is gated.
     *
     * `isAtHome` (React Navigation's own live route state, not a one-off
     * `window.location` read) is what makes this re-fire on in-app
     * navigation, not just session changes - without it, clicking the
     * in-app Home link from a direct-link page while logged out landed
     * back on Home with no wall until a hard reload.
     *
     * `showLoggedOut` covers the other gap: `onPressCreateAccount`/
     * `onPressSignIn` close this via `requestSwitchToAccount`, which only
     * flips that flag - it never touches `hasSession` or the route. Without
     * watching it too, backing out of that flow without completing sign-up
     * (`onPressDismiss` in `LoggedOut.tsx`) landed back on Home, logged
     * out, with the wall gone for good until a hard reload.
     */
    if (IS_WEB && !hasSession && isAtHome && !showLoggedOut) {
      open()
    } else {
      close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSession, isAtHome, showLoggedOut])

  return {isOpen, open, close}
}
