import * as tentap from '@10play/tentap-editor'

/**
 * Sends a message from inside the editor WebView out to the React Native side.
 *
 * Exists to paper over a packaging gap rather than a design one.
 * `@10play/tentap-editor`'s web bundle really does export `sendMessage` - it is
 * one of the four named exports of `lib-web/index.mjs`, and
 * `lib-web/typescript/useTenTap.d.ts` declares it as
 * `(message: EditorMessage) => void`. But the package's `./web` entry points
 * its `types` at `lib-web/typescript/webEditorUtils/index.d.ts`, which is an
 * empty file, so none of those declarations are reachable. TypeScript
 * meanwhile resolves the bare specifier against the *root* entry, which has no
 * `sendMessage` at all, while this bundle's Vite alias rewrites it to `./web`
 * at build time. The symbol is present at runtime and absent from the types.
 *
 * Narrowed here once, with the reason attached, instead of a cast at every
 * call site. Deliberately not silent if the assumption ever stops holding: a
 * dead click that logs nothing would be extremely hard to trace back to a
 * package upgrade.
 */

export type NativeMessage = {
  type: string
  payload?: unknown
}

export function sendToNative(message: NativeMessage): void {
  const send = (
    tentap as unknown as {
      sendMessage?: (message: NativeMessage) => void
    }
  ).sendMessage

  if (typeof send !== 'function') {
    // eslint-disable-next-line no-console
    console.error(
      '[ArticleCompose] tentap web bundle exposed no sendMessage; ' +
        'image block interactions will not reach native',
    )
    return
  }

  send(message)
}
