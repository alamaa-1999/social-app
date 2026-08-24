import {exec} from 'node:child_process'
import react from '@vitejs/plugin-react'
import {defineConfig} from 'vite'
import {viteSingleFile} from 'vite-plugin-singlefile'

/**
 * Builds ArticleCompose's body editor into a single-file HTML bundle, per
 * TenTap's advanced-setup pattern (`10play/10TapAdvancedExample`). Output is
 * post-processed by `@10play/tentap-editor`'s own `buildEditor.js` script
 * into a TS module exporting the HTML as a string (`editorHtml`), which the
 * native side imports directly - see `package.json`'s `editor:build` script.
 */
export default defineConfig({
  root: 'src/screens/ArticleCompose/editor-web',
  build: {
    outDir: 'build',
    emptyOutDir: false,
  },
  resolve: {
    alias: [
      {
        // Web bundle should only ever pull in tentap-editor's web-side code,
        // never anything that assumes a React Native runtime.
        find: '@10play/tentap-editor',
        replacement: '@10play/tentap-editor/web',
      },
      {
        find: '@tiptap/pm/view',
        replacement: '@10play/tentap-editor/web',
      },
      {
        find: '@tiptap/pm/state',
        replacement: '@10play/tentap-editor/web',
      },
    ],
  },
  plugins: [
    react(),
    viteSingleFile(),
    {
      name: 'postbuild-commands',
      closeBundle: async () => {
        exec('pnpm editor:post-build', (error, _stdout, stderr) => {
          if (error) {
            console.error(`exec error: ${error}`)
            console.error(stderr)
          }
        })
      },
    },
  ],
  server: {
    port: 3010,
  },
})
