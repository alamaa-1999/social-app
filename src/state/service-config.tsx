import {createContext, useContext} from 'react'

import {useServiceConfigQuery} from '#/state/queries/service-config'

const CheckEmailConfirmedContext = createContext<boolean | null>(null)

export function Provider({children}: {children: React.ReactNode}) {
  const {data: config} = useServiceConfigQuery()

  // probably true, so default to true when loading
  // if the call fails, the query will set it to false for us
  const checkEmailConfirmed = config?.checkEmailConfirmed ?? true

  return (
    <CheckEmailConfirmedContext.Provider value={checkEmailConfirmed}>
      {children}
    </CheckEmailConfirmedContext.Provider>
  )
}

export function useCheckEmailConfirmed() {
  const ctx = useContext(CheckEmailConfirmedContext)
  if (ctx === null) {
    throw new Error(
      'useCheckEmailConfirmed must be used within a ServiceConfigManager',
    )
  }
  return ctx
}
