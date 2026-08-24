#!/usr/bin/env node
/**
 * This app has a permanent v2/v3 TipTap split: `@tiptap/core@^2.9.1` is a
 * real, intentional top-level dependency for the unrelated web post-
 * composer's mention/hashtag autocomplete, while ArticleCompose's TipTap
 * editor and its `@tiptap/markdown` serializer need v3 throughout. Every
 * v3 `@tiptap/*` package that bare-imports `@tiptap/core` (a regular
 * dependency, not a peer) resolves correctly via Node's directory-walk
 * module resolution once `pnpm-workspace.yaml`'s `packageExtensions` gives
 * it a real, non-peer dependency edge - this is the `@10play/tentap-editor`
 * paragraph/text fix, confirmed working.
 *
 * Packages that declare `@tiptap/core` as a *peerDependency* are a
 * different, unsolved case: `packageExtensions`' `dependencies` injection
 * is silently overridden whenever the same package name is already a
 * peerDependency of that manifest - confirmed by hand across four
 * different attempts (plain semver, exact `npm:` pin, rewriting
 * `peerDependencies` directly, marking it optional via
 * `peerDependenciesMeta`), none of which changed the resolved version.
 * `@tiptap/markdown` and `@tiptap/extension-text-align` both fall into
 * this category and BOTH currently still resolve their `@tiptap/core`
 * peer to the wrong v2 instance - confirmed to be a real, live bug, not
 * a test-only artifact, because `pnpm run editor:build`'s actual Vite
 * production build fails outright the moment `@tiptap/markdown` is wired
 * into the real editor bundle (`"attrsEqual" is not exported by
 * "@tiptap/core"` - a v3-only utility function genuinely absent from the
 * v2 build, not merely incompatible with it).
 *
 * This script exists specifically so that gap can never again go
 * unnoticed the way it did for most of a session: it resolves
 * `@tiptap/core` exactly the way Node itself would from inside each
 * listed package's own directory (the same resolution algorithm Vite's
 * default resolver follows for bare specifiers), and fails loudly - never
 * silently - if any of them isn't v3. Run via `pnpm tiptap:verify`; wire
 * into CI or a pre-build step once the underlying resolution bug is
 * actually fixed, so a future dependency bump can't silently reintroduce
 * it without being caught.
 */
import {createRequire} from 'node:module'
import path from 'node:path'
import {fileURLToPath} from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

/**
 * Each check resolves `checkPackage` exactly as its real consumer would -
 * `resolveFrom: null` means "as this app's own top-level code imports it"
 * (repo root); a package name means "as that specific package's own
 * internal bare import resolves it," which matters whenever a package name
 * has more than one physical copy installed.
 *
 * `@tiptap/extension-document`/`paragraph`/`text`: this app's own top-level
 * `package.json` pins them at v2.9.1 for the unrelated web post-composer (a
 * real, intentional pin, not a bug) - checking those three from repo root
 * would correctly report v2 and mean nothing, since the actual consumer
 * that needs v3 is `@10play/tentap-editor`'s own `CoreBridge`, which
 * resolves them from *its own* directory, not the app's.
 *
 * `@tiptap/markdown`/`extension-text-align`: neither of the above patterns
 * (self-manifest injection, or a new consumer edge) can fix these two -
 * both already exist at the correct v3.30.2 *themselves*, so there is only
 * one physical copy anywhere and nothing for pnpm to duplicate; only an
 * explicit alias (a distinct dependency name with no prior instance to
 * reuse) forces a genuinely separate, correctly-resolved copy. Real code
 * must import these two via the alias names below, never the bare package
 * name - so that's what gets checked here too.
 */
const CHECKS = [
  {resolveFrom: null, checkPackage: 'tiptap-markdown-fixed'},
  {resolveFrom: null, checkPackage: 'tiptap-extension-text-align-fixed'},
  {resolveFrom: '@10play/tentap-editor', checkPackage: '@tiptap/extension-document'},
  {resolveFrom: '@10play/tentap-editor', checkPackage: '@tiptap/extension-paragraph'},
  {resolveFrom: '@10play/tentap-editor', checkPackage: '@tiptap/extension-text'},
  {resolveFrom: null, checkPackage: '@tiptap/extension-bold'},
  {resolveFrom: null, checkPackage: '@tiptap/extension-italic'},
  {resolveFrom: null, checkPackage: '@tiptap/extension-strike'},
  {resolveFrom: null, checkPackage: '@tiptap/extension-blockquote'},
  {resolveFrom: null, checkPackage: '@tiptap/extension-underline'},
  {resolveFrom: null, checkPackage: '@tiptap/extension-text-style'},
  {resolveFrom: null, checkPackage: '@tiptap/extension-color'},
]

const REQUIRED_MAJOR = 3

function resolvePackageDir(pkgName, fromDir) {
  const entry = require.resolve(pkgName, {paths: [fromDir]})
  return entry.slice(0, entry.indexOf(pkgName) + pkgName.length)
}

function checkOne({resolveFrom, checkPackage}) {
  const anchorDir = resolveFrom ? resolvePackageDir(resolveFrom, repoRoot) : repoRoot
  const pkgDir = resolvePackageDir(checkPackage, anchorDir)
  const coreDir = resolvePackageDir('@tiptap/core', pkgDir)
  const {version} = require(path.join(coreDir, 'package.json'))
  const major = parseInt(version.split('.')[0], 10)
  return {ok: major === REQUIRED_MAJOR, version}
}

let failed = false
for (const check of CHECKS) {
  const label = check.resolveFrom
    ? `${check.checkPackage} (as resolved by ${check.resolveFrom})`
    : check.checkPackage
  let result
  try {
    result = checkOne(check)
  } catch (err) {
    console.error(`[tiptap:verify] FAIL  ${label} - could not resolve: ${err.message}`)
    failed = true
    continue
  }
  if (result.ok) {
    console.log(`[tiptap:verify] OK    ${label} -> @tiptap/core@${result.version}`)
  } else {
    console.error(
      `[tiptap:verify] FAIL  ${label} -> @tiptap/core@${result.version} (need v${REQUIRED_MAJOR}.x)`,
    )
    failed = true
  }
}

if (failed) {
  console.error(
    '\n[tiptap:verify] One or more @tiptap/* packages are resolving @tiptap/core to the wrong major version.\n' +
      'This app intentionally keeps @tiptap/core@2.x at the top level for the unrelated web post-composer -\n' +
      'every v3-needing package must get its own correctly-nested v3 copy instead. See this script\'s own\n' +
      'doc comment and Sunnahsky_Week3_Engineering_Notes.md\'s TipTap section for the full history.',
  )
  process.exit(1)
}
console.log('\n[tiptap:verify] All listed packages resolve @tiptap/core to v3. OK.')
