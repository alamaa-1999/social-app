/**
 * Shared chrome for the body-image block, per Figma's "Photo upload" component
 * (nodes 252:3893 idle, 253:3919 uploaded, 252:3894 filled).
 *
 * Two different ProseMirror nodes render this frame and must look identical
 * doing it:
 *
 * - `imageUploadNode` - the transient placeholder, before an image exists.
 * - the `image` node view - once one does.
 *
 * They are separate nodes because only the second persists. A saved article's
 * markdown parses back into TipTap's `image`, so putting the frame solely on
 * the placeholder would give freshly-inserted images the designed treatment and
 * leave reopened ones bare. Keeping the markup here means the seam between them
 * is invisible.
 *
 * Everything is plain DOM. This bundle has no ALF and no React - see
 * `imageUploadNode`'s note on why a React node view is not worth pulling in -
 * so the design's tokens are inlined as the hex they resolve to, exactly as the
 * existing rules in `index.html` already do.
 */

const SVG_NS = 'http://www.w3.org/2000/svg'

/*
 * Exported from Figma rather than drawn: `image-03` (node 252:3895) and
 * `image-check` (node 253:3936). Neither exists in `src/components/icons`, and
 * neither could use `createSinglePathSVG` from here anyway, since that is a
 * React component and this bundle has no React.
 */
const ICON_PATHS = {
  'image-03':
    'M3.56008 17.2733L9.05719 11.7761C9.38721 11.4461 9.55221 11.2811 9.74249 11.2193C9.90986 11.1649 10.0901 11.1649 10.2575 11.2193C10.4478 11.2811 10.6128 11.4461 10.9428 11.7761L16.4033 17.2366M11.6667 12.5L14.0572 10.1095C14.3872 9.77946 14.5522 9.61445 14.7425 9.55263C14.9099 9.49825 15.0901 9.49825 15.2575 9.55263C15.4478 9.61445 15.6128 9.77946 15.9428 10.1095L18.3333 12.5M8.33333 7.5C8.33333 8.42047 7.58714 9.16667 6.66667 9.16667C5.74619 9.16667 5 8.42047 5 7.5C5 6.57953 5.74619 5.83333 6.66667 5.83333C7.58714 5.83333 8.33333 6.57953 8.33333 7.5ZM5.66667 17.5H14.3333C15.7335 17.5 16.4335 17.5 16.9683 17.2275C17.4387 16.9878 17.8212 16.6054 18.0608 16.135C18.3333 15.6002 18.3333 14.9001 18.3333 13.5V6.5C18.3333 5.09987 18.3333 4.3998 18.0608 3.86502C17.8212 3.39462 17.4387 3.01217 16.9683 2.77248C16.4335 2.5 15.7335 2.5 14.3333 2.5H5.66667C4.26654 2.5 3.56647 2.5 3.03169 2.77248C2.56129 3.01217 2.17883 3.39462 1.93915 3.86502C1.66667 4.3998 1.66667 5.09987 1.66667 6.5V13.5C1.66667 14.9001 1.66667 15.6002 1.93915 16.135C2.17883 16.6054 2.56129 16.9878 3.03169 17.2275C3.56647 17.5 4.26654 17.5 5.66667 17.5Z',
  'image-check':
    'M13.3333 4.16667L15 5.83333L18.3333 2.5M10.4167 2.5H6.5C5.09987 2.5 4.3998 2.5 3.86502 2.77248C3.39462 3.01217 3.01217 3.39462 2.77248 3.86502C2.5 4.3998 2.5 5.09987 2.5 6.5V13.5C2.5 14.9001 2.5 15.6002 2.77248 16.135C3.01217 16.6054 3.39462 16.9878 3.86502 17.2275C4.3998 17.5 5.09987 17.5 6.5 17.5H14.1667C14.9416 17.5 15.3291 17.5 15.647 17.4148C16.5098 17.1836 17.1836 16.5098 17.4148 15.647C17.5 15.3291 17.5 14.9416 17.5 14.1667M8.75 7.08333C8.75 8.00381 8.00381 8.75 7.08333 8.75C6.16286 8.75 5.41667 8.00381 5.41667 7.08333C5.41667 6.16286 6.16286 5.41667 7.08333 5.41667C8.00381 5.41667 8.75 6.16286 8.75 7.08333ZM12.4917 9.93179L5.44262 16.34C5.04614 16.7005 4.84789 16.8807 4.83036 17.0368C4.81516 17.1722 4.86704 17.3064 4.96932 17.3963C5.08732 17.5 5.35523 17.5 5.89107 17.5H13.7133C14.9126 17.5 15.5123 17.5 15.9833 17.2985C16.5745 17.0456 17.0456 16.5745 17.2985 15.9833C17.5 15.5123 17.5 14.9126 17.5 13.7133C17.5 13.3098 17.5 13.108 17.4559 12.9201C17.4004 12.684 17.2941 12.4628 17.1444 12.272C17.0252 12.1202 16.8677 11.9941 16.5526 11.742L14.2215 9.87722C13.9062 9.62492 13.7485 9.49878 13.5748 9.45426C13.4218 9.41502 13.2607 9.4201 13.1104 9.46891C12.94 9.52428 12.7905 9.66012 12.4917 9.93179Z',
} as const

export type IconName = keyof typeof ICON_PATHS

/** The 40px bordered square holding a 20px glyph, per the design. */
function buildFeaturedIcon(icon: IconName): HTMLElement {
  const wrap = document.createElement('div')
  wrap.setAttribute('data-image-block-icon', '')

  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 20 20')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('aria-hidden', 'true')

  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', ICON_PATHS[icon])
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '1.66667')
  path.setAttribute('stroke-linecap', 'round')
  path.setAttribute('stroke-linejoin', 'round')

  svg.appendChild(path)
  wrap.appendChild(svg)
  return wrap
}

export type FrameOptions = {
  icon: IconName
  /** The blue line - "Click to upload", "Uploading…", and so on. */
  action: string
  /**
   * The two supporting lines beneath it. Each is set with `textContent`, which
   * is the load-bearing half of rendering a filename safely: a name like
   * `<img src=x onerror="…">.jpg` must appear as those characters and never be
   * parsed as markup. Sanitise the value with `#/lib/strings/filename` before
   * passing it here; this function will not do it for you, because it cannot
   * tell which strings are author-controlled.
   */
  supporting: string[]
  /**
   * Lines rendered in the error colour, beneath the supporting text. Same
   * `textContent` treatment and the same caveat: sanitise anything
   * author-derived before passing it.
   */
  error?: string[]
  /** Rendered to the left of the text, at most 130px tall, when present. */
  image?: HTMLElement
}

/**
 * Builds the block. The layout attribute drives column (empty) versus row
 * (with an image) in CSS rather than here, so the two arrangements stay a
 * styling concern.
 */
export function buildImageBlockFrame(options: FrameOptions): HTMLElement {
  const root = document.createElement('div')
  root.setAttribute('data-image-block', '')
  if (options.image) root.setAttribute('data-has-image', '')

  if (options.image) root.appendChild(options.image)

  const content = document.createElement('div')
  content.setAttribute('data-image-block-content', '')
  content.appendChild(buildFeaturedIcon(options.icon))

  const text = document.createElement('div')
  text.setAttribute('data-image-block-text', '')

  const action = document.createElement('span')
  action.setAttribute('data-image-block-action', '')
  action.textContent = options.action
  text.appendChild(action)

  for (const line of options.supporting) {
    const p = document.createElement('span')
    p.setAttribute('data-image-block-supporting', '')
    p.textContent = line
    text.appendChild(p)
  }

  for (const line of options.error ?? []) {
    const p = document.createElement('span')
    p.setAttribute('data-image-block-error', '')
    p.textContent = line
    text.appendChild(p)
  }

  content.appendChild(text)
  root.appendChild(content)
  return root
}

/**
 * Message name the node views send *up* to native.
 *
 * Lives here rather than in `bridges/imageUpload.ts` because that module
 * imports the node - putting it there and importing back would be circular.
 * The bridge's `onEditorMessage` matches on this exact string.
 *
 * **There used to be a second message, `requestPicker`.** Only the toolbar
 * opens a picker now - inserting a block and opening its picker happen in one
 * native action, with no WebView round trip in between - so every click that
 * originates *inside* the WebView, on any block in any state, asks native for
 * the menu instead. The menu itself decides what a placeholder click means
 * (Select image / Delete block) versus an image click (Remove / Replace). See
 * `imageUploadNode.ts` and `imageNodeView.ts` for the two callers.
 */
export const IMAGE_BLOCK_MESSAGES = {
  /** Author clicked a block, of any kind; native shows the matching menu. */
  requestMenu: 'image-block-request-menu',
} as const

/** Copy shared by both nodes, so the two never drift apart. */
export const IMAGE_BLOCK_COPY = {
  clickToUpload: 'Click to upload',
  uploading: 'Uploading…',
  uploaded: 'Your image is uploaded! Click to edit.',
  formats: 'PNG, JPG or GIF',
  /*
   * Shown in place of the filename when the picker reported none. The format
   * hint was used here originally and read as a bug: identical to the *idle*
   * block's supporting line, so a successfully uploaded image looked like one
   * still waiting to be chosen. Confirming the upload is the honest thing to
   * say when there is no name to show.
   */
  uploadedNoName: 'File was uploaded successfully.',
  /** Action line for the too-large state (Figma 263:4172). */
  selectNewImage: 'Select a new image',
  /*
   * The size is interpolated because a limit stated without the actual figure
   * leaves the author guessing how far over they are.
   */
  tooLarge: (size: string) =>
    `That image is too large (${size}). Click to choose another.`,
  tooLargeLimit: 'Images must be under 3 MB.',
  /** Figma 263:4205 keeps the idle action line and adds this beneath it. */
  uploadFailed: "Couldn't upload that image. Click to try again.",
  notVisible:
    '(The image is not visible here in the composer, but you can see how it looks by previewing your article.)',
} as const
