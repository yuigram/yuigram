/**
 * The reels of a slot machine.
 *
 * The table was written out from the arithmetic Telegram's own client library
 * uses to choose the reel animations — left from the value modulo four, centre
 * and right from the next two base-four digits — not from the function under
 * test, so every one of the 64 values is checked against an expectation that
 * was established apart from it.
 */

import { describe, expect, it } from 'vitest'
import { type SlotMachineSymbol, slotMachineReels } from '../src/dice/index.js'
import { ValidationError } from '../src/errors/errors.js'

/** Values 1 to 64, left reel first: B bar, G grapes, L lemon, 7 seven. */
const TABLE =
  'BBB GBB LBB 7BB BGB GGB LGB 7GB BLB GLB LLB 7LB B7B G7B L7B 77B ' +
  'BBG GBG LBG 7BG BGG GGG LGG 7GG BLG GLG LLG 7LG B7G G7G L7G 77G ' +
  'BBL GBL LBL 7BL BGL GGL LGL 7GL BLL GLL LLL 7LL B7L G7L L7L 77L ' +
  'BB7 GB7 LB7 7B7 BG7 GG7 LG7 7G7 BL7 GL7 LL7 7L7 B77 G77 L77 777'

const NAMES: Readonly<Record<string, SlotMachineSymbol>> = {
  B: 'bar',
  G: 'grapes',
  L: 'lemon',
  '7': 'seven',
}

describe('the reels of a slot machine', () => {
  it('shows what every value from 1 to 64 shows', () => {
    const rows = TABLE.split(' ')
    expect(rows).toHaveLength(64)

    rows.forEach((row, index) => {
      expect(slotMachineReels(index + 1), `value ${index + 1}`).toEqual(
        [...row].map((letter) => NAMES[letter]),
      )
    })
  })

  it('reads the reels left to right, the left one turning fastest', () => {
    expect(slotMachineReels(2)).toEqual(['grapes', 'bar', 'bar'])
    expect(slotMachineReels(5)).toEqual(['bar', 'grapes', 'bar'])
    expect(slotMachineReels(17)).toEqual(['bar', 'bar', 'grapes'])
  })

  it('shows three of a kind at the four values Telegram animates as a win', () => {
    expect(slotMachineReels(1)).toEqual(['bar', 'bar', 'bar'])
    expect(slotMachineReels(22)).toEqual(['grapes', 'grapes', 'grapes'])
    expect(slotMachineReels(43)).toEqual(['lemon', 'lemon', 'lemon'])
    expect(slotMachineReels(64)).toEqual(['seven', 'seven', 'seven'])

    const alike = Array.from({ length: 64 }, (_, index) => index + 1).filter((value) => {
      const [left, center, right] = slotMachineReels(value)
      return left === center && center === right
    })
    expect(alike).toEqual([1, 22, 43, 64])
  })

  it.each([
    ['zero', 0],
    ['one past the last value', 65],
    ['a negative value', -1],
    ['a fraction', 21.5],
    ['no number at all', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
    ['a value written as text', '7' as unknown as number],
  ])('refuses %s', (_, value) => {
    expect(() => slotMachineReels(value)).toThrow(ValidationError)
    expect(() => slotMachineReels(value)).toThrow(/1 to 64/)
  })
})
