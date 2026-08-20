/**
 * Command parsing and routing.
 *
 * The `@botname` cases are the reason this file exists. In a group, `/start`
 * is addressed to every bot present and `/start@otherbot` to exactly one, so a
 * bot that ignores the suffix answers messages meant for someone else. It is
 * the most common mistake in hand-rolled command handling.
 */

import { describe, expect, it } from 'vitest'
import { addressedToUs, commandMatches, parseCommand } from '../src/command.js'
import { mockBot } from '../src/testing/mock-bot.js'

describe('parseCommand', () => {
  it('parses a bare command', () => {
    expect(parseCommand('/start')).toMatchObject({ name: 'start', mention: undefined, args: [] })
  })

  it('parses arguments', () => {
    expect(parseCommand('/give 10 gold')).toMatchObject({
      name: 'give',
      rest: '10 gold',
      args: ['10', 'gold'],
    })
  })

  it('parses a mention suffix', () => {
    expect(parseCommand('/start@my_bot')).toMatchObject({ name: 'start', mention: 'my_bot' })
  })

  it('parses a mention with arguments', () => {
    expect(parseCommand('/give@my_bot 5')).toMatchObject({
      name: 'give',
      mention: 'my_bot',
      args: ['5'],
    })
  })

  it('treats a newline as an argument separator', () => {
    // Telegram lets a command sit on its own line above a body.
    expect(parseCommand('/post\nthe body text')).toMatchObject({
      name: 'post',
      rest: 'the body text',
    })
  })

  it('collapses repeated whitespace between arguments', () => {
    expect(parseCommand('/give   10    gold')?.args).toEqual(['10', 'gold'])
  })

  it('returns undefined for ordinary text', () => {
    expect(parseCommand('hello')).toBeUndefined()
    expect(parseCommand('not /a command')).toBeUndefined()
    expect(parseCommand(undefined)).toBeUndefined()
  })

  it('rejects a slash with no name', () => {
    expect(parseCommand('/')).toBeUndefined()
    expect(parseCommand('/ start')).toBeUndefined()
  })
})

describe('addressedToUs', () => {
  const bare = { name: 'start', mention: undefined, rest: '', args: [] }
  const ours = { name: 'start', mention: 'my_bot', rest: '', args: [] }
  const theirs = { name: 'start', mention: 'other_bot', rest: '', args: [] }

  it('accepts an unsuffixed command for any bot', () => {
    expect(addressedToUs(bare, 'my_bot')).toBe(true)
    expect(addressedToUs(bare, undefined)).toBe(true)
  })

  it('accepts a suffix naming us', () => {
    expect(addressedToUs(ours, 'my_bot')).toBe(true)
  })

  it('compares usernames case-insensitively', () => {
    expect(addressedToUs({ ...ours, mention: 'MY_BOT' }, 'my_bot')).toBe(true)
  })

  it('rejects a suffix naming another bot', () => {
    // The whole point: this message was not for us.
    expect(addressedToUs(theirs, 'my_bot')).toBe(false)
  })

  it('rejects a suffixed command when our username is unknown', () => {
    // Answering a command possibly meant for someone else is worse than
    // missing one.
    expect(addressedToUs(ours, undefined)).toBe(false)
  })
})

describe('commandMatches', () => {
  const parsed = { name: 'start', mention: undefined, rest: '', args: [] }

  it('matches a plain name', () => {
    expect(commandMatches(parsed, 'start')).toBe(true)
  })

  it('accepts a name written with a leading slash', () => {
    expect(commandMatches(parsed, '/start')).toBe(true)
  })

  it('matches case-insensitively', () => {
    expect(commandMatches(parsed, 'START')).toBe(true)
  })

  it('rejects a different name', () => {
    expect(commandMatches(parsed, 'stop')).toBe(false)
  })

  it('matches a pattern against the name', () => {
    expect(commandMatches(parsed, /^st/)).toBe(true)
    expect(commandMatches(parsed, /^xy/)).toBe(false)
  })
})

describe('routing through the real pipeline', () => {
  it('runs a command handler', async () => {
    const { bot, send, calls } = mockBot()
    bot.command('start', (ctx) => ctx.reply('hi'))

    await send.command('/start')

    expect(calls.last('sendMessage')?.params).toMatchObject({ text: 'hi' })
  })

  it('exposes parsed arguments', async () => {
    const { bot, send, calls } = mockBot()
    bot.command('give', (ctx) => ctx.reply(ctx.command.args.join('+')))

    await send.command('/give 10 gold')

    expect(calls.last('sendMessage')?.params['text']).toBe('10+gold')
  })

  it('runs on a command suffixed with our username', async () => {
    const { bot, send, calls } = mockBot({ me: { username: 'my_bot' } })
    bot.command('start', (ctx) => ctx.reply('hi'))

    await send.command('/start@my_bot')

    expect(calls.count('sendMessage')).toBe(1)
  })

  it('ignores a command addressed to another bot', async () => {
    // Two bots in one group: only the named one should answer.
    const { bot, send, calls } = mockBot({ me: { username: 'my_bot' } })
    bot.command('start', (ctx) => ctx.reply('hi'))

    await send.command('/start@other_bot')

    expect(calls.count('sendMessage')).toBe(0)
  })

  it('ignores a different command', async () => {
    const { bot, send, calls } = mockBot()
    bot.command('start', (ctx) => ctx.reply('hi'))

    await send.command('/stop')

    expect(calls.count('sendMessage')).toBe(0)
  })

  it('ignores ordinary text', async () => {
    const { bot, send, calls } = mockBot()
    bot.command('start', (ctx) => ctx.reply('hi'))

    await send.message('start')

    expect(calls.count('sendMessage')).toBe(0)
  })

  it('fires on a message edited into a command', async () => {
    // Users do edit a typo into a working command, and silently ignoring that
    // is surprising.
    const { bot, send, calls } = mockBot()
    bot.command('start', (ctx) => ctx.reply('hi'))

    await send.update({
      update_id: 500,
      edited_message: { message_id: 1, date: 1, chat: { id: 1, type: 'private' }, text: '/start' },
    } as never)

    expect(calls.count('sendMessage')).toBe(1)
  })
})

describe('text and callback shorthands', () => {
  it('matches exact text', async () => {
    const { bot, send, calls } = mockBot()
    bot.text('ping', (ctx) => ctx.reply('pong'))

    await send.message('ping')
    await send.message('pinged')

    expect(calls.count('sendMessage')).toBe(1)
  })

  it('matches a text pattern', async () => {
    const { bot, send, calls } = mockBot()
    bot.text(/^\d+$/, (ctx) => ctx.reply('a number'))

    await send.message('42')

    expect(calls.last('sendMessage')?.params['text']).toBe('a number')
  })

  it('matches callback data', async () => {
    const { bot, send, calls } = mockBot()
    bot.callback(/^buy:/, (ctx) => ctx.reply(`bought ${ctx.data}`))

    await send.callback('buy:sku-1')

    expect(calls.last('sendMessage')?.params['text']).toBe('bought buy:sku-1')
  })

  it('does not let a text handler fire on callback data', async () => {
    // The two are separate fields precisely so a text filter cannot fire on a
    // button press.
    const { bot, send, calls } = mockBot()
    bot.text('buy:sku-1', (ctx) => ctx.reply('should not happen'))

    await send.callback('buy:sku-1')

    expect(calls.count('sendMessage')).toBe(0)
  })
})
