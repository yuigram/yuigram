/**
 * What a rolled dice shows, where its value alone does not say.
 *
 * Telegram sends a 🎰 as a number from 1 to 64 and leaves the three reels to
 * the client. Its own entry point, so a program that never reads one never
 * loads it.
 */

import { ValidationError } from '../errors/errors.js'

/** A symbol on a slot machine's reel. */
export type SlotMachineSymbol = 'bar' | 'grapes' | 'lemon' | 'seven'

/** The three reels of a slot machine, as they are shown: left, centre, right. */
export type SlotMachineReels = readonly [
  left: SlotMachineSymbol,
  center: SlotMachineSymbol,
  right: SlotMachineSymbol,
]

/** The symbols in the order Telegram numbers them. */
const SYMBOLS = ['bar', 'grapes', 'lemon', 'seven'] as const satisfies readonly SlotMachineSymbol[]

const REELS = 3
const VALUES = SYMBOLS.length ** REELS

/**
 * The reels a 🎰 dice shows for its value, left to right.
 *
 * The value less one is a three-digit number in base four, lowest digit first:
 * the left reel is the lowest digit, the right reel the highest, and a digit
 * names a symbol in the order bar, grapes, lemon, seven. So 1 is three bars,
 * 22 three grapes, 43 three lemons and 64 — the jackpot — three sevens; those
 * four are the values Telegram's apps animate as a win.
 *
 * ```ts
 * slotMachineReels(64) // ['seven', 'seven', 'seven']
 * slotMachineReels(2)  // ['grapes', 'bar', 'bar']
 * ```
 *
 * Takes the value of a dice whose emoji is 🎰: `message.dice.value` from the
 * Bot API, `media.diceValue` from an account. The value of any other dice is
 * the face it landed on, and means nothing here.
 *
 * @throws ValidationError when the value is not a whole number from 1 to 64.
 */
export function slotMachineReels(value: number): SlotMachineReels {
  if (!Number.isInteger(value) || value < 1 || value > VALUES) {
    throw new ValidationError(`a slot machine's value is a whole number from 1 to ${VALUES}`)
  }

  const digits = value - 1

  return [symbol(digits), symbol(digits >> 2), symbol(digits >> 4)]
}

/** The symbol the lowest base-four digit names. */
function symbol(digits: number): SlotMachineSymbol {
  return SYMBOLS[digits & 3] ?? 'bar'
}
