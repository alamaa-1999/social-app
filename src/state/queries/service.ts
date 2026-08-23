import {useQuery} from '@tanstack/react-query'

import {createServiceClient} from '#/lib/lexClient'
import {com} from '#/lexicons'

const RQKEY_ROOT = 'service'
export const RQKEY = (serviceUrl: string) => [RQKEY_ROOT, serviceUrl]

export function useServiceQuery(serviceUrl: string) {
  const enabled = isValidUrl(serviceUrl)
  return useQuery({
    queryKey: RQKEY(serviceUrl),
    queryFn: async () => {
      /*
       * The host is whatever the user typed or picked, so this describes it
       * through a one-off service client rather than a session-scoped one.
       */
      const client = createServiceClient(serviceUrl)
      return await client.call(com.atproto.server.describeServer)
    },
    enabled,
    /*
     * This check exists specifically to validate a user-supplied host that
     * may have nothing to do with the app's authenticated session - it must
     * not be gated by TanStack's global onlineManager belief (which can be
     * stuck "offline" for unrelated reasons), the same way createServiceClient
     * itself deliberately avoids networkAwareFetch. Without this, the query
     * silently never runs (fetchStatus stays "paused") instead of either
     * succeeding or surfacing a real error.
     */
    networkMode: 'always',
  })
}

function isValidUrl(url: string) {
  try {
    new URL(url)
    return true
  } catch {
    return false
  }
}
