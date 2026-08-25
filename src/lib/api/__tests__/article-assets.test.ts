import {
  blobCid,
  cidsInMarkdown,
  MAX_BODY_IMAGE_BYTES,
  MAX_BODY_IMAGES,
  resolveBodyImages,
} from '#/lib/api/article-assets'

const DID = 'did:plc:testauthor123'
const HOST = 'https://pds.example'

/** Mirrors what `ArticleCompose`'s `blobUrl` writes into the markdown. */
function blobUrl(cid: string, did = DID) {
  return `${HOST}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
}

/** Minimal stand-in for the current typed `BlobRef` shape. */
function ref(cid: string, name?: string) {
  return {
    image: {
      $type: 'blob' as const,
      ref: {toString: () => cid},
      mimeType: 'image/jpeg',
      size: 1234,
    } as never,
    ...(name ? {name} : {}),
  }
}

describe('cidsInMarkdown', () => {
  it('finds the cid of an embedded image', () => {
    const md = `Some text\n\n![](${blobUrl('bafkreiaaa')})\n\nMore text`
    expect([...cidsInMarkdown(md)]).toEqual(['bafkreiaaa'])
  })

  it('returns nothing for a body with no images', () => {
    expect(
      cidsInMarkdown('Just words, and a [link](https://example.com).').size,
    ).toBe(0)
  })

  it('collapses the same image used twice', () => {
    const url = blobUrl('bafkreibbb')
    const md = `![](${url})\n\ntext\n\n![](${url})`
    expect([...cidsInMarkdown(md)]).toEqual(['bafkreibbb'])
  })

  it('finds several distinct images', () => {
    const md = `![](${blobUrl('cid1')}) ![](${blobUrl('cid2')})`
    expect([...cidsInMarkdown(md)].sort()).toEqual(['cid1', 'cid2'])
  })

  it('ignores non-getBlob image URLs', () => {
    const md = `![](https://example.com/photo.jpg?cid=notablob)`
    expect(cidsInMarkdown(md).size).toBe(0)
  })

  it('tolerates the cid parameter appearing before did', () => {
    const md = `![](${HOST}/xrpc/com.atproto.sync.getBlob?cid=bafkreiccc&did=${DID})`
    expect([...cidsInMarkdown(md)]).toEqual(['bafkreiccc'])
  })

  /*
   * Over-matching is deliberate: keeping a blob nothing displays is a small
   * leak, whereas missing one gets it permanently deleted by
   * `deleteDereferencedBlobs`. A bare URL is still evidence the author means
   * to keep that blob.
   */
  it('matches a getBlob URL that is not in image syntax', () => {
    const md = `See ${blobUrl('bafkreiddd')} for the original.`
    expect([...cidsInMarkdown(md)]).toEqual(['bafkreiddd'])
  })

  it('skips a malformed percent-escape rather than throwing', () => {
    const md = `![](${HOST}/xrpc/com.atproto.sync.getBlob?did=${DID}&cid=%E0%A4%A)`
    expect(() => cidsInMarkdown(md)).not.toThrow()
    expect(cidsInMarkdown(md).size).toBe(0)
  })
})

describe('resolveBodyImages', () => {
  it('returns the refs for images present in the body', () => {
    const md = `![](${blobUrl('cid1')})`
    const {images, missing} = resolveBodyImages(md, [ref('cid1'), ref('cid2')])
    expect(images).toHaveLength(1)
    expect(blobCid(images[0].image)).toBe('cid1')
    expect(missing).toEqual([])
  })

  it('drops refs whose image is no longer in the body', () => {
    const md = `![](${blobUrl('cid1')})`
    const {images} = resolveBodyImages(md, [ref('cid1'), ref('cid2')])
    expect(images.map(i => blobCid(i.image))).toEqual(['cid1'])
  })

  /*
   * The whole point of the module: a CID that appears in markdown but that we
   * hold no ref for cannot become a blob reference. Pasting somebody else's
   * getBlob URL must not produce a writable ref.
   */
  it('never invents a ref for an unknown cid', () => {
    const md = `![](${blobUrl('someoneElsesCid', 'did:plc:stranger')})`
    const {images, missing} = resolveBodyImages(md, [ref('cid1')])
    expect(images).toEqual([])
    expect(missing).toEqual(['someoneElsesCid'])
  })

  it('reports a body image we have no ref for, without dropping the rest', () => {
    const md = `![](${blobUrl('cid1')}) ![](${blobUrl('legacyCid')})`
    const {images, missing} = resolveBodyImages(md, [ref('cid1')])
    expect(images.map(i => blobCid(i.image))).toEqual(['cid1'])
    expect(missing).toEqual(['legacyCid'])
  })

  it('lets a later ref win on cid collision, so this session overlays the record', () => {
    const md = `![](${blobUrl('cid1')})`
    const stale = ref('cid1', 'old.jpg')
    const fresh = ref('cid1', 'new.jpg')
    const {images} = resolveBodyImages(md, [stale, fresh])
    expect(images).toHaveLength(1)
    expect(images[0].image).toBe(fresh.image)
  })

  it('produces an empty list for a body with no images', () => {
    const {images, missing} = resolveBodyImages('no images here', [ref('cid1')])
    expect(images).toEqual([])
    expect(missing).toEqual([])
  })
})

describe('blobCid', () => {
  it('reads the current typed ref shape', () => {
    expect(blobCid({ref: {toString: () => 'bafkreiaaa'}})).toBe('bafkreiaaa')
  })

  it('reads the legacy string-cid shape', () => {
    expect(blobCid({cid: 'bafkreibbb'})).toBe('bafkreibbb')
  })

  it('returns undefined for anything else', () => {
    expect(blobCid(undefined)).toBeUndefined()
    expect(blobCid(null)).toBeUndefined()
    expect(blobCid('bafkrei')).toBeUndefined()
    expect(blobCid({})).toBeUndefined()
  })
})

/*
 * These caps are enforced client-side, before upload, so the author finds out
 * immediately rather than at publish. That only helps if they still match what
 * the record actually permits - a drifted limit either blocks an image the
 * server would have accepted, or waves through one it will reject later. The
 * lexicon is read from disk rather than restated here, so this fails if either
 * side moves without the other.
 */
describe('body image caps match the lexicon', () => {
  /*
   * Typed rather than left as `any`. A structural type here is not ceremony:
   * it means a lexicon reshaped so these paths no longer exist fails to
   * compile, instead of the assertions silently comparing `undefined`.
   */
  type AssetsLexicon = {
    defs: {
      main: {record: {properties: {images: {maxLength: number}}}}
      image: {properties: {image: {maxSize: number}}}
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const lexicon =
    require('../../../../lexicons/com/sunnahsky/article/assets.json') as AssetsLexicon

  it('MAX_BODY_IMAGES matches images.maxLength', () => {
    expect(MAX_BODY_IMAGES).toBe(
      lexicon.defs.main.record.properties.images.maxLength,
    )
  })

  it('MAX_BODY_IMAGE_BYTES matches the blob maxSize', () => {
    expect(MAX_BODY_IMAGE_BYTES).toBe(
      lexicon.defs.image.properties.image.maxSize,
    )
  })

  it('stays under the PDS blobUploadLimit default of 5MB', () => {
    expect(MAX_BODY_IMAGE_BYTES).toBeLessThan(5 * 1024 * 1024)
  })
})
