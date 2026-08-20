/**
 * What the published tarballs actually contain.
 *
 * `files` in a manifest is an allowlist, which is the safe direction — but it
 * is easy to widen by accident, and nothing otherwise looks *inside* the
 * archive. This packs every publishable package and asserts two things about
 * the result: that no file which should stay in the repository is in it, and
 * that no credential is.
 *
 * ```sh
 * pnpm check:contents
 * ```
 *
 * It runs in the release workflow before publishing, because the moment after
 * a secret reaches a registry is the wrong moment to find out.
 */

import { execSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const PACKAGES = ['core', 'bot-api', 'mtproto', 'yuigram']

/** Path shapes that must never appear in a published tarball. */
const FORBIDDEN_PATHS = [
  // Test material.
  /(^|\/)tests?\//,
  /\.test\./,
  /\.test-d\./,

  // Build and tooling configuration.
  /tsconfig/,
  /biome\.json/,
  /vitest\.config/,
  /\.tsbuildinfo/,
  /pnpm-lock/,

  // Any dot-directory. Editor settings, tool configuration and CI definitions
  // all live in one, so a single rule covers the whole class — including
  // whatever convention appears next — without enumerating tools by name.
  /(^|\/)\.[A-Za-z0-9_-]+\//,

  // Environment files, wherever they sit.
  /(^|\/)\.env/,

  // Repository directories that belong to no package.
  /^scripts\//,
  /^docs\//,
  /^examples\//,
  /^schemas\//,
  /^tools\//,
  /node_modules/,
]

/** Credentials and stray metadata that must never appear inside a published file. */
const FORBIDDEN_CONTENT = [
  ['an npm token', /npm_[A-Za-z0-9]{36}/],
  ['a GitHub token', /gh[pousr]_[A-Za-z0-9]{36}/],
  ['a private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['a commit trailer', /co-authored-by/i],
  ['an absolute local path', /[A-Za-z]:\\Users\\/],
]

/**
 * A token-shaped string that is not obviously a placeholder.
 *
 * The testing harness needs a token that passes validation, so shape alone
 * cannot decide. A real token's secret half is random; a placeholder repeats.
 */
function looksLikeARealToken(content) {
  const matches = content.match(/\b\d{8,10}:[A-Za-z0-9_-]{35}\b/g) ?? []

  return matches.some((token) => {
    const [id = '', secret = ''] = token.split(':')
    const synthetic =
      new Set(id).size === 1 || /^(.{1,8})\1+.{0,8}$/.test(secret) || /^[X0]+$/i.test(secret)
    return !synthetic
  })
}

const dir = mkdtempSync(join(tmpdir(), 'yuigram-contents-'))
let failures = 0

const fail = (message) => {
  failures += 1
  process.stdout.write(`  FAIL  ${message}\n`)
}

try {
  for (const name of PACKAGES) {
    const pkg = JSON.parse(readFileSync(`packages/${name}/package.json`, 'utf8'))

    if (pkg.private === true) {
      process.stdout.write(`\n${pkg.name}: private, not published\n`)
      continue
    }

    execSync(`pnpm pack --pack-destination "${dir}"`, { cwd: `packages/${name}`, stdio: 'pipe' })
    const archive = readdirSync(dir).find((f) => f.endsWith('.tgz') && !f.startsWith('_done'))

    // tar is run from inside the directory: a drive-letter path reads as a
    // remote host spec to GNU tar on Windows.
    const files = execSync(`tar -tzf "${archive}"`, { encoding: 'utf8', cwd: dir })
      .trim()
      .split('\n')
      .map((f) => f.replace(/^package\//, ''))
      .filter((f) => f !== '' && !f.endsWith('/'))

    process.stdout.write(`\n${pkg.name}: ${files.length} files\n`)

    for (const file of files) {
      for (const pattern of FORBIDDEN_PATHS) {
        if (pattern.test(file)) fail(`ships ${file} — matched ${pattern}`)
      }
    }

    for (const file of files) {
      let content
      try {
        content = execSync(`tar -xzOf "${archive}" "package/${file}"`, {
          encoding: 'utf8',
          maxBuffer: 40e6,
          cwd: dir,
        })
      } catch {
        continue
      }

      for (const [label, pattern] of FORBIDDEN_CONTENT) {
        if (pattern.test(content)) fail(`${file} contains ${label}`)
      }
      if (looksLikeARealToken(content)) {
        fail(`${file} contains a bot token that is not a placeholder`)
      }
    }

    const manifest = JSON.parse(
      execSync(`tar -xzOf "${archive}" package/package.json`, { encoding: 'utf8', cwd: dir }),
    )

    if (JSON.stringify(manifest).includes('workspace:')) {
      fail('manifest still carries workspace: specifiers — publish through pnpm')
    }
    if (manifest.private === true) fail('a private package was packed')
    if (manifest.license !== 'MIT') fail(`unexpected licence ${manifest.license}`)
    if (typeof manifest.author !== 'string') fail('no author')
    if (!Array.isArray(manifest.files)) fail('no files allowlist')

    execSync(`mv "${archive}" "_done-${archive}"`, { cwd: dir })
  }
} finally {
  rmSync(dir, { recursive: true, force: true })
}

process.stdout.write(
  failures === 0 ? '\nnothing that should stay in the repository is shipped\n' : `\n${failures} problem(s)\n`,
)

process.exit(failures === 0 ? 0 : 1)
