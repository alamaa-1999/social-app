import React from 'react'
import {createRoot} from 'react-dom/client'

import {AdvancedEditor} from './AdvancedEditor'

/**
 * Entrypoint for the WebView-hosted half of ArticleCompose's body editor,
 * built separately by Vite (`editor-web/vite.config.ts`) into a single-file
 * HTML string consumed by `useEditorBridge({customSource: editorHtml})` on
 * the native side.
 */

declare global {
  interface Window {
    contentInjected: boolean | undefined
  }
}

/**
 * On Android, `react-native-webview` has a known bug where injected content
 * can arrive after the window has already loaded
 * (react-native-webview/react-native-webview#2960) - mirrors TenTap's own
 * advanced-setup example, which hits and works around this exact issue.
 * Polling for `window.contentInjected` before mounting avoids racing it.
 */
const interval = setInterval(() => {
  if (!window.contentInjected) return
  const container = document.getElementById('root')
  const root = createRoot(container!)
  root.render(<AdvancedEditor />)
  clearInterval(interval)
}, 1)
