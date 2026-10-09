// SPDX-License-Identifier: MPL-2.0

/**
 * What a template must refuse to commit.
 *
 * `docs/security.md` §3 makes "never in git" a control that is on by default,
 * held by a `.gitignore` in every template, and calls it the realistic leak
 * path. Realistic because nothing about it fails loudly: a session string is one
 * line of text that is a logged-in account, and it reaches a public repository
 * not because somebody decided to commit it but because they copied a template,
 * ran it, and committed what the run left behind.
 *
 * The rule is therefore about the copies rather than about this repository. The
 * root ignore file protects what is checked out here and protects nothing once
 * a directory has been copied somewhere else, so each template has to carry its
 * own — and a rule that passes because every template happens to be right today
 * constrains nothing, which is what the failing cases here are for.
 */

import { describe, expect, it } from 'vitest'
import { type Template, templatesIgnoreSecrets } from '../src/rules.js'

/** Everything a template is required to ignore, as one file. */
const COMPLETE = `
# Dependencies.
node_modules/

# Build output.
dist/

# Credentials.
.env
.env.*
!.env.example

# Sessions.
*.session

# State a run leaves behind.
state/
`

const template = (path: string, gitignore: string | undefined): Template => ({ path, gitignore })

describe('a template that protects whoever copies it', () => {
  it('passes when it ignores everything a run produces', () => {
    const result = templatesIgnoreSecrets([template('examples/08-storage', COMPLETE)])

    expect(result.violations).toEqual([])
    expect(result.name).toBe('templates-ignore-secrets')
  })

  it('passes when it ignores more than the minimum', () => {
    // The patterns are a floor. A template with something else to protect says
    // so, and saying more is never the failure.
    const result = templatesIgnoreSecrets([
      template('examples/10-production', `${COMPLETE}\ncoverage/\n*.log\n`),
    ])

    expect(result.violations).toEqual([])
  })

  it('reports a template with no ignore file at all', () => {
    const result = templatesIgnoreSecrets([template('examples/01-basic-bot', undefined)])

    expect(result.violations).toHaveLength(1)
    expect(result.violations[0]?.message).toContain("no '.gitignore'")
    expect(result.violations[0]?.file).toBe('examples/01-basic-bot/.gitignore')
    expect(result.violations[0]?.rationale).toContain('copied whole')
  })

  it('reports each pattern a template is short of, by name', () => {
    // Naming the pattern is the point: a report saying only that something is
    // wrong leaves the reader to diff two files.
    const result = templatesIgnoreSecrets([
      template('examples/07-sessions', 'node_modules/\ndist/\n'),
    ])

    expect(result.violations.map((violation) => violation.message)).toEqual([
      "examples/07-sessions does not ignore '.env'",
      "examples/07-sessions does not ignore '*.session'",
      "examples/07-sessions does not ignore 'state/'",
    ])
  })

  it('does not accept a pattern that only appears inside a comment', () => {
    // Documentation about what ought to be ignored ignores nothing.
    const result = templatesIgnoreSecrets([
      template('examples/03-basic-userbot', `${COMPLETE.replace('*.session', '# *.session')}`),
    ])

    expect(result.violations.map((violation) => violation.message)).toEqual([
      "examples/03-basic-userbot does not ignore '*.session'",
    ])
  })

  it('does not accept a pattern that is only part of a longer one', () => {
    // `.envrc` is not `.env`, and `my-state/` is not `state/`. A substring test
    // would call both of these covered.
    const result = templatesIgnoreSecrets([
      template('examples/05-middleware', 'node_modules/\ndist/\n.envrc\n*.session\nmy-state/\n'),
    ])

    expect(result.violations.map((violation) => violation.message)).toEqual([
      "examples/05-middleware does not ignore '.env'",
      "examples/05-middleware does not ignore 'state/'",
    ])
  })

  it('reads a pattern that carries trailing whitespace', () => {
    const result = templatesIgnoreSecrets([
      template('examples/06-routing', COMPLETE.replace('state/', '  state/  ')),
    ])

    expect(result.violations).toEqual([])
  })

  it('checks every template rather than stopping at the first', () => {
    const result = templatesIgnoreSecrets([
      template('examples/01-basic-bot', undefined),
      template('examples/02-keyboards', COMPLETE),
      template('examples/09-routers', undefined),
    ])

    expect(result.violations.map((violation) => violation.file)).toEqual([
      'examples/01-basic-bot/.gitignore',
      'examples/09-routers/.gitignore',
    ])
  })

  it('says nothing when there are no templates', () => {
    expect(templatesIgnoreSecrets([]).violations).toEqual([])
  })
})
