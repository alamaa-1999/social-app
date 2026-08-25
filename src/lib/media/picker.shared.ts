import {
  type ImagePickerOptions,
  launchImageLibraryAsync,
  UIImagePickerPreferredAssetRepresentationMode,
  VideoExportPreset,
} from 'expo-image-picker'
import {t} from '@lingui/core/macro'

import {type ImageMeta} from '#/state/gallery'
import * as Toast from '#/components/Toast'
import {IS_IOS, IS_WEB} from '#/env'
import {VIDEO_MAX_DURATION_MS} from '../constants'
import {getDataUriSize} from './util'

export type PickerImage = ImageMeta & {
  size: number
}

export async function openPicker(opts?: ImagePickerOptions) {
  const response = await launchImageLibraryAsync({
    exif: false,
    mediaTypes: ['images'],
    quality: 1,
    selectionLimit: 1,
    ...opts,
    legacy: true,
    preferredAssetRepresentationMode:
      UIImagePickerPreferredAssetRepresentationMode.Automatic,
  })

  return (response.assets ?? [])
    .filter(asset => {
      if (asset.mimeType?.startsWith('image/')) return true
      Toast.show(t`Only image files are supported`, {
        type: 'warning',
      })
      return false
    })
    .map(image => ({
      mime: image.mimeType || 'image/jpeg',
      height: image.height,
      width: image.width,
      path: image.uri,
      size: getDataUriSize(image.uri),
      /*
       * Additive, and optional on purpose. The article composer shows this in
       * the body-image placeholder so an author can tell which image sits
       * where while it cannot be rendered. Expo reports it as
       * `string | null | undefined` and genuinely omits it for some
       * camera-roll assets, so every consumer has to cope with its absence
       * rather than assume a name is always there.
       *
       * Display only. It is never used to build a path or a URL, and any
       * surface that renders it must sanitise first - see
       * `#/lib/strings/filename`.
       */
      fileName: image.fileName ?? undefined,
    }))
}

export async function openUnifiedPicker({
  selectionCountRemaining,
  videoMaxDurationMs = VIDEO_MAX_DURATION_MS,
}: {
  selectionCountRemaining: number
  videoMaxDurationMs?: number
}) {
  return await launchImageLibraryAsync({
    exif: false,
    mediaTypes: ['images', 'videos'],
    quality: 1,
    allowsMultipleSelection: true,
    legacy: true,
    base64: IS_WEB,
    selectionLimit: IS_IOS ? selectionCountRemaining : undefined,
    preferredAssetRepresentationMode:
      UIImagePickerPreferredAssetRepresentationMode.Automatic,
    videoExportPreset: VideoExportPreset.Passthrough,
    videoMaxDuration: videoMaxDurationMs / 1000,
  })
}
