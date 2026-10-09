// SPDX-License-Identifier: MPL-2.0

/**
 * Choosing where to reach a datacenter.
 *
 * The wrong address does not fail in a way that names addressing: a media-only
 * address refuses ordinary calls with an unrelated error, and a cache address
 * holds no authorization at all. So the cases below fix the rule rather than
 * the outcome — which addresses may serve which purpose, in what order, and
 * what is refused outright rather than stored and returned forever.
 */

import { ValidationError } from '@yuigram/core'
import { describe, expect, it } from 'vitest'
import { bootstrapAt } from '../src/network/address.js'
import {
  type DcAddress,
  type DcConfiguration,
  DcDirectory,
  readDcConfiguration,
  readDcOption,
  sameConfiguration,
} from '../src/network/dc.js'
import type { TlValue } from '../src/tl/index.js'

/** A `dcOption` as it arrives, with only the flags a case cares about set. */
function option(fields: Record<string, unknown> = {}): TlValue {
  return { _: 'dcOption', id: 2, ip_address: '10.0.0.1', port: 443, ...fields }
}

/** A decoded address, for building a directory directly. */
function address(fields: Partial<DcAddress> = {}): DcAddress {
  return {
    id: 2,
    host: '10.0.0.1',
    port: 443,
    ipv6: false,
    mediaOnly: false,
    tcpoOnly: false,
    cdn: false,
    static: false,
    thisPortOnly: false,
    secret: undefined,
    ...fields,
  }
}

function directory(options: readonly DcAddress[], thisDc = 2, testMode = false): DcDirectory {
  return new DcDirectory({ options, thisDc, testMode })
}

describe('reading an address', () => {
  it('keeps the identifier, host and port', () => {
    const read = readDcOption(option({ id: 4, ip_address: '149.154.167.40', port: 443 }))

    expect(read).toMatchObject({ id: 4, host: '149.154.167.40', port: 443 })
  })

  it('reads every flag the schema defines', () => {
    const read = readDcOption(
      option({
        ipv6: true,
        ip_address: '2001:db8::1',
        media_only: true,
        tcpo_only: true,
        cdn: true,
        static: true,
        this_port_only: true,
      }),
    )

    expect(read).toMatchObject({
      ipv6: true,
      mediaOnly: true,
      tcpoOnly: true,
      cdn: true,
      static: true,
      thisPortOnly: true,
    })
  })

  it('treats an absent flag as unset', () => {
    const read = readDcOption(option())

    expect([
      read.ipv6,
      read.mediaOnly,
      read.tcpoOnly,
      read.cdn,
      read.static,
      read.thisPortOnly,
    ]).toEqual([false, false, false, false, false, false])
  })

  it('keeps an obfuscation secret when one is published', () => {
    const secret = Uint8Array.from({ length: 16 }, (_, index) => index)

    expect(readDcOption(option({ secret })).secret).toEqual(secret)
  })

  it('leaves the secret absent when none is published', () => {
    expect(readDcOption(option()).secret).toBeUndefined()
  })
})

describe('an address that will not be read', () => {
  it('is refused when it is not an address at all', () => {
    expect(() => readDcOption({ _: 'boolTrue' })).toThrow(/is not a datacenter address/)
  })

  it('is refused when the identifier is not positive', () => {
    expect(() => readDcOption(option({ id: 0 }))).toThrow(/is not positive/)
    expect(() => readDcOption(option({ id: -2 }))).toThrow(/is not positive/)
  })

  it('is refused when the port is outside the range a port may take', () => {
    expect(() => readDcOption(option({ port: 0 }))).toThrow(/outside the range/)
    expect(() => readDcOption(option({ port: 65_536 }))).toThrow(/outside the range/)
    expect(() => readDcOption(option({ port: 65_535 }))).not.toThrow()
  })

  it('is refused when the address is empty', () => {
    expect(() => readDcOption(option({ ip_address: '' }))).toThrow(/is empty/)
  })

  it('is refused when an IPv4 literal is not one', () => {
    expect(() => readDcOption(option({ ip_address: '10.0.0' }))).toThrow(/not an IPv4 literal/)
    expect(() => readDcOption(option({ ip_address: '10.0.0.256' }))).toThrow(/not an IPv4 literal/)
    expect(() => readDcOption(option({ ip_address: 'telegram.org' }))).toThrow(
      /not an IPv4 literal/,
    )
  })

  it('is refused when the family flag and the literal disagree', () => {
    // The flag decides how a socket is opened, so a mismatch produces an
    // attempt against an address that was never published.
    expect(() => readDcOption(option({ ipv6: true, ip_address: '10.0.0.1' }))).toThrow(
      /not an IPv6 literal/,
    )
    expect(() => readDcOption(option({ ip_address: '2001:db8::1' }))).toThrow(/not an IPv4 literal/)
  })

  it('accepts an IPv6 literal with an embedded IPv4 tail', () => {
    expect(() =>
      readDcOption(option({ ipv6: true, ip_address: '::ffff:149.154.167.40' })),
    ).not.toThrow()
  })

  it('is refused when a flag is present but not true', () => {
    expect(() => readDcOption(option({ cdn: false }))).toThrow(/must be absent or true/)
  })

  it('is refused when a secret is present but carries nothing', () => {
    expect(() => readDcOption(option({ secret: new Uint8Array(0) }))).toThrow(/present but empty/)
  })

  it('is refused when the port is not a whole number', () => {
    expect(() => readDcOption(option({ port: 443.5 }))).toThrow(/must be a 32-bit integer/)
  })
})

describe('reading a configuration', () => {
  const config = (fields: Record<string, unknown> = {}): TlValue => ({
    _: 'config',
    this_dc: 2,
    test_mode: false,
    dc_options: [option({ id: 1 }), option({ id: 2 })],
    ...fields,
  })

  it('keeps the addresses, the identity and the network', () => {
    const read = readDcConfiguration(config({ test_mode: true, this_dc: 4 }))

    expect(read.options).toHaveLength(2)
    expect(read.thisDc).toBe(4)
    expect(read.testMode).toBe(true)
  })

  it('preserves the order the server published', () => {
    const read = readDcConfiguration(
      config({ dc_options: [option({ id: 5 }), option({ id: 1 }), option({ id: 3 })] }),
    )

    expect(read.options.map((entry) => entry.id)).toEqual([5, 1, 3])
  })

  it('is refused when it is not a configuration', () => {
    expect(() => readDcConfiguration({ _: 'boolTrue' })).toThrow(/does not carry/)
  })

  it('is refused when it names no addresses', () => {
    expect(() => readDcConfiguration(config({ dc_options: [] }))).toThrow(/names no datacenter/)
  })

  it('is refused whole when any one address is malformed', () => {
    // Accepting the rest would be indistinguishable from a configuration the
    // server published that way, and the gap would surface far from here.
    expect(() =>
      readDcConfiguration(config({ dc_options: [option({ id: 1 }), option({ port: 0 })] })),
    ).toThrow(/outside the range/)
  })

  it('is refused when the identity is not a datacenter', () => {
    expect(() => readDcConfiguration(config({ this_dc: 0 }))).toThrow(/is not positive/)
  })

  it('is refused when the network is not stated', () => {
    expect(() => readDcConfiguration(config({ test_mode: 1 }))).toThrow(/must be a boolean/)
  })
})

describe('choosing an address', () => {
  it('returns nothing for a datacenter it does not know', () => {
    expect(directory([address({ id: 2 })]).select({ id: 9 })).toBeUndefined()
  })

  it('prefers IPv4 unless IPv6 was asked for', () => {
    const v4 = address({ host: '10.0.0.1' })
    const v6 = address({ host: '2001:db8::1', ipv6: true })
    const known = directory([v6, v4])

    expect(known.select({ id: 2 })?.host).toBe('10.0.0.1')
    expect(known.select({ id: 2, ipv6: true })?.host).toBe('2001:db8::1')
  })

  it('falls back to the other family rather than answering nothing', () => {
    // Whether a route to a family exists is not something this layer can know,
    // so the family is a preference and not a requirement.
    const only = directory([address({ host: '2001:db8::1', ipv6: true })])

    expect(only.select({ id: 2 })?.ipv6).toBe(true)
  })

  it('is deterministic: the first candidate in the published order', () => {
    const first = address({ host: '10.0.0.1' })
    const second = address({ host: '10.0.0.2' })
    const known = directory([first, second])

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(known.select({ id: 2 })?.host).toBe('10.0.0.1')
    }
    expect(known.candidates({ id: 2 }).map((entry) => entry.host)).toEqual(['10.0.0.1', '10.0.0.2'])
  })
})

describe('choosing by purpose', () => {
  const main = address({ host: '10.0.0.1' })
  const media = address({ host: '10.0.0.2', mediaOnly: true })
  const cdn = address({ host: '10.0.0.3', cdn: true })
  const known = directory([main, media, cdn])

  it('keeps ordinary calls off a media-only address', () => {
    expect(known.select({ id: 2 })?.host).toBe('10.0.0.1')
    expect(known.candidates({ id: 2 }).map((entry) => entry.host)).toEqual(['10.0.0.1'])
  })

  it('prefers a media-only address for transfers but allows an ordinary one', () => {
    // An ordinary address serves files too, so it stays a candidate — behind
    // the one the server set aside for them.
    expect(known.candidates({ id: 2, purpose: 'media' }).map((entry) => entry.host)).toEqual([
      '10.0.0.2',
      '10.0.0.1',
    ])
  })

  it('routes a transfer to the media address even though the server lists it second', () => {
    // The order the server publishes puts its ordinary address first, so a
    // transfer that took the list as it comes would never reach the address
    // set aside for transfers. Choosing the first candidate is only right once
    // the candidates are in the order this layer means.
    expect(known.select({ id: 2, purpose: 'media' })?.host).toBe('10.0.0.2')
  })

  it('falls back to the ordinary address when the server set none aside', () => {
    const ordinary = directory([main])

    expect(ordinary.select({ id: 2, purpose: 'media' })?.host).toBe('10.0.0.1')
  })

  it('keeps the published order among the addresses set aside for transfers', () => {
    // Grouping is this layer's opinion; the order within a group is the
    // server's, and it is its own order of preference.
    const first = address({ host: '10.0.0.7', mediaOnly: true })
    const second = address({ host: '10.0.0.8', mediaOnly: true })
    const several = directory([main, first, second])

    expect(several.candidates({ id: 2, purpose: 'media' }).map((entry) => entry.host)).toEqual([
      '10.0.0.7',
      '10.0.0.8',
      '10.0.0.1',
    ])
  })

  it('leaves the order alone for ordinary calls', () => {
    // Only a transfer has an address set aside for it. Reordering anything
    // else would override the preference the server published.
    const extra = address({ host: '10.0.0.4' })
    const several = directory([main, extra])

    expect(several.candidates({ id: 2 }).map((entry) => entry.host)).toEqual([
      '10.0.0.1',
      '10.0.0.4',
    ])
  })

  it('offers a cache address only when one was asked for', () => {
    expect(known.select({ id: 2, purpose: 'cdn' })?.host).toBe('10.0.0.3')
    expect(known.candidates({ id: 2, purpose: 'media' })).not.toContain(cdn)
  })

  it('never offers a cache address for anything else', () => {
    // A cache holds no authorization of ours, so an ordinary call sent there
    // cannot succeed.
    const caches = directory([cdn])

    expect(caches.select({ id: 2 })).toBeUndefined()
    expect(caches.select({ id: 2, purpose: 'media' })).toBeUndefined()
  })

  it('returns nothing when the datacenter serves no cache', () => {
    expect(directory([main]).select({ id: 2, purpose: 'cdn' })).toBeUndefined()
  })

  it('applies the family preference within a purpose', () => {
    const v4Media = address({ host: '10.0.0.9', mediaOnly: true })
    const v6Media = address({ host: '2001:db8::9', mediaOnly: true, ipv6: true })
    const both = directory([v4Media, v6Media])

    expect(both.select({ id: 2, purpose: 'media', ipv6: true })?.host).toBe('2001:db8::9')
  })
})

describe('what a directory reports', () => {
  it('names the datacenter this client belongs to and the network', () => {
    const known = directory([address()], 4, true)

    expect(known.thisDc).toBe(4)
    expect(known.testMode).toBe(true)
  })

  it('lists the identifiers it can reach, once each and in order', () => {
    const known = directory([
      address({ id: 5 }),
      address({ id: 1 }),
      address({ id: 5, ipv6: true, host: '2001:db8::1' }),
    ])

    expect(known.identifiers()).toEqual([1, 5])
  })

  it('refuses to describe a network with no addresses', () => {
    expect(() => directory([])).toThrow(ValidationError)
  })

  it('does not change when the list it was built from does', () => {
    const options = [address({ host: '10.0.0.1' })]
    const known = directory(options)
    options.push(address({ host: '10.0.0.2' }))

    expect(known.options).toHaveLength(1)
  })

  it('round-trips through the configuration it reports', () => {
    const known = directory([address(), address({ id: 3 })], 3, true)

    expect(new DcDirectory(known.toConfiguration()).toConfiguration()).toEqual(
      known.toConfiguration(),
    )
  })
})

describe('comparing two configurations', () => {
  const base: DcConfiguration = {
    thisDc: 2,
    testMode: false,
    options: [address({ id: 1 }), address({ id: 2, host: '10.0.0.2' })],
  }

  it('finds two separately built configurations the same', () => {
    expect(sameConfiguration(base, { ...base, options: [...base.options] })).toBe(true)
  })

  it('separates them on the datacenter this client belongs to', () => {
    expect(sameConfiguration(base, { ...base, thisDc: 4 })).toBe(false)
  })

  it('separates them on the network', () => {
    expect(sameConfiguration(base, { ...base, testMode: true })).toBe(false)
  })

  it('separates them when an address was added or removed', () => {
    const shorter = { ...base, options: [address({ id: 1 })] }
    const longer = { ...base, options: [...base.options, address({ id: 3, host: '10.0.0.3' })] }

    // Both directions: a comparison that only walked the left-hand list would
    // call a configuration with extra addresses the same as one without them.
    expect(sameConfiguration(base, shorter)).toBe(false)
    expect(sameConfiguration(base, longer)).toBe(false)
    expect(sameConfiguration(shorter, base)).toBe(false)
  })

  it('separates them on any field of any address', () => {
    const fields: Array<Partial<DcAddress>> = [
      { id: 9 },
      { host: '10.0.0.99' },
      { port: 80 },
      { ipv6: true, host: '2001:db8::1' },
      { mediaOnly: true },
      { tcpoOnly: true },
      { cdn: true },
      { static: true },
      { thisPortOnly: true },
    ]

    for (const field of fields) {
      const changed = {
        ...base,
        options: [address({ id: 1, ...field }), base.options[1] as DcAddress],
      }
      expect(sameConfiguration(base, changed), JSON.stringify(field)).toBe(false)
    }
  })

  it('separates them when the same addresses are published in a different order', () => {
    // The order is the server's own order of preference, and selection takes
    // the first candidate — so a rearrangement is a different configuration.
    const reversed = { ...base, options: [...base.options].reverse() }

    expect(sameConfiguration(base, reversed)).toBe(false)
  })

  it('compares an obfuscation secret by its bytes', () => {
    const secret = Uint8Array.from({ length: 16 }, (_, index) => index)
    const withSecret = { ...base, options: [address({ id: 1, secret })] }
    const sameBytes = { ...base, options: [address({ id: 1, secret: Uint8Array.from(secret) })] }
    const otherBytes = { ...base, options: [address({ id: 1, secret: new Uint8Array(16) })] }
    const noSecret = { ...base, options: [address({ id: 1 })] }

    expect(sameConfiguration(withSecret, sameBytes)).toBe(true)
    expect(sameConfiguration(withSecret, otherBytes)).toBe(false)
    expect(sameConfiguration(withSecret, noSecret)).toBe(false)
    expect(sameConfiguration(noSecret, withSecret)).toBe(false)
  })
})

describe('the test network', () => {
  it('is a property of the configuration, not of an address', () => {
    // Test and production publish the same identifiers at different addresses,
    // so which network a list belongs to cannot be read off any one entry.
    const production = directory([address({ id: 2, host: '10.0.0.1' })], 2, false)
    const test = directory([address({ id: 2, host: '149.154.167.40' })], 2, true)

    expect(production.testMode).toBe(false)
    expect(test.testMode).toBe(true)
    expect(production.select({ id: 2 })?.id).toBe(test.select({ id: 2 })?.id)
    expect(production.select({ id: 2 })?.host).not.toBe(test.select({ id: 2 })?.host)
  })
})

describe('the address an application starts from', () => {
  it('is the one datacenter named, on production unless told otherwise', () => {
    const bootstrap = bootstrapAt({ dc: 2, host: '192.0.2.50', port: 443 })

    expect(bootstrap.thisDc).toBe(2)
    expect(bootstrap.testMode).toBe(false)
    expect(new DcDirectory(bootstrap).select({ id: 2 })).toMatchObject({
      id: 2,
      host: '192.0.2.50',
      port: 443,
      ipv6: false,
      mediaOnly: false,
      cdn: false,
    })
  })

  it('says which network it belongs to', () => {
    expect(bootstrapAt({ dc: 1, host: '192.0.2.10', port: 443, testMode: true }).testMode).toBe(
      true,
    )
  })

  it('reads an IPv6 literal as one', () => {
    const bootstrap = bootstrapAt({ dc: 2, host: '2001:db8::a', port: 443 })

    expect(bootstrap.options[0]?.ipv6).toBe(true)
  })

  it('refuses what would only fail at the first connection', () => {
    // Reported where the address was written, rather than as a datacenter that
    // cannot be reached once the account is already running.
    expect(() => bootstrapAt({ dc: 2, host: 'venus.web.telegram.org', port: 443 })).toThrow(
      ValidationError,
    )
    expect(() => bootstrapAt({ dc: 2, host: '192.0.2.50', port: 0 })).toThrow(ValidationError)
    expect(() => bootstrapAt({ dc: 2, host: '192.0.2.50', port: 70_000 })).toThrow(ValidationError)
    expect(() => bootstrapAt({ dc: 0, host: '192.0.2.50', port: 443 })).toThrow(ValidationError)
    expect(() => bootstrapAt({ dc: 2.5, host: '192.0.2.50', port: 443 })).toThrow(ValidationError)
  })
})
