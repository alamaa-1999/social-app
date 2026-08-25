import Image from '@tiptap/extension-image'

import {
  IMAGE_BLOCK_COPY,
  IMAGE_BLOCK_MESSAGES,
  buildImageBlockFrame,
} from './imageBlock'
import {sendToNative} from './sendToNative'

/**
 * `@tiptap/extension-image` with the designed frame around it.
 *
 * **Why the frame lives here and not on the upload placeholder.** A saved
 * article's body is markdown, and `![](url)` parses back into *this* node, not
 * into `imageUpload`. Dressing only the placeholder would mean an image looked
 * right the moment it was inserted and then appeared bare the next time the
 * article was opened - which is the exact class of "works in this session,
 * broken tomorrow" bug this whole feature exists to remove.
 *
 * Two states, chosen by whether the image actually loads:
 *
 *   filled   -> the image, capped at 130px, beside the text (Figma 252:3894).
 *   uploaded -> "Your image is uploaded! Click to edit." plus the filename,
 *               when it does not (Figma 253:3919).
 *
 * Driving that off the `<img>` error event rather than off publish state is
 * deliberate: it needs no knowledge of whether the article is published, and it
 * self-corrects. While drafting, the blob is untethered and `getBlob` 404s, so
 * every image shows the explanatory state; once published the same markup
 * resolves and the images simply appear. Nothing has to be told which world it
 * is in.
 */

/**
 * Filenames by blob CID, pushed in from native.
 *
 * The markdown carries only a URL, so the name has to arrive separately.
 * Filenames are small strings - a whole article's worth is a couple of
 * kilobytes - which is why this is pushed wholesale rather than fetched
 * per-node the way image bytes would have to be.
 */
const fileNamesByCid = new Map<string, string>()

/**
 * Called by the bridge when native has names to share.
 *
 * **Merges; never clears.** An earlier version cleared the map first, which
 * produced the worst possible behaviour: a name would appear, then vanish on
 * the next update, because native's list is rebuilt from React state and is
 * momentarily empty while that state settles. A name is also useless to
 * *remove* - the block it belongs to is gone by then, and a stale entry for a
 * CID no longer in the document is never read.
 *
 * Returns whether anything actually changed. Callers do not need to act on
 * that - the blocks on screen are updated here directly - but it makes the
 * no-op case visible to tests.
 */
export function setImageFileNames(entries: Record<string, string>): boolean {
  let changed = false
  for (const [cid, name] of Object.entries(entries)) {
    if (typeof name !== 'string' || !name) continue
    if (fileNamesByCid.get(cid) === name) continue
    fileNamesByCid.set(cid, name)
    changed = true
  }
  if (changed) {
    // Push straight into the blocks already on screen. See `liveBlocks`.
    for (const block of liveBlocks) block.refresh()
  }
  return changed
}

/**
 * Every image block currently rendered, so a name arriving late can be shown
 * without waiting for a re-render.
 *
 * This exists because the obvious approach does not work: a node view reads
 * the map once, when ProseMirror constructs it, and names almost always arrive
 * *after* that - the upload resolves, the block renders, and only then does
 * React state settle and push the names across the bridge. Dispatching an
 * empty transaction to force a refresh does nothing either, because
 * ProseMirror reuses node views whose node has not changed, so there is
 * nothing for it to rebuild. Mutating the document to carry the name would
 * work, but it would dirty the draft and pollute the undo stack for what is
 * only a label.
 *
 * A node view owns its own DOM, so updating that DOM directly is the honest
 * mechanism here rather than a workaround. Entries deregister on `destroy`,
 * so this cannot leak past the blocks that actually exist.
 */
const liveBlocks = new Set<{refresh: () => void}>()

/** The `cid` query parameter of a `getBlob` URL, if this is one. */
function cidFromSrc(src: string): string | undefined {
  const marker = 'com.atproto.sync.getBlob?'
  const at = src.indexOf(marker)
  if (at === -1) return undefined
  for (const part of src.slice(at + marker.length).split('&')) {
    const [key, value] = part.split('=')
    if (key !== 'cid' || !value) continue
    try {
      return decodeURIComponent(value)
    } catch {
      return undefined
    }
  }
  return undefined
}

export const imageNode = Image.extend({
  addNodeView() {
    return ({
      node,
    }: {
      node: {attrs: {src?: string | null; alt?: string | null}}
    }) => {
      const src = node.attrs.src ?? ''
      const cid = cidFromSrc(src)
      const fileName = cid ? fileNamesByCid.get(cid) : undefined

      const img = document.createElement('img')
      img.setAttribute('data-image-block-preview', '')
      img.src = src
      // Alt text is author-controlled and, like the filename, is only ever set
      // as an attribute value - never interpolated into markup.
      if (node.attrs.alt) img.alt = node.attrs.alt

      const dom = buildImageBlockFrame({
        icon: 'image-check',
        action: IMAGE_BLOCK_COPY.uploaded,
        /*
         * The filename replaces the design's format hint rather than adding a
         * third line: by this point the format has been chosen, and the
         * extension carries it anyway. When the picker reported no name it
         * falls back to confirming the upload rather than repeating the format
         * hint - reusing the hint made an uploaded block read identically to an
         * empty one, which looked like a bug.
         *
         * Already sanitised and truncated by native via
         * `#/lib/strings/filename` - and `buildImageBlockFrame` sets it with
         * `textContent`, so markup in a name renders as literal characters.
         */
        supporting: [
          fileName ?? IMAGE_BLOCK_COPY.uploadedNoName,
          IMAGE_BLOCK_COPY.notVisible,
        ],
        image: img,
      })
      dom.setAttribute('data-image-node', '')
      dom.style.cursor = 'pointer'

      /*
       * Register for late-arriving names. The first supporting line is the
       * filename slot; `refresh` re-reads the map rather than closing over a
       * value, so it always shows the current name.
       */
      const nameEl = dom.querySelector('[data-image-block-supporting]')
      const entry = {
        refresh: () => {
          if (!nameEl || !cid) return
          nameEl.textContent =
            fileNamesByCid.get(cid) ?? IMAGE_BLOCK_COPY.uploadedNoName
        },
      }
      liveBlocks.add(entry)

      /*
       * Start in the explanatory state and drop it only once the image really
       * decodes. The other order flashes a broken-image glyph on every draft
       * load, which is precisely the symptom this replaces.
       */
      dom.setAttribute('data-image-unavailable', '')
      img.addEventListener('load', () => {
        dom.removeAttribute('data-image-unavailable')
      })
      img.addEventListener('error', () => {
        dom.setAttribute('data-image-unavailable', '')
      })

      dom.addEventListener('click', () => {
        const rect = dom.getBoundingClientRect()
        sendToNative({
          type: IMAGE_BLOCK_MESSAGES.requestMenu,
          payload: {
            kind: 'image',
            src,
            cid,
            rect: {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
            },
          },
        })
      })

      return {
        dom,
        destroy() {
          liveBlocks.delete(entry)
        },
      }
    }
  },
})
