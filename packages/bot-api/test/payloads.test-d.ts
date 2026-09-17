/**
 * Type-level assertions for the payload builders and the new filters.
 *
 * A builder's value is that the payload it returns is the one a method takes,
 * so these check assignability into the generated parameter types rather than
 * the shape of the object — a payload that merely looks right is caught here
 * only if the method would have rejected it.
 */

import type { FilterMatch } from '@yuigram/core'
import { describe, expectTypeOf, it } from 'vitest'
import type { SendMediaGroupParams, SendMessageParams } from '../src/generated/methods/index.js'
import type {
  ChatAdministratorRights,
  ChatPermissions,
  InlineQueryResultArticle,
  InputMedia,
  InputMessageContent,
  InputPollOption,
  InputSticker,
  LinkPreviewOptions,
  MenuButton,
  ReactionType,
  ReplyParameters,
  ShippingOption,
} from '../src/generated/types/index.js'
import {
  adminRights,
  attach,
  botCommands,
  content,
  f,
  inline,
  invoice,
  menuButton,
  newSticker,
  permissions,
  pollOption,
  preview,
  price,
  reaction,
  replyTo,
  shipping,
} from '../src/index.js'

describe('the payloads a method takes', () => {
  it('builds media a send accepts, one item or a whole album', () => {
    expectTypeOf(attach.photo('a')).toExtend<InputMedia>()
    expectTypeOf(attach.video('a')).toExtend<InputMedia>()
    expectTypeOf(attach.livePhoto('a', 'b')).toExtend<InputMedia>()
    expectTypeOf(attach.photos(['a', 'b'])).toExtend<SendMediaGroupParams['media']>()
    expectTypeOf(newSticker.static('a', ['🐱'])).toEqualTypeOf<InputSticker>()
  })

  it('builds the parts of a message a send names', () => {
    expectTypeOf(preview.off()).toEqualTypeOf<LinkPreviewOptions>()
    expectTypeOf(replyTo(1)).toEqualTypeOf<ReplyParameters>()
    expectTypeOf(replyTo.quoting(1, 'x')).toEqualTypeOf<ReplyParameters>()
    expectTypeOf(reaction.emoji('👍')).toExtend<ReactionType>()
    expectTypeOf(pollOption('yes')).toEqualTypeOf<InputPollOption>()

    // The whole set goes into a send without a cast.
    expectTypeOf<{
      chat_id: number
      text: string
      link_preview_options: LinkPreviewOptions
      reply_parameters: ReplyParameters
    }>().toExtend<SendMessageParams>()
  })

  it('builds what an inline result sends, for the builder that takes it', () => {
    expectTypeOf(content.text('hi')).toExtend<InputMessageContent>()
    expectTypeOf(content.location(1, 2)).toExtend<InputMessageContent>()
    expectTypeOf(
      content.venue({ latitude: 1, longitude: 2 }, 't', 'a'),
    ).toExtend<InputMessageContent>()
    expectTypeOf(content.contact('1', 'A')).toExtend<InputMessageContent>()
    expectTypeOf(inline.article('t', content.text('hi'))).toEqualTypeOf<InlineQueryResultArticle>()
  })

  it('keeps the two ways of being paid apart in the types as well', () => {
    const stars = invoice.stars({
      title: 't',
      description: 'd',
      payload: 'p',
      prices: [price('a', 1)],
    })
    expectTypeOf(stars.currency).toExtend<string>()
    expectTypeOf(stars.provider_token).toExtend<string>()
    expectTypeOf(shipping('a', 'b', [price('c', 1)])).toEqualTypeOf<ShippingOption>()

    // @ts-expect-error an invoice paid in money names its provider
    invoice.fiat({ title: 't', description: 'd', payload: 'p', currency: 'EUR', prices: [] })
    // @ts-expect-error Stars invoices have no provider token to give
    invoice.stars({ title: 't', description: 'd', payload: 'p', prices: [], provider_token: 'x' })
  })

  it('builds configuration payloads in full', () => {
    expectTypeOf(menuButton.commands()).toExtend<MenuButton>()
    expectTypeOf(menuButton.webApp('t', 'https://example.com')).toExtend<MenuButton>()
    expectTypeOf(botCommands.scope.chat(1)).not.toBeAny()
    expectTypeOf(permissions.all()).toEqualTypeOf<ChatPermissions>()
    // Every required right is present, which is what makes this assignable.
    expectTypeOf(adminRights.none()).toEqualTypeOf<ChatAdministratorRights>()
  })
})

describe('the filters over updates that are not messages', () => {
  it('narrows a kind to what was asked for', () => {
    // A filter proves its base type where it is called and its modification
    // where a registration applies it, which is what `FilterMatch` is.
    type Kinds = FilterMatch<ReturnType<typeof f.kind.in<'message' | 'callback_query'>>>
    expectTypeOf<Kinds['kind']>().toEqualTypeOf<'message' | 'callback_query'>()

    type Custom = FilterMatch<ReturnType<typeof f.kind.custom<'order_paid'>>>
    expectTypeOf<Custom['kind']>().toEqualTypeOf<'order_paid'>()
  })

  it('narrows what matching proved about a message', () => {
    type Paid = FilterMatch<ReturnType<typeof f.payment.successful>>
    expectTypeOf<Paid['successful_payment']['invoice_payload']>().toEqualTypeOf<string>()

    type Answering = FilterMatch<ReturnType<typeof f.reply.to>>
    expectTypeOf<Answering['reply_to_message']['message_id']>().toEqualTypeOf<number>()

    type OverBusiness = FilterMatch<typeof f.business.any>
    expectTypeOf<OverBusiness['business_connection_id']>().toEqualTypeOf<string>()
  })

  it('takes only a change a member update can be', () => {
    f.member.change('joined')
    // @ts-expect-error a member either joined, left, or one of the six others
    f.member.change('vanished')
  })
})
