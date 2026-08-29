import {useState} from 'react'
import {Image, View} from 'react-native'
import {Trans} from '@lingui/react/macro'

import {cidFromSrc} from '#/lib/api/article-assets'
import {atoms as a, useTheme} from '#/alf'
import {Text} from '#/components/Typography'

/**
 * Renders one article body/cover image, in both the public reader and the
 * pre-publish preview.
 *
 * `localImageUris` (CID -> local file URI) is how the preview shows a real
 * thumbnail before publish, when the blob is still untethered and `getBlob`
 * would 404 - see `encapsulated-squishing-thacker.md`'s "Image handling"
 * section. The published reader passes no `localImageUris` at all, since by
 * then the blob is tethered and `src` itself already resolves.
 *
 * `cidFromSrc` is the actual security boundary here, not an implementation
 * detail: it returns a CID only when `src` is hosted at a trusted Sunnahsky
 * origin, so a foreign document's `![](https://tracker.example/pixel.png)`
 * never reaches `<Image>` at all, in either mode - the reader renders other
 * accounts' documents, and nothing should auto-fetch an arbitrary URL just
 * because it appeared in one.
 */
export function ArticleImage({
  src,
  alt,
  localImageUris,
}: {
  src: string
  alt?: string
  localImageUris?: Record<string, string>
}) {
  const t = useTheme()
  const [failed, setFailed] = useState(false)

  const cid = cidFromSrc(src)
  const uri = cid ? (localImageUris ? localImageUris[cid] : src) : undefined

  if (!uri || failed) {
    return (
      <View
        style={[
          a.w_full,
          a.align_center,
          a.justify_center,
          a.rounded_sm,
          a.py_2xl,
          t.atoms.bg_contrast_25,
        ]}>
        <Text style={[a.text_sm, t.atoms.text_contrast_medium]}>
          <Trans>Image unavailable</Trans>
        </Text>
      </View>
    )
  }

  return (
    <Image
      source={{uri}}
      accessibilityLabel={alt}
      accessibilityHint=""
      accessibilityIgnoresInvertColors
      style={[a.w_full, a.rounded_sm, {aspectRatio: 4096 / 2731}]}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  )
}
