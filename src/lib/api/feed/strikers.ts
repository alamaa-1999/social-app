import {type Client} from '@atproto/lex'
import {type AtIdentifierString} from '@atproto/syntax'

import {app} from '#/lexicons'
import {type FeedAPI, type FeedAPIResponse} from './types'

/**
 * Sunnahsky's synthetic Discover feed: every Striker's own top-level posts,
 * newest first. Built on `searchPostsV2`'s `authors` filter rather than a
 * dedicated indexer - the same mechanism the Articles feed already uses.
 *
 * `searchPostsV2` returns `{posts: PostView[]}`, not `{feed: FeedViewPost[]}`
 * like every other feed source - `fetch()`/`peekLatest()` adapt by wrapping
 * each post as `{post}`, which is all `FeedViewPost` requires.
 */
export class StrikerFeedAPI implements FeedAPI {
  client: Client
  strikerDids: string[]

  constructor({client, strikerDids}: {client: Client; strikerDids: string[]}) {
    this.client = client
    this.strikerDids = strikerDids
  }

  async peekLatest(): Promise<app.bsky.feed.defs.FeedViewPost> {
    if (this.strikerDids.length === 0) {
      return undefined as unknown as app.bsky.feed.defs.FeedViewPost
    }
    const data = await this.client.call(app.bsky.feed.searchPostsV2, {
      authors: this.strikerDids as AtIdentifierString[],
      sort: 'recent',
      excludeReplies: true,
      limit: 1,
    })
    const post = data.posts[0]
    return (post ? {post} : undefined) as app.bsky.feed.defs.FeedViewPost
  }

  async fetch({
    cursor,
    limit,
  }: {
    cursor: string | undefined
    limit: number
  }): Promise<FeedAPIResponse> {
    if (this.strikerDids.length === 0) {
      return {cursor: undefined, feed: []}
    }
    const data = await this.client.call(app.bsky.feed.searchPostsV2, {
      authors: this.strikerDids as AtIdentifierString[],
      sort: 'recent',
      excludeReplies: true,
      cursor,
      limit,
    })
    return {
      cursor: data.cursor,
      feed: data.posts.map(post => ({post})),
    }
  }
}
