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

import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
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
const SOURCES = new Map([
  ...PACKAGES.map(
    (name) =>
      [
        name === 'yuigram' ? 'yuigram' : `@yuigram/${name}`,
        posix(`${ROOT}packages/${name}/src/index.ts`),
      ] as const,
  ),
  // The worker subsystem's own entry point, which \`yuigram/worker\` re-exports
  // and which a program reaches only by naming it.
  ['@yuigram/mtproto/worker', posix(`${ROOT}packages/mtproto/src/worker/index.ts`)] as const,
])

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
<script type="module" src="/web-app-check.js"></script>
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

/**
 * Bundle a check of a published entry point from built output alone.
 *
 * No source is mapped in and nothing is substituted here: the entry is the
 * file a package's `exports` names, its imports are resolved the way a
 * consumer's bundler resolves them, and the packages' own `browser` fields are
 * applied by the bundler itself. A graph that reaches a Node built-in, or a
 * package module that is not built output, is refused rather than served —
 * the claim the page then makes is about the package as it ships.
 */
async function bundleBuilt(entry: string): Promise<{ text: string; modules: number }> {
  const built = await build({
    entryPoints: [`${ROOT}tools/browser/src/${entry}`],
    bundle: true,
    format: 'esm',
    platform: 'browser',
    target: 'es2022',
    write: false,
    metafile: true,
    logLevel: 'silent',
  }).catch((error: unknown) => {
    process.stderr.write(
      `the ${entry} bundle did not build from dist; run \`pnpm build\` first\n${String(error)}\n`,
    )
    process.exit(1)
  })

  const inputs = Object.keys(built.metafile.inputs).map(posix)
  const builtins = inputs.filter((path) => path.startsWith('node:'))
  const unbuilt = inputs.filter((path) => path.includes('packages/') && !path.includes('/dist/'))

  if (builtins.length > 0 || unbuilt.length > 0) {
    process.stderr.write(`the ${entry} bundle reaches ${[...builtins, ...unbuilt].join(', ')}\n`)
    process.exit(1)
  }

  return {
    text: built.outputFiles[0]?.text ?? '',
    modules: inputs.filter((path) => path.includes('/dist/')).length,
  }
}

const script = await bundle('harness.ts')
const webAppCheck = await bundleBuilt('web-app-check.ts')
const secondPageScript = await bundle('second-page.ts')
const workerHostScript = await bundle('worker-host.ts')
const workerTabScript = await bundle('worker-tab.ts')

/** The page the worker checks embed as a second tab of this origin. */
const WORKER_TAB = `<!doctype html>
<meta charset="utf-8">
<title>a second tab on the shared host</title>
<body><script type="module" src="/worker-tab.js"></script>
`

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
 * One datacenter per client, not one shared between them.
 *
 * A datacenter remembers the long-lived key its client established and checks
 * every later binding against it. So each client of this server has its own:
 * the check that drives the exchange by hand, every account a worker hosts, and
 * every page — where a page is whatever holds one set of stored keys. The
 * server names a page's datacenter and the page keeps the name beside those
 * keys, so a reload resumes with the datacenter that saw them. A page that has
 * lost its storage, or whose name this server does not hold because it has
 * restarted since, is given a new name and a datacenter that has never seen it.
 *
 * Without that, a second run against one server stalls rather than fails: the
 * page negotiates a second long-lived key, the datacenter refuses every binding
 * that names it by hanging up, and the client — correctly, for a connection
 * that dropped — tries again for as long as it is left to.
 */
const pageDatacenters = new Map<string, MockDatacenter>()
const pageLive = new Map<string, { peer: WebSocketPeer; server: MockServer }[]>()
const rawDatacenter = datacenterAt()

/** The datacenter a page's name stands for, made the first time it is named. */
function pageDatacenter(name: string): MockDatacenter {
  const existing = pageDatacenters.get(name)
  if (existing !== undefined) return existing

  const made = datacenterAt()
  pageDatacenters.set(name, made)
  pageLive.set(name, [])

  return made
}

/** The page a request names, or the one name every unnamed request shares. */
const clientOf = (address: URL): string => address.searchParams.get('client') ?? 'unnamed'

/** A name no page has had, here or under an earlier run of this server. */
const newPageName = (): string => `page-${randomUUID()}`

/** How many connections a datacenter answered, and how many long-lived keys came of them. */
function seenBy(place: MockDatacenter | undefined): { connections: number; permanentKeys: number } {
  const permanentKeys = (place?.connections ?? []).filter((one) => {
    const settled = one.peer.result

    return settled !== undefined && settled.expiresIn === undefined
  }).length

  return { connections: place?.connections.length ?? 0, permanentKeys }
}

const server = createServer((request, response) => {
  if (request.url === '/harness.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
    response.end(script)

    return
  }

  if (request.url === '/web-app-check.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
    response.end(webAppCheck.text)

    return
  }

  if (request.url === '/second-page.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
    response.end(secondPageScript)

    return
  }

  if (serveWorkerRoute(request.url ?? '/', response)) return

  if (request.url === '/second-page') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(SECOND_PAGE)

    return
  }

  const address = new URL(request.url ?? '/', 'http://localhost')

  if (address.pathname === '/config') {
    // The page needs the public half of the key to run an exchange at all.
    // Nothing here is a credential: the pair is generated on each start.
    //
    // It is also told which datacenter is its own. A page that names one this
    // server holds keeps it, and with it the keys it stored. Any other page —
    // new, emptied, or left over from a server that has since restarted and
    // taken its datacenters with it — is given a new one, and is expected to
    // let go of keys established anywhere else.
    const named = address.searchParams.get('client')
    const client = named !== null && pageDatacenters.has(named) ? named : newPageName()
    pageDatacenter(client)

    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(
      JSON.stringify({
        dc: DC,
        now: ORIGIN_SECONDS * 1000,
        key: { n: KEY.n.toString(), e: KEY.e.toString() },
        client,
      }),
    )

    return
  }

  if (address.pathname === '/stats') {
    // What the page's own datacenter saw of it: a page that resumed a stored
    // session negotiated no long-lived key that the datacenter had not already.
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(seenBy(pageDatacenters.get(clientOf(address)))))

    return
  }

  if (address.pathname === '/deliver') {
    // Push an update down whichever connection is carrying the session, so the
    // page has something to receive that it did not ask for.
    // Something that carries no `pts`. An update with one is held against the
    // account's place in the stream and may be deferred until a difference is
    // fetched, which is a subsystem of its own with its own tests — what is
    // being shown here is that an update crosses the encrypted session at all.
    const sent = deliverTo(pageLive.get(clientOf(address)) ?? [], {
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
 * The routes the worker checks use, answered if the address is one of them.
 *
 * The scripts a worker and a second tab run, the second tab's page, a push down
 * one account's own session, and what that account's datacenter saw.
 */
function serveWorkerRoute(url: string, response: ServerResponse): boolean {
  const address = new URL(url, 'http://localhost')

  if (address.pathname === '/worker-host.js' || address.pathname === '/worker-tab.js') {
    response.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' })
    response.end(address.pathname === '/worker-host.js' ? workerHostScript : workerTabScript)

    return true
  }

  if (address.pathname === '/worker-tab') {
    response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    response.end(WORKER_TAB)

    return true
  }

  if (address.pathname === '/deliver-worker') {
    // Push down the session of the one account named, through its own datacenter.
    const name = address.searchParams.get('account') ?? ''
    const user = BigInt(address.searchParams.get('user') ?? '1')
    const sent = deliverTo(workerLive.get(name) ?? [], {
      _: 'updateShort',
      update: { _: 'updateUserTyping', user_id: user, action: { _: 'sendMessageTypingAction' } },
      date: ORIGIN_SECONDS,
    })

    response.writeHead(sent ? 200 : 409, { 'content-type': 'text/plain' })
    response.end(sent ? 'sent' : 'no established session to send down')

    return true
  }

  if (address.pathname === '/stats-worker') {
    // What an account's datacenter saw: how many connections, and how many
    // long-lived keys were negotiated over them. One shared account connected
    // once negotiates one; two independent connections of it would negotiate two.
    const place = workerDatacenters.get(address.searchParams.get('account') ?? '')

    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify(seenBy(place)))

    return true
  }

  return false
}

/**
 * Say what crossed the bridge.
 *
 * Only with `TRACE=1`: the point of the check is the page's own report, and a
 * server printing every frame would bury it. When something does not work, this
 * is the only place that can say whether the bytes even arrived.
 */
const trace: (message: string) => void =
  process.env['TRACE'] === '1' ? (message) => process.stdout.write(`  ${message}\n`) : () => {}

/** The connections of the check that drives the exchange by hand. */
const live: { peer: WebSocketPeer; server: MockServer }[] = []

/** A datacenter per account a worker hosts, so accounts never share one. */
const workerDatacenters = new Map<string, MockDatacenter>()
const workerLive = new Map<string, { peer: WebSocketPeer; server: MockServer }[]>()

function workerDatacenter(name: string): MockDatacenter {
  const existing = workerDatacenters.get(name)
  if (existing !== undefined) return existing

  const made = datacenterAt()
  workerDatacenters.set(name, made)
  workerLive.set(name, [])

  return made
}

/** Push an update down the newest connection that can carry one. */
function deliverTo(
  connections: readonly { peer: WebSocketPeer; server: MockServer }[],
  update: TlValue,
): boolean {
  for (const entry of [...connections].reverse()) {
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
  // The datacenter is the one the page names: its own, for as long as it keeps
  // the keys it established there.
  '/mtproto': (peer, url) => {
    const name = clientOf(url)

    return bridge(pageDatacenter(name), peer, pageLive.get(name))
  },

  // The same, for the check that drives the exchange by hand. Its own peer,
  // because each remembers the long-lived key its client established.
  '/mtproto-raw': (peer) => bridge(rawDatacenter, peer),

  // What a worker-hosted account runs over: a datacenter of its own, named by
  // the account in the query.
  '/mtproto-worker': (peer, url) => {
    const name = url.searchParams.get('account') ?? 'unnamed'

    return bridge(workerDatacenter(name), peer, workerLive.get(name))
  },
})

/** Carry one page's connection into a datacenter, and its answers back out. */
function bridge(
  place: MockDatacenter,
  peer: WebSocketPeer,
  connections: { peer: WebSocketPeer; server: MockServer }[] = live,
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
    if (opened !== undefined) connections.push({ peer, server: opened.peer })
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
  process.stdout.write(
    `  yuigram/web-app from dist: ${(webAppCheck.text.length / 1024).toFixed(0)} KB, ` +
      `${String(webAppCheck.modules)} built modules, no source and no Node built-ins\n`,
  )
})
