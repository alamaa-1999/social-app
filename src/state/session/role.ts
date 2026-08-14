import {isCatcherHandle} from '#/lib/strings/handles'
import {useSession} from '#/state/session'

/**
 * Whether the current signed-in account is a Sunnahsky Catcher (reply-only)
 * account, derived from its handle - see {@link isCatcherHandle}. `false`
 * for a logged-out session or an account not hosted on a Sunnahsky PDS,
 * since Sunnahsky's role system does not apply to either.
 */
export function useIsCatcher(): boolean {
  const {currentAccount} = useSession()
  return !!currentAccount && isCatcherHandle(currentAccount.handle)
}
