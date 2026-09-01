import {i18n} from '@lingui/core'
import {I18nProvider} from '@lingui/react'
import {renderHook} from '@testing-library/react-native'

import {useIsCatcher} from '#/state/session/role'
import * as Toast from '#/components/Toast'
import {type app} from '#/lexicons'
import {useRequireStrikerForNewPost} from './useRequireStrikerForNewPost'

jest.mock('#/state/session/role', () => ({
  useIsCatcher: jest.fn(),
}))

jest.mock('#/components/Toast', () => ({
  show: jest.fn(),
}))

const mockUseIsCatcher = useIsCatcher as jest.Mock
const mockToastShow = Toast.show as jest.Mock

i18n.loadAndActivate({locale: 'en', messages: {}})
const wrapper = ({children}: {children: React.ReactNode}) => (
  <I18nProvider i18n={i18n}>{children}</I18nProvider>
)

const replyTo = {
  uri: 'at://did:plc:x/app.bsky.feed.post/y',
  cid: 'cid',
  text: '',
  author: {} as unknown as app.bsky.actor.defs.ProfileViewBasic,
}

describe('useRequireStrikerForNewPost', () => {
  afterEach(() => {
    jest.clearAllMocks()
  })

  it('blocks a Catcher opening the composer for a new top-level post', () => {
    mockUseIsCatcher.mockReturnValue(true)
    const {result} = renderHook(() => useRequireStrikerForNewPost(), {wrapper})

    expect(result.current({})).toBe(true)
    expect(mockToastShow).toHaveBeenCalled()
  })

  it('allows a Catcher opening the composer for a reply', () => {
    mockUseIsCatcher.mockReturnValue(true)
    const {result} = renderHook(() => useRequireStrikerForNewPost(), {wrapper})

    expect(result.current({replyTo})).toBe(false)
    expect(mockToastShow).not.toHaveBeenCalled()
  })

  it('allows a Striker to open the composer for a new top-level post', () => {
    mockUseIsCatcher.mockReturnValue(false)
    const {result} = renderHook(() => useRequireStrikerForNewPost(), {wrapper})

    expect(result.current({})).toBe(false)
    expect(mockToastShow).not.toHaveBeenCalled()
  })

  it('allows a Striker to open the composer for a reply', () => {
    mockUseIsCatcher.mockReturnValue(false)
    const {result} = renderHook(() => useRequireStrikerForNewPost(), {wrapper})

    expect(result.current({replyTo})).toBe(false)
    expect(mockToastShow).not.toHaveBeenCalled()
  })
})
