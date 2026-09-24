/**
 * Filters for an account's events.
 *
 * Named apart from the `f` the main entry exports, which filters a bot's
 * updates: the two read different transports and are not interchangeable.
 * Its own entry point, so a program that never filters an account never loads
 * it.
 */

export * from '@yuigram/mtproto/filters'
