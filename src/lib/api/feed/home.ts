import {type Client} from '@atproto/lex'

import {type app} from '#/lexicons'
import {FollowingFeedAPI} from './following'
import {StrikerFeedAPI} from './strikers'
import {type FeedAPI, type FeedAPIResponse} from './types'

// HACK
// the feed API does not include any facilities for passing down
// non-post elements. adding that is a bit of a heavy lift, and we
// have just one temporary usecase for it: flagging when the home feed
// falls back to discover.
// we use this fallback marker post to drive this instead. see Feed.tsx
// for the usage.
// -prf
/*
 * A synthetic marker, not a real view: its `uri`/`did`/`indexedAt` are
 * deliberately not well-formed, so the literal is asserted rather than branded.
 * Only `post.uri` is ever read (see Feed.tsx).
 */
export const FALLBACK_MARKER_POST = {
  post: {
    uri: 'fallback-marker-post',
    cid: 'fake',
    record: {},
    author: {
      did: 'did:fake',
      handle: 'fake.com',
    },
    indexedAt: new Date().toISOString(),
  },
} as unknown as app.bsky.feed.defs.FeedViewPost

export class HomeFeedAPI implements FeedAPI {
  client: Client
  following: FollowingFeedAPI
  discover: StrikerFeedAPI
  usingDiscover = false
  itemCursor = 0
  strikerDids: string[]

  constructor({client, strikerDids}: {client: Client; strikerDids: string[]}) {
    this.client = client
    this.strikerDids = strikerDids
    this.following = new FollowingFeedAPI({client})
    this.discover = new StrikerFeedAPI({client, strikerDids})
  }

  reset() {
    this.following = new FollowingFeedAPI({client: this.client})
    this.discover = new StrikerFeedAPI({
      client: this.client,
      strikerDids: this.strikerDids,
    })
    this.usingDiscover = false
    this.itemCursor = 0
  }

  async peekLatest(): Promise<app.bsky.feed.defs.FeedViewPost> {
    if (this.usingDiscover) {
      return this.discover.peekLatest()
    }
    return this.following.peekLatest()
  }

  async fetch({
    cursor,
    limit,
  }: {
    cursor: string | undefined
    limit: number
  }): Promise<FeedAPIResponse> {
    if (!cursor) {
      this.reset()
    }

    let returnCursor
    let posts: app.bsky.feed.defs.FeedViewPost[] = []

    if (!this.usingDiscover) {
      const res = await this.following.fetch({cursor, limit})
      returnCursor = res.cursor
      posts = posts.concat(res.feed)
      if (!returnCursor) {
        cursor = ''
        posts.push(FALLBACK_MARKER_POST)
        this.usingDiscover = true
      }
    }

    if (this.usingDiscover && !__DEV__) {
      const res = await this.discover.fetch({cursor, limit})
      returnCursor = res.cursor
      posts = posts.concat(res.feed)
    }

    return {
      cursor: returnCursor,
      feed: posts,
    }
  }
}
