/**
 * Serve the browser check, so a browser can run it.
 *
 * Bundles `harness.ts` the way a consumer's bundler would — for a browser, with
 * the substitutions this repository's packages declare — serves it as a page,
 * and answers the WebSocket the page opens. Then a browser is pointed at it and
 * the page says what worked.
 *
 * **The substitutions are read, not written.** Each package's `package.json`
 * declares which modules a browser gets instead, in the `browser` field, and
 * this applies exactly that map. The bundle is built from source rather than
 * from `dist` — it reaches into the test-only datacenter, which is not
 * published — and the `browser` field addresses published paths, so a small
 * plugin translates one to the other. What that plugin must not do is decide
 * anything: the map comes from the packages, and `bundle/browser-builtins`
 * checks the field itself against built output, through the resolver rather
 * than through anything here.
 */

import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { build, type Plugin } from 'esbuild'
import { REGISTRY as API } from '../../../packages/mtproto/src/generated/api/registry.js'
import { REGISTRY as CORE } from '../../../packages/mtproto/src/generated/core/registry.js'
import { REGISTRY as MTPROTO } from '../../../packages/mtproto/src/generated/mtproto/registry.js'
import type { TlValue } from '../../../packages/mtproto/src/tl/index.js'
import { TlScope } from '../../../packages/mtproto/src/tl/index.js'
import { MockDatacenter } from '../../../packages/mtproto/test/server/datacenter.js'
import { createServerKey } from '../../../packages/mtproto/test/server/keys.js'
import type { MockServer } from '../../../packages/mtproto/test/server/server.js'
import { serveWebSockets, type WebSocketPeer } from './websocket-server.js'

/** Where the repository root is, from here. */
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

/** Windows separators are not path separators to a bundler. */
const posix = (path: string): string => path.split(String.fromCharCode(92)).join('/')

/** The packages whose `browser` field applies. */
const PACKAGES = ['core', 'bot-api', 'mtproto', 'yuigram']

/** Port to serve on. Fixed so a URL can be written down. */
const PORT = Number(process.env['PORT'] ?? 5177)

/**
 * The substitutions the packages declare, as source paths.
 *
 * `./dist/x/y.js` in a published package is `src/x/y.ts` here, so the same map
 * that a bundler applies to built output is applied to what it was built from.
 */
function substitutions(): Map<string, string> {
  const map = new Map<string, string>()

  for (const name of PACKAGES) {
    const manifest = JSON.parse(readFileSync(`${ROOT}packages/${name}/package.json`, 'utf8')) as {
      browser?: Record<string, string>
    }

    for (const [from, to] of Object.entries(manifest.browser ?? {})) {
      const source = (path: string): string =>
        `${ROOT}packages/${name}/${path.replace(/^\.\/dist\//, 'src/').replace(/\.js$/, '.ts')}`

      map.set(source(from).split('\\').join('/'), source(to).split('\\').join('/'))
    }
  }

  return map
}

/** Where a package's source lives, by the name it is imported under. */
const SOURCES = new Map(
  PACKAGES.map((name) => [
    name === 'yuigram' ? 'yuigram' : `@yuigram/${name}`,
    posix(`${ROOT}packages/${name}/src/index.ts`),
  ]),
)

/**
 * Resolve everything to source, and apply the declared substitutions.
 *
 * The whole graph comes from `src` rather than `dist` — the harness reaches into
 * the test-only datacenter, which is not built — so the workspace specifiers are
 * pointed at source too. What decides which module a browser gets is still the
 * packages' own `browser` field: the map is read from them and applied here, not
 * written here.
 */
function browserField(map: ReadonlyMap<string, string>): Plugin {
  return {
    name: 'browser-field',
    setup(builder) {
      builder.onResolve({ filter: /^(@yuigram\/|yuigram$)/ }, (args) => {
        const source = SOURCES.get(args.path)

        return source === undefined ? null : { path: map.get(source) ?? source }
      })

      builder.onResolve({ filter: /\.js$/ }, (args) => {
        if (!args.path.startsWith('.')) return null

        const importer = posix(args.importer)
        // Only what came from TypeScript. A relative import inside built output
        // already names a file that exists.
        if (!/\/(src|test)\//.test(importer)) return null

        const resolved = posix(fileURLToPath(new URL(args.path, `file:///${importer}`)))
        const asSource = resolved.replace(/\.js$/, '.ts')

        return { path: map.get(asSource) ?? asSource }
      })
    },
  }
}

/** The page, with the results filled in by the script it loads. */
const PAGE = `<!doctype html>
<meta charset="utf-8">
<title>Yuigram in a browser</title>
<body style="font: 14px/1.5 system-ui, sans-serif; margin: 24px; max-width: 100ch">
<h1>Yuigram in a browser</h1>
<p>Nothing here is mocked: the cryptography is this page's, the store is this
origin's <code>localStorage</code>, and the connection is a real
<code>WebSocket</code> to the server that sent this page.</p>
<div id="results"><p>running\u2026</p></div>
<script type="module" src="/harness.js"></script>
`

/**
 * The page the harness embeds to be a second browsing context.
 *
 * Served from the same origin, so it shares this origin's `localStorage` and
 * its lock manager, and from a separate document, so it shares no memory with
 * the harness. Both halves are needed: sharing the store is what makes the
 * contention real, and sharing nothing else is what makes it the case a single
 * page cannot construct.
 */
const SECOND_PAGE = `<!doctype html>
<meta charset="utf-8">
<title>a second page of this origin</title>
<body><script type="module" src="/second-page.js"></script>
`

/** Bundle one entry point the way a consumer's bundler would. */
async function bundle(entry: string): Promise<string> {
  const built = await build({
    entryPoints: [`${ROOT}tools/browser/src/${entry}`],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    metafile: true,
    logLevel: 'silent',
    plugins: [browserField(substitutions())],
  })

  const builtins = Object.keys(built.metafile.inputs).filter((path) => path.startsWith('node:'))

  if (builtins.length > 0) {
    process.stderr.write(`the ${entry} bundle reaches ${builtins.join(', ')}\n`)
    process.exit(1)
  }

  return built.outputFiles[0]?.text ?? ''
}

const script = await bundle('harness.ts')
const secondPageScript = await bundle('second-page.ts')

/**
 * The datacenter the page talks to.
 *
 * A real one, in the sense that matters: it performs the exchange, checks the
 * binding, derives message keys, and refuses anything it does not accept. It is
 * the same peer the test suite uses, which is what makes a pass here mean the
 * same thing a pass there does.
 */
const KEY = createServerKey()
const SCOPE = new TlScope('browser-check', [CORE, MTPROTO, API])
const DC = 2

/**
 * The instant both sides work from.
 *
 * The peer stamps its messages from this moment whatever else it is told, so
 * the page is given the same one rather than the machine's. Pinning it also
 * makes the check reproducible: nothing here depends on what day it is.
 */
const ORIGIN_SECONDS = 1_700_000_000

/** Build a datacenter that answers on this address. */
function datacenterAt(): MockDatacenter {
  return new MockDatacenter({
    id: DC,
    host: 'localhost',
    port: PORT,
    key: KEY,
    scope: SCOPE,
    // Both sides work from one fixed instant, and the page is told which. A
    // message identifier encodes the moment it was made and is checked against
    // the offset the exchange established, so what the datacenter says the time
    // is and what its messages claim have to agree — and the peer stamps them
    // from a clock of its own that this cannot set.
    serverTime: ORIGIN_SECONDS,
  })
}

/**
 * One datacenter per endpoint, not one shared between them.
 *
 * A datacenter remembers the long-lived key its client established and checks
 * every later binding against it. The two checks establish their own, so
 * sharing one peer would have the second one's binding refused for naming a key
 * the first had already claimed — which is a fact about this harness and not
 * about either client.
 */
const datacenter = datacenterAt()
const rawDatacenter = datacenterAt()

const server = createServer((request, response) => {
  if (request.url === '/harness.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
    response.end(script)

    return
  }

  if (request.url === '/second-page.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
    response.end(secondPageScript)

    return
  }

  if (request.url === '/second-page') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(SECOND_PAGE)

    return
  }

  if (request.url === '/config') {
    // The page needs the public half of the key to run an exchange at all.
    // Nothing here is a credential: the pair is generated on each start.
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        dc: DC,
        now: ORIGIN_SECONDS * 1000,
        key: { n: KEY.n.toString(), e: KEY.e.toString() },
      }),
    )

    return
  }

  if (request.url === '/deliver') {
    // Push an update down whichever connection is carrying the session, so the
    // page has something to receive that it did not ask for.
    // Something that carries no `pts`. An update with one is held against the
    // account's place in the stream and may be deferred until a difference is
    // fetched, which is a subsystem of its own with its own tests — what is
    // being shown here is that an update crosses the encrypted session at all.
    const sent = deliver({
      _: 'updateShort',
      update: {
        _: 'updateUserTyping',
        user_id: 42n,
        action: { _: 'sendMessageTypingAction' },
      },
      date: ORIGIN_SECONDS,
    })

    response.writeHead(sent ? 200 : 409, { 'content-type': 'text/plain' })
    response.end(sent ? 'sent' : 'no established session to send down')

    return
  }

  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end(PAGE)
})

/**
 * Say what crossed the bridge.
 *
 * Only with `TRACE=1`: the point of the check is the page's own report, and a
 * server printing every frame would bury it. When something does not work, this
 * is the only place that can say whether the bytes even arrived.
 */
const trace: (message: string) => void =
  process.env['TRACE'] === '1' ? (message) => process.stdout.write(`  ${message}\n`) : () => {}

/** The connections the page has open, so an update has somewhere to go. */
const live: { peer: WebSocketPeer; server: MockServer }[] = []

/** Push an update down the newest connection that can carry one. */
function deliver(update: TlValue): boolean {
  for (const entry of [...live].reverse()) {
    if (!entry.peer.open) continue

    const bytes = entry.server.push(update)
    if (bytes === undefined) continue

    entry.peer.send(bytes)

    return true
  }

  return false
}

serveWebSockets(server, {
  // What the transport check opens. It echoes, which is the whole of what that
  // check needs: bytes out, the same bytes in, through a real socket.
  '/echo': (peer) => ({
    onData: (data) => peer.send(data),
  }),

  // What the protocol runs over. The frames a browser sends go in as the
  // client's bytes, and what the datacenter answers goes back out as frames.
  '/mtproto': (peer) => bridge(datacenter, peer),

  // The same, for the check that drives the exchange by hand. Its own peer,
  // because each remembers the long-lived key its client established.
  '/mtproto-raw': (peer) => bridge(rawDatacenter, peer),
})

/** Carry one page's connection into a datacenter, and its answers back out. */
function bridge(
  place: MockDatacenter,
  peer: WebSocketPeer,
): { onData: (data: Uint8Array) => void; onClose: () => void } {
  {
    const before = place.connections.length
    const stream = place.connect({
      host: 'localhost',
      port: PORT,
      onData: (bytes) => {
        trace(`out ${bytes.length}`)
        if (peer.open) peer.send(bytes)
      },
      onClose: (error) => {
        trace(`the datacenter ended the stream${error === undefined ? '' : `: ${error.message}`}`)
        peer.close()
      },
    })

    const opened = place.connections[before]
    if (opened !== undefined) live.push({ peer, server: opened.peer })
    trace(`a page opened connection ${String(before + 1)}`)

    return {
      onData: (data) => {
        const seen = opened?.peer.seen.length ?? 0
        stream.write(data)
        const arrived = (opened?.peer.seen ?? []).slice(seen).map((one) => one.value._)
        trace(`in  ${data.length}${arrived.length === 0 ? '' : `  ${arrived.join(', ')}`}`)
      },
      onClose: () => {
        trace('the page closed the connection')
        stream.close()
      },
    }
  }
}

server.listen(PORT, () => {
  process.stdout.write(`browser check: http://localhost:${PORT}\n`)
  process.stdout.write(`  bundle ${(script.length / 1024).toFixed(0)} KB, no Node built-ins\n`)
})
