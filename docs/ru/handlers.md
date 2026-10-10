# События и обработчики

[Оглавление](README.md) · назад: [Клиенты и жизненный цикл](clients.md) · дальше:
[Сообщения, форматирование и файлы](messages.md)

Обработчик регистрируется на вид события, список видов или фильтр. Один аргумент выбирает
обновления, другой их обрабатывает. Всё, что подписывается на события, называется `on…`.

## Регистрация у бота

```ts
bot.on('message', (message) => message.reply('сообщение'))
bot.on(['message', 'message_edited'], (event) => event.log.debug('текст', { kind: event.kind }))
bot.on(f.media.photo, (message) => message.react('👍'))

bot.onMessage((message) => message.log.debug('новое сообщение'))
bot.onCommand('start', (message) => message.reply('Привет'))
bot.onCommand('say', (message) => message.reply(message.command.rest || 'что сказать?'))
bot.onCommand(/^admin_/, (message) => message.reply(`команда ${message.command.name}`))
bot.onText('ping', (message) => message.reply('pong'))
bot.onText(/^\d+$/, (message) => message.reply('это число'))
bot.onCallbackQuery(/^buy:/, (query) => query.answer('Заказано'))
bot.onChatMemberJoined((event) => event.reply('Добро пожаловать!'))
```

На каждый вид события есть именованная регистрация — `onMessage`, `onChatMemberJoined`,
`onForumTopicCreated` и остальные; они сгенерированы из той же таксономии, по которой работает
диспетчер. Служебные сообщения (вход участника, закреплённое сообщение, создание темы)
приходят собственными видами событий, а не как сообщение, в котором надо разбираться самому.

`onText`, `onCommand` и `onCallbackQuery` написаны вручную, потому что они не только выбирают,
но и сопоставляют. `onCommand('start')` срабатывает на `/start` и на `/start@имя_этого_бота`, но
не на команду, адресованную другому боту в группе.

Разбор, которым пользуется `onCommand`, доступен и отдельно — для текста, пришедшего не из
обновления:

```ts
import { parseCommand } from 'yuigram'

parseCommand('/give@shop_bot 10 gold')
// { name: 'give', mention: 'shop_bot', rest: '10 gold', args: ['10', 'gold'] }
parseCommand('см. /help') // undefined: команда должна открывать текст
```

Читается только текст, без сущностей; пробелы по краям не учитываются. Кому адресована команда с
суффиксом, функция не решает: сравните `mention` с именем бота без учёта регистра.

`once` снимает обработчик после первого срабатывания, `off(handler)` — снимает явно.

## Регистрация у аккаунта

```ts
import { f } from 'yuigram/account-filters'

account.on('message', (event) => event.log.debug('сообщение', { from: String(event.sender?.id) }))
account.on(f.text('ping'), (event) => event.reply('pong'))
account.on('message', f.command('stats', { prefixes: '.' }), (event) => event.reply('…'))
account.onMessage((event) => event.log.debug('ещё одно сообщение'))
```

У аккаунта есть третья форма — вид и фильтр сразу, `on(kind, filter, handler)`. Общие с ботом
виды: `message`, `message_edited`, `message_deleted`, `message_reaction`. Остальные — только у
аккаунта и начинаются с `mtproto:`: `mtproto:typing`, `mtproto:user_status`,
`mtproto:callback_query`, `mtproto:album`, `mtproto:join_request`, `mtproto:raw` и другие.
Вид, которого не бывает, отклоняется прямо при регистрации.

Обработчики аккаунта можно разложить по группам: в каждой группе работает первый подходящий,
а `Propagation.Continue` пропускает событие дальше.

```ts
import { Propagation } from 'yuigram'
import { f } from 'yuigram/account-filters'

account.on('message', f.command('ping', { prefixes: '.' }), (event) => event.reply('pong'), { group: 0 })
account.on('message', (event) => {
  event.log.debug('посчитано')
  return Propagation.Continue
}, { group: 1 })
```

## Контекст

Единого типа `Context` нет: обработчик получает то, что гарантирует его регистрация. Сообщение
бота — это `MessageContext`, нажатие кнопки — `CallbackQueryContext`, событие аккаунта —
`MtprotoContext`.

```ts
bot.onMessage(async (message) => {
  message.transport   // 'bot-api'
  message.kind        // 'message' — литеральный тип
  message.chat        // Chat — у сообщения он есть всегда
  message.sender      // User | undefined — у постов канала его нет
  message.text        // string | undefined — у фото может не быть подписи
  message.date        // число, Unix-время, как его присылает Telegram

  await message.reply('с цитатой')
  await message.send('без цитаты')
  await message.react('👍')
  await message.edit('изменено')
  await message.delete()

  message.raw         // исходное обновление Bot API
  message.api         // весь сгенерированный набор методов
  message.log         // логгер этого обновления
})
```

Под ними — второй, сгенерированный слой: каждый метод Bot API, который адресует этот чат или
сообщение, с уже подставленными идентификаторами. Имена — как у Telegram, поэтому знающий Bot
API уже знает и их:

```ts
await message.banChatMember({ user_id: 42 })        // chat_id подставлен
await message.sendChatAction({ action: 'typing' })   // чат, тема и бизнес-подключение подставлены
await message.forwardMessage({ chat_id: 999 })       // подставлен источник, куда — решаете вы
```

Контекст аккаунта устроен так же, но по модели MTProto. `chat` и `sender` — это `PeerRef`:
сорт собеседника (`'user'`, `'chat'`, `'channel'`) и 64-битный идентификатор. `message` —
значение TL-схемы как есть. Действия: `reply`, `send`, `replyMedia`, `react`, `edit`, `delete`,
`pin`, `unpin`, `download`, `forward(to)`, `copy(to)` и ответы на запросы — `answerCallback`,
`answerInline`, `answerPrecheckout`, `decideJoin`. `here` — сгенерированный набор методов с
подставленным собеседником, `api` — весь набор.

```ts
account.on('message', async (event) => {
  if (event.chat?.kind !== 'user') return
  await event.here.messages.readHistory({ max_id: 0 })
  await event.forward('@archive_channel')
})
```

### Общая часть

Обработчик на `App` видит оба транспорта. Общее у них описывает `UnifiedContext`: `text`,
`reply` и `react`. Всё остальное достаётся после проверки `transport` — это литеральный тип,
и проверка сужает контекст:

```ts
import type { MessageContext, MtprotoContext } from 'yuigram'

app.on<MessageContext | MtprotoContext>('message', async (event) => {
  await event.reply('работает на обоих')
  if (event.transport === 'mtproto') {
    await event.here.messages.readHistory({ max_id: 0 })
  } else {
    await event.sendChatAction({ action: 'typing' })
  }
})
```

Сущности не объединяются: `Chat` Bot API и `PeerRef` MTProto — разные вещи, и делать вид,
что это одно, значило бы исказить оба. Почему так — в [unified-model.md](../unified-model.md).

## Фильтры

Фильтр — значение: его можно назвать, экспортировать и переиспользовать. Подходящий фильтр
сужает тип контекста.

```ts
import { and, f, filter, type MessageContext, not, or } from 'yuigram'

bot.on(f.text(/^\d+$/), (message) => {
  message.text   // string, а не string | undefined
})

const fromAdmin = f.sender.id(ADMIN_ID)
const adminInGroup = and(fromAdmin, f.chat.anyGroup)
const visualMedia = or(f.media.photo, f.media.video)
const notForwarded = not(f.forward.exists)

bot.on(adminInGroup, (message) => message.reply('да, начальник'))
bot.on(visualMedia, (message) => message.react('🔥'))
bot.on(notForwarded, (message) => message.log.debug('своё сообщение'))

const isWeekend = filter<MessageContext>(
  'isWeekend',
  (message) => [0, 6].includes(new Date(message.date * 1000).getDay()),
  { kinds: ['message'] },
)
bot.on(isWeekend, (message) => message.reply('Отдыхайте!'))
```

Составной фильтр сначала называют, потом регистрируют: внутри аргумента регистрации сужение
не выводится, и ошибка компиляции лучше обработчика, молча расширенного до всех событий.

Семейства `f` для бота: `f.text`, `f.caption`, `f.anyText`, `f.command`, `f.chat.*` (`private`,
`group`, `supergroup`, `anyGroup`, `channel`, `forum`, `id`), `f.sender.*`, `f.media.*`,
`f.has.*` — по фильтру на каждое необязательное поле сообщения, — `f.entity.*`, `f.reply.*`,
`f.forward.*`, `f.reaction.*`, `f.member.*`, `f.payment.*`, `f.callback.*` и другие.

### Фильтры аккаунта

У событий аккаунта другие поля, поэтому и фильтры свои — из `yuigram/account-filters`: `kind`,
`text`, `command`, `regex`, `chat`, `sender`, `outgoing`, `incoming`, `reply`, `forward`,
`mentioned`, `silent`, `media`, `action`, `callback`, `callbackData`, `inline`, а также `and`,
`or`, `not`.

```ts
import { f } from 'yuigram/account-filters'

const privateText = f.and(f.chat('user'), f.text())
account.on(privateText, (event) => event.reply(`вы написали: ${event.text}`))
```

`f.outgoing` срабатывает на то, что аккаунт отправил из другого своего клиента. То, что
отправил сам вызов в этой программе, — это ответ вызывающему, и обработчикам аккаунта оно не
передаётся вовсе.

Фильтр бота, переданный аккаунту, — ошибка компиляции: он читает поля вроде `chat.type`,
которых у событий аккаунта нет, и обработчик никогда бы не сработал. Фильтр, написанный через
`defineFilter` против общего `UnifiedContext`, принимают оба клиента.

## Middleware

Middleware оборачивает обработку каждого обновления: код до `next()` выполняется на входе, после —
на выходе.

```ts
import { type AnyEventContext, type Middleware, when } from 'yuigram'

const timing: Middleware<AnyEventContext> = async (event, next) => {
  const started = performance.now()
  await next()
  event.log.info('обработано', { kind: event.kind, ms: Math.round(performance.now() - started) })
}

bot.use(timing, { priority: 'high' })
bot.use(when(f.chat.private, async (message, next) => {
  message.log.debug('личное сообщение')
  await next()
}))
```

Middleware без `next()` останавливает цепочку — так делается фильтрация вроде «игнорировать
других ботов». Полосы приоритета — `'high'`, `'normal'` (по умолчанию) и `'low'` — упорядочивают
собственные middleware клиента. Порядок слоёв: middleware приложения снаружи, затем клиента,
затем роутера, затем обработчик.

## Роутеры

Роутер группирует обработчики, чтобы большое приложение раскладывалось по файлам. Его
middleware выполняется **только для обновлений, которые он обрабатывает**, и один раз на
обновление, а не на каждый подошедший обработчик.

```ts
import { Router } from 'yuigram'

export const admin = new Router({ name: 'admin' })

admin.use(async (event, next) => {
  const sender = 'sender' in event ? event.sender : undefined
  if (sender?.id === ADMIN_ID) await next()
})
admin.onCommand('stats', (message) => message.reply(`аптайм ${Math.round(process.uptime())} с`))

bot.extend(admin)
```

Роутер объявляет, что ему нужно, и клиент обязан это предоставить: `new Router<SessionFlavor<Cart>>()`
устанавливается только на клиент с сессией такого типа. Для аккаунта есть `AccountRouter` с
тем же устройством.

## Ошибки обработчиков

```ts
bot.onError((error, event) => {
  event.log.error('обработчик упал', { kind: event.kind, error })
})

account.catch((error, event) => {
  event.log.error('обработчик аккаунта упал', { kind: event.kind, error })
})

app.onError(({ client, error }) => console.error(`${client.name}:`, error))
```

`bot.onError` и `account.catch` получают ошибки обработчиков своего клиента; роутер может иметь
свой `onError`. `app.onError` получает отказы клиентов при запуске и остановке и ошибки
обработчиков, зарегистрированных на самом приложении; если у приложения нет ни одного
`onError`, такая ошибка выбрасывается дальше, а не проглатывается. Иерархия ошибок — на странице [ошибок и повторов](advanced.md#ошибки-и-повторы).

## События приложения

Своё событие объявляется через `defineEvent` и поднимается `emit`; оно проходит через middleware
и обработчики, как обновление от Telegram:

```ts
import { defineEvent } from 'yuigram'

const orderPaid = defineEvent<{ readonly orderId: string }>('order_paid')

bot.on(orderPaid, (event) => event.log.info('оплачено', { order: event.payload.orderId }))
await bot.emit(orderPaid, { orderId: 'A-17' })
```

Подробнее: [events.md](../events.md), [middleware.md](../middleware.md),
[api-design.md](../api-design.md) §4–8.
