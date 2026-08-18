import {useCallback, useEffect, useRef} from 'react'
import {StyleSheet, View} from 'react-native'
import {Trans, useLingui} from '@lingui/react/macro'
import {useNavigation} from '@react-navigation/native'

import {DISCOVER_FEED_URI} from '#/lib/constants'
import {usePalette} from '#/lib/hooks/usePalette'
import {MagnifyingGlassIcon} from '#/lib/icons'
import {type NavigationProp} from '#/lib/routes/types'
import {s} from '#/lib/styles'
import {useFeedFeedbackContext} from '#/state/feed-feedback'
import {useSession} from '#/state/session'
import {atoms as a} from '#/alf'
import {Button, ButtonIcon, ButtonText} from '#/components/Button'
import {ChevronRight_Stroke2_Corner0_Rounded as ChevronRightIcon} from '#/components/icons/Chevron'
import {useAnalytics} from '#/analytics'
import {IS_WEB} from '#/env'
import {Text} from '../util/text/Text'

export function CustomFeedEmptyState() {
  const ax = useAnalytics()
  const feedFeedback = useFeedFeedbackContext()
  const {currentAccount} = useSession()
  const hasLoggedDiscoverEmptyErrorRef = useRef(false)

  useEffect(() => {
    // Log the empty feed error event
    if (feedFeedback.feedSourceInfo && currentAccount?.did) {
      const uri = feedFeedback.feedSourceInfo.uri
      if (
        uri === DISCOVER_FEED_URI &&
        !hasLoggedDiscoverEmptyErrorRef.current
      ) {
        hasLoggedDiscoverEmptyErrorRef.current = true
        ax.metric('feed:discover:emptyError', {
          userDid: currentAccount.did,
        })
      }
    }
  }, [feedFeedback.feedSourceInfo, currentAccount?.did])
  const {t: l} = useLingui()
  const pal = usePalette('default')
  const navigation = useNavigation<NavigationProp>()
  const isDiscover = feedFeedback.feedSourceInfo?.uri === DISCOVER_FEED_URI

  const onPressFindAccounts = useCallback(() => {
    if (IS_WEB) {
      navigation.navigate('Search', {})
    } else {
      navigation.navigate('SearchTab')
      navigation.popToTop()
    }
  }, [navigation])

  return (
    <View style={styles.emptyContainer}>
      <View style={styles.emptyIconContainer}>
        <MagnifyingGlassIcon style={[styles.emptyIcon, pal.text]} size={62} />
      </View>
      {isDiscover ? (
        /*
         * Discover is Sunnahsky's own synthetic Striker feed, not a
         * follow/language-driven algorithmic one - "follow more users" is
         * never the right advice here, and there's nothing actionable for
         * the user to do about a quiet Striker roster.
         */
        <Text type="xl-medium" style={[s.textCenter, pal.text]}>
          <Trans>No posts from Sunnahsky Strikers yet. Check back soon!</Trans>
        </Text>
      ) : (
        <>
          <Text type="xl-medium" style={[s.textCenter, pal.text]}>
            <Trans>
              This feed is empty! You may need to follow more users or tune your
              language settings.
            </Trans>
          </Text>
          <View style={[a.mt_xl, a.align_center]}>
            <Button
              label={l`Find accounts to follow`}
              onPress={onPressFindAccounts}
              color="secondary_inverted"
              size="large">
              <ButtonText>
                <Trans>Find accounts to follow</Trans>
              </ButtonText>
              <ButtonIcon icon={ChevronRightIcon} />
            </Button>
          </View>
        </>
      )}
    </View>
  )
}
const styles = StyleSheet.create({
  emptyContainer: {
    height: '100%',
    paddingVertical: 40,
    paddingHorizontal: 30,
  },
  emptyIconContainer: {
    marginBottom: 16,
  },
  emptyIcon: {
    marginLeft: 'auto',
    marginRight: 'auto',
  },
})
