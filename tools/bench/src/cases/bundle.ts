// SPDX-License-Identifier: MIT

/**
 * What an application ships when it depends on this.
 *
 * `docs/performance.md` §7 budgets a bot-only application at under 150 KB
 * min+gzip and one that also runs an account at under 500 KB, and names the
 * mechanisms that are supposed to hold them: tree-shaking, MTProto excluded
 * when unused, and lazy TL tables.
 *
 * Those mechanisms were established and never measured. `startup/import` and
 * the `eager-surfaces` invariant hold the *runtime* graph small — what Node
 * evaluates when a program starts — which is a different claim from what a
 * bundler can shake out. A build tool sees `sideEffects: false` and the import
 * graph, resolves what each entry actually reaches, and discards the rest; only
 * a bundler can say whether that works. §7's own note says the bot-only figure
 * "requires that importing `yuigram` does not pull the MTProto subsystem into
 * the graph", and this is the measurement that would notice if it did.
 *
 * Measured against the built package rather than the sources, because the
 * `exports` map, the declaration of `sideEffects` and the emitted module
 * boundaries are all part of what a bundler resolves — and all of them are
 * properties of the build rather than of the repository.
 *
 * The third budget in §7, serverless cold start, is not here. It is a property
 * of a platform rather than of this package, and the mechanism it names — a
 * small eager surface, with the webhook path avoiding MTProto — is what
 * `startup/import` and `eager-surfaces` already hold. Reporting a number
 * measured on a developer's machine as though it were a cold start would be
 * inventing an acceptance criterion the specification does not state.
 */

import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'
import type { Benchmark, Measurement } from '../budget.js'

/** The budgets §7 sets, in kilobytes of minified and compressed output. */
const BOT_ONLY = 150
const FULL = 500
const SOURCE = 'performance.md §7'

/**
 * The directory the built entry point sits in.
 *
 * Resolved through `fileURLToPath` rather than a URL's path, because on Windows
 * the two differ by a leading slash and esbuild is given a filesystem path.
 * Programs below import `./index.js` relative to it, so the specifier stays a
 * specifier rather than a path spliced into a string.
 */
const DIST = fileURLToPath(new URL('../../../../packages/yuigram/dist/', import.meta.url))

/**
 * Bundle a program written against the façade and report what it weighs.
 *
 * Minified and gzipped, because that is the form §7 budgets and the form that
 * crosses a network. Node's built-ins are left external: they are on the
 * platform already and counting them would measure the runtime rather than this
 * package.
 */
async function bundleOf(name: string, program: string) {
  const result = await build({
    stdin: {
      contents: program,
      resolveDir: DIST,
      sourcefile: `${name}.ts`,
      loader: 'js',
    },
    bundle: true,
    minify: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    treeShaking: true,
    write: false,
    metafile: true,
    legalComments: 'none',
  })

  const output = result.outputFiles?.[0]
  if (output === undefined) throw new Error(`bundling '${name}' produced nothing`)

  return { bytes: output.contents, metafile: result.metafile }
}

async function weigh(name: string, program: string): Promise<Measurement> {
  const { bytes } = await bundleOf(name, program)
  const gzipped = gzipSync(bytes, { level: 9 })

  return {
    name,
    value: gzipped.byteLength / 1024,
    unit: 'KB',
    note: `${Math.round(bytes.byteLength / 1024)} KB before gzip`,
  }
}

/**
 * How much of the MTProto subsystem reached a bundle.
 *
 * §7 states that the bot-only figure "requires that importing `yuigram` does not
 * pull the MTProto subsystem into the graph". The figure alone does not hold
 * that: the whole framework fits under 150 KB compressed, so a bot-only bundle
 * that dragged all of MTProto in would still be inside its budget. The
 * requirement is a separate claim and needs a separate measurement.
 *
 * Attribution comes from the bundler's own accounting rather than from
 * searching the output for something recognisable, which minification is free
 * to rename. The budget is zero because §7's word is "not".
 */
export function mtprotoShare(inputs: Readonly<Record<string, { bytesInOutput: number }>>): {
  readonly bytes: number
  readonly modules: readonly string[]
} {
  let bytes = 0
  const modules: string[] = []

  for (const [path, input] of Object.entries(inputs)) {
    // Separators differ by platform and the marker has to match either. A
    // prefix test would miss it as well: the bundler reports a path relative to
    // wherever it was invoked from, not from the repository root.
    if (!path.split('\\').join('/').includes('packages/mtproto/')) continue

    bytes += input.bytesInOutput
    modules.push(path)
  }

  return { bytes, modules }
}

async function mtprotoIn(name: string, program: string): Promise<Measurement> {
  const { metafile } = await bundleOf(name, program)
  const { bytes, modules } = mtprotoShare(Object.values(metafile.outputs)[0]?.inputs ?? {})

  return {
    name,
    value: bytes / 1024,
    unit: 'KB',
    note:
      modules.length === 0
        ? 'no MTProto module reached the bundle'
        : `${modules.length} MTProto modules, first ${modules[0] ?? ''}`,
  }
}

/**
 * A program that only runs a bot.
 *
 * Every symbol is used, so nothing survives that the program does not ask for
 * and nothing is dropped that it does. A file that imported without using would
 * measure whatever the bundler felt like keeping.
 */
const BOT_PROGRAM = `
import { Bot, InlineKeyboard, f, html, memory, session } from './index.js'

const bot = Bot.fromToken(process.env.TOKEN ?? '')
bot.extend(session({ storage: memory() }))
bot.on('message', f.text(), (message) => message.reply(html\`hi\`, {
  reply_markup: new InlineKeyboard().text('ok', 'ok'),
}))

export default bot
`

/** The same, plus an account — which is what pulls MTProto in. */
const FULL_PROGRAM = `
import { Account, App, Bot, memory } from './index.js'

const app = new App({ storage: memory() })
app.add(Bot.fromToken(process.env.TOKEN ?? ''))
app.add(new Account({
  apiId: Number(process.env.API_ID),
  apiHash: process.env.API_HASH ?? '',
  keys: [],
  storage: memory(),
  bootstrap: { thisDc: 2, testMode: false, options: [] },
}))

export default app
`

const botOnly: Benchmark = {
  name: 'bundle/bot',
  budget: BOT_ONLY,
  source: SOURCE,
  run: async () => await weigh('bundle/bot', BOT_PROGRAM),
}

const full: Benchmark = {
  name: 'bundle/full',
  budget: FULL,
  source: SOURCE,
  run: async () => await weigh('bundle/full', FULL_PROGRAM),
}

/**
 * The packaging claim §7 attaches to the bot-only budget.
 *
 * Kept beside the figures rather than folded into one of them, because it fails
 * for a different reason: a bundle can be well inside its budget and still carry
 * a subsystem it never uses — the whole framework compresses to less than the
 * bot-only allowance — so the size alone cannot hold the exclusion. A reader
 * looking at a breach needs to know which of the two happened.
 */
const botExcludesMtproto: Benchmark = {
  name: 'bundle/bot-mtproto',
  budget: 0,
  source: SOURCE,
  run: async () => await mtprotoIn('bundle/bot-mtproto', BOT_PROGRAM),
}

/**
 * What a browser-targeted bundle reaches that a browser does not have.
 *
 * The package ships a second implementation of everything a browser lacks — the
 * cryptography, the connector, the decompressor, the stores that need a
 * filesystem — and lets the `browser` field in `package.json` choose between
 * them. That choice is made by the bundler, invisibly, and it is exactly the
 * sort of configuration that stops working without anything failing: the build
 * still succeeds, and what breaks is a program in a browser reaching for a
 * module that is not there.
 *
 * So it is counted. Every Node built-in in the graph, not only `node:crypto`: a
 * bundle that reaches `node:fs` is just as broken and fails the same way. The
 * budget is zero because a browser has none of them.
 *
 * `docs/runtimes.md` §4 records which substitution answers which built-in.
 */
async function builtinsIn(name: string, program: string): Promise<Measurement> {
  let reached: string[]

  try {
    const result = await build({
      stdin: { contents: program, resolveDir: DIST, sourcefile: `${name}.ts`, loader: 'js' },
      bundle: true,
      format: 'esm',
      platform: 'browser',
      write: false,
      metafile: true,
      logLevel: 'silent',
    })

    reached = Object.keys(result.metafile.inputs).filter((path) => path.startsWith('node:'))
  } catch (error) {
    // A failure to resolve is the same finding as a built-in in the graph, and
    // is how esbuild reports one it cannot substitute. Reported as the count it
    // is rather than as a crash, so the verdict line says what happened.
    const message = error instanceof Error ? error.message : String(error)
    const named = [...message.matchAll(/Could not resolve "(node:[^"]+)"/g)].map(
      (match) => match[1] ?? '',
    )

    reached = named.length > 0 ? [...new Set(named)] : ['(the bundle did not build)']
  }

  return {
    name,
    value: reached.length,
    unit: 'built-ins',
    note:
      reached.length === 0
        ? 'the browser bundle reaches nothing a browser does not have'
        : reached.join(', '),
  }
}

/**
 * A browser program: an account, a store a browser has, and a connector it can
 * open. Every symbol is used, so the graph is what such a program really pulls.
 */
const BROWSER_PROGRAM = `
import { Account, App, web } from './index.js'

const app = new App({ storage: web({ storage: globalThis.localStorage }) })
app.add(new Account({
  apiId: 1,
  apiHash: '',
  keys: [],
  storage: web({ storage: globalThis.localStorage }),
  bootstrap: { thisDc: 2, testMode: false, options: [] },
}))

export default app
`

const browserReachesNoBuiltins: Benchmark = {
  name: 'bundle/browser-builtins',
  budget: 0,
  source: SOURCE,
  run: async () => await builtinsIn('bundle/browser-builtins', BROWSER_PROGRAM),
}

/**
 * A page that checks Mini App launch data where it runs: the third-party check,
 * which needs no token. The entry point is written against the Web Crypto API
 * alone, so it has no substitute to fall back on — a built-in here is a bug.
 */
const WEB_APP_PROGRAM = `
import { verifyInitDataSignature } from './web-app.js'

export default (initData) => verifyInitDataSignature(initData, { botId: 1, maxAge: 3600 })
`

const webAppReachesNoBuiltins: Benchmark = {
  name: 'bundle/web-app-builtins',
  budget: 0,
  source: SOURCE,
  run: async () => await builtinsIn('bundle/web-app-builtins', WEB_APP_PROGRAM),
}

export const BUNDLE: readonly Benchmark[] = [
  botOnly,
  botExcludesMtproto,
  full,
  browserReachesNoBuiltins,
  webAppReachesNoBuiltins,
]
