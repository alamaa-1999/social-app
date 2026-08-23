import {type com} from '#/lexicons'

/**
 * Summary for the drafts list. Much simpler than the post composer's
 * `DraftSummary` - no local-media-cache bookkeeping needed, since
 * `ArticleCompose` already uploads images/cover eagerly via `uploadBlob` at
 * insert time, unlike the post composer's deferred-upload model.
 */
export type ArticleDraftSummary = {
  id: string
  createdAt: string
  updatedAt: string
  draft: com.sunnahsky.article.draft.defs.Draft
  title: string
  excerpt: string
  wordCount: number
}
