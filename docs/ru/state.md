# Состояние: сессии, хранилища, диалоги и callback data

[Оглавление](README.md) · назад: [Сообщения, форматирование и файлы](messages.md) · дальше:
[Воркеры, стриминг, ошибки, тесты](advanced.md)

## Два разных понятия «сессии»

В Yuigram есть две вещи, которые в других библиотеках называют одним словом, и они намеренно
разделены:

| | Сессия фреймворка | Авторизация MTProto |
| --- | --- | --- |
| Что это | состояние приложения: корзина, шаг анкеты, настройки пользователя | ключ, которым аккаунт вошёл в Telegram |
| Где | в хранилище, которое передано плагину `session` или приложению | в хранилище самого аккаунта (`fromSession`, `storage` в `AccountOptions`) |
| Если утекла | неприятно | **это вошедший аккаунт** |
| Если потерялась | пользователь начинает заново | нужно войти снова |

Дальше на этой странице речь о первой. О второй — на страницах [клиентов](clients.md#аккаунт) и
[безопасности](operations.md#безопасность).

## Сессии

```ts
import { Bot, file, type SessionFlavor, session, userChatKey } from 'yuigram'

interface Cart {
  count: number
  name?: string
}

const bot = Bot.fromToken<SessionFlavor<Cart>>(process.env.BOT_TOKEN!).extend(
  session<Cart>({
    storage: file('./sessions'),
    key: userChatKey,
    initial: () => ({ count: 0 }),
    ttl: 60 * 60 * 24 * 30,
  }),
)

bot.onMessage(async (message) => {
  message.session.count++
  await message.reply(`сообщение номер ${message.session.count}`)
})
```

Тип сессии передаётся **флейвором** в параметре типа клиента: `Bot.fromToken<SessionFlavor<Cart>>`.
Так у двух ботов в одной программе может быть разное состояние, чего не позволило бы глобальное
расширение интерфейса.

| Параметр | Назначение |
| --- | --- |
| `storage` | Где лежат сессии — любое хранилище `KV`. |
| `key` | Ключ сессии; обязателен, чтобы область видимости была видна там, где сессия подключена. |
| `initial` | Значение для ключа, по которому ещё ничего не сохранено. |
| `ttl` | Время жизни в секундах, обновляется при каждой записи. |
| `commit` | `'always'` (по умолчанию) — записать и после ошибки обработчика; `'success'` — только после успешного завершения, как транзакция. |
| `property` | Имя свойства в контексте вместо `session`. |

Ключ определяет, чьё это состояние, и ошибиться в нём — самая частая ошибка с сессиями:

```ts
import { memory, session, userChatKey } from 'yuigram'

const base = { storage: memory<Cart>(), initial: () => ({ count: 0 }) }

session<Cart>({ ...base, key: userChatKey })                  // пользователь в чате — обычный выбор
session<Cart>({ ...base, key: (event) => event.sender?.id })  // пользователь во всех чатах
session<Cart>({ ...base, key: (event) => event.chat?.id })    // чат, общий для всех участников
```

Ключ видит чат и отправителя обновления. Он может вернуть `bigint` — идентификаторы аккаунта
64-битные, и ключ записывается полностью, без округления через `number`. `undefined` означает
«у этого обновления нет субъекта» (например, пост канала), и сессия не загружается. Ключ,
которому нужно больше — скажем, тема форума, — пишется через `createSession` с явно указанным
типом контекста.

Изменение на месте (`message.session.count++`, `push` во вложенный массив) отмечает сессию
изменённой, и она записывается, когда обработчик закончит. Сессия, которую только читали, не
записывается. Обновления с одним ключом обрабатываются по очереди, поэтому два быстрых
сообщения не прочитают оба `count: 0` и не запишут оба `1`. Сбой хранилища при загрузке не
останавливает бота: сессия начинается с `initial()`, а в лог уходит предупреждение.

`message.sessionHandle` даёт управление явно: `dirty`, `isNew`, `set`, `merge`, `touch`, `save`
и сброс сохранённого значения.

## Хранилища

Договор хранилища нарочно маленький — `get`, `set` и `delete`; `has`, `clear` и `keys`
необязательны. Поэтому адаптер пишется за несколько строк, а драйверы баз данных не попадают в
ядро.

| Хранилище | Откуда | Где хранит | Для чего |
| --- | --- | --- | --- |
| `memory()` | `yuigram` | в памяти процесса | разработка, тесты, состояние, которое не должно пережить процесс |
| `file(каталог)` | `yuigram` | файлы в каталоге | один процесс на машине с диском |
| `encrypted(store, secret)` | `yuigram` | поверх другого хранилища | шифрование значений на диске |
| `web()` | `yuigram` | `localStorage` | страница в браузере |
| `namespaced(store, prefix)` | `yuigram` | область другого хранилища | несколько владельцев одного хранилища |
| `tiered(front, back)` | `yuigram` | два хранилища | быстрый слой поверх медленного |
| `sqliteStore(db, …)` | `@yuigram/sqlite` | файл SQLite | одна машина, несколько процессов |
| `redisStore(client, …)` | `@yuigram/redis` | сервер Redis | несколько машин |

```ts
import { encrypted, file, type KV, memory, namespaced } from 'yuigram'

const sessions = file('./state')
const secrets = encrypted(file<string>('./secure'), process.env.STATE_KEY!)
const forTests = memory()
const firstAccount = namespaced(memory(), 'first:')

const store = new Map<string, unknown>()
const custom: KV<unknown> = {
  get: async (key) => store.get(key),
  set: async (key, value) => {
    store.set(key, value)
  },
  delete: async (key) => {
    store.delete(key)
  },
}
```

SQLite и Redis подключаются через то, что уже есть у приложения: `@yuigram/sqlite` принимает
соединение `node:sqlite`, `better-sqlite3` или `bun:sqlite` (`openDatabase()` открывает файл
встроенным SQLite на Node.js 22.5+), а `@yuigram/redis` отправляет команды через клиент
приложения — node-redis, ioredis или функцию, отправляющую одну команду.

```ts
import { openDatabase, sqliteCounter, sqliteStore } from '@yuigram/sqlite'
import { limiter } from 'yuigram'

const database = await openDatabase('./bot.db')
const carts = sqliteStore<Cart>(database, { table: 'carts' })
const limits = limiter({ counter: sqliteCounter(database) })
```

**У аккаунта своя область.** Аккаунт хранит ключи, адреса датацентров, собеседников и позицию в
потоке обновлений в области `accounts:<name>:` и отмечает её занятой, пока работает. Аккаунты с
разными именами делят хранилище без помех; второй запуск с тем же именем отклоняется
`StorageOwnershipError` в пределах процесса, браузерного источника и — между процессами — у
SQLite и Redis, которые выдают аренду области и проверяют её атомарно при каждой записи. Над
каталогом `file()` между процессами запись о владельце отклоняет только запуск, начавшийся после
её записи; одновременный старт двух процессов она не останавливает. Подробно —
[storage.md](../storage.md) §4.

## Диалоги

Диалог — это разговор из нескольких шагов, состояние которого принадлежит одному собеседнику.
Плагин `conversation` даёт три инструмента: сцены, ожидание ответа и устойчивые сценарии.

### Сцены

```ts
import {
  Bot,
  type ConversationFlavour,
  conversation,
  type MessageContext,
  memory,
  type ScenePosition,
} from 'yuigram'

interface Signup {
  name?: string
}

type Step = MessageContext & ConversationFlavour<Signup>

const bot = Bot.fromToken<ConversationFlavour<Signup>>(process.env.BOT_TOKEN!)

const conversations = conversation<Step, Signup>({
  storage: memory<ScenePosition<Signup>>(),
  scope: 'chat+user',
  ttl: 60 * 60,
  scenes: [
    {
      name: 'signup',
      initial: () => ({}),
      steps: [
        async (message, scene) => {
          if (scene.fresh) {
            await message.reply('Как вас зовут?')
            return
          }
          scene.state.name = message.text?.trim()
          scene.next()
        },
        async (message, scene) => {
          await message.reply(`Приятно познакомиться, ${scene.state.name}.`)
          scene.leave()
        },
      ],
      beforeStep: (message, scene) => {
        if (message.text === '/cancel') scene.cancel()
      },
    },
  ],
})

bot.extend(conversations)
bot.onCommand('start', (message) => message.conversation.enter('signup'))
```

Сцена — список шагов. Шаг, вызванный впервые, видит `scene.fresh` и обычно задаёт вопрос;
следующее сообщение того же собеседника приходит в тот же шаг. `scene.next()` переходит дальше,
`scene.cancel()` прерывает сцену, `onLeave` и `beforeStep` вызываются вокруг шагов. Позиция в
сцене хранится в `storage`, поэтому с файловым или SQLite-хранилищем она переживает перезапуск.
`scope` выбирает, чей это разговор: `'chat'`, `'user'`, `'chat+user'` (по умолчанию) или
`'chat+topic'`.

### Ожидание ответа

```ts
bot.onCommand('nickname', async (message) => {
  await message.reply('Как вас называть? (30 секунд)')
  const answer = await message.conversation.wait<string>({
    match: (context) => typeof (context as Step).text === 'string',
    transform: (context) => (context as Step).text ?? '',
    validate: (text) => text.length <= 32 || 'Не длиннее 32 символов.',
    onInvalid: async (reason) => {
      await message.reply(reason ?? 'Попробуйте ещё раз.')
    },
    timeout: 30_000,
    nullOnTimeout: true,
  })
  await message.reply(answer === undefined ? 'Ладно.' : `Запомнил: ${answer}`)
})
```

`wait` держит обработчик открытым до следующего подходящего сообщения этого собеседника. Он
живёт в памяти: при остановке клиента ожидания отменяются, а не повисают.

### Устойчивые сценарии

Сценарий — разговор, записанный одной функцией, журнал которой переживает перезапуск. Вопросы
задаются через `flow.ask`, а действия с внешними последствиями — через `flow.effect`, чтобы при
возобновлении они не повторялись за спиной приложения:

```ts
import { conversation, defineFlow, file, type FlowRecord, memory } from 'yuigram'

const order = defineFlow<Step, undefined, string>({
  name: 'order',
  version: 1,
  async run(flow) {
    const drink = await flow.ask('drink', (message) => message.reply('Что будете пить?'), {
      match: (message) => typeof message.text === 'string',
      transform: (message) => message.text ?? '',
    })
    await flow.effect('confirm', async () => {
      if (flow.hasContext) await flow.context.reply(`Заказ принят: ${drink}.`)
      return null
    })
    return drink
  },
})

const withFlows = conversation<Step>({
  storage: memory(),
  flows: { storage: file<FlowRecord>('./flows'), define: [order] },
})
```

Сценарий запускается `message.conversation.start(order)` и отменяется
`message.conversation.cancelFlow(причина)`. При старте приложения `controls.flows.resume()`
возобновляет незавершённые сценарии, при остановке — `controls.flows.shutdown()`. Ожидание,
истёкшее по тайм-ауту, — `WaitTimeoutError`; эффект, про который нельзя сказать, выполнился ли
он, — `EffectUncertainError`. Полный пример — [16-durable-flows](../../examples/16-durable-flows).

Те же плагины работают на аккаунте ([18-account-handlers](../../examples/18-account-handlers)).

## Callback data

Данные кнопки — строка до 64 байт. Схема описывает их поля, упаковывает и читает обратно:

```ts
import { defineCallbackData, InlineKeyboard } from 'yuigram'

const add = defineCallbackData('add').literal('item', ['tea', 'coffee']).number('count')

const keyboard = new InlineKeyboard()
  .add(add.button('Чай', { item: 'tea', count: 1 }))
  .add(add.button('Кофе', { item: 'coffee', count: 1 }))

bot.onCallbackQuery(async (query) => {
  const pressed = query.data === undefined ? undefined : add.unpack(query.data)
  if (pressed === undefined) return
  await query.answer(`${pressed.item} × ${pressed.count}`)
})
```

`unpack` возвращает `undefined` для чужих или устаревших данных, а не бросает исключение: кнопки
живут дольше релизов бота, и данные из старой версии — обычное дело. Поля: `string`, `number`,
`boolean` и `literal`. `repack` меняет часть полей, `filter` выбирает нажатия этой схемы.

`pager(name, { pageSize })` строит листание длинного списка кнопками и отказывает чужим нажатиям,
если список принадлежит другому пользователю ([19-shop](../../examples/19-shop)). У аккаунта
нажатия выбираются фильтром `f.callbackData(schema, fields)` из `yuigram/account-filters`.

Подробнее: [sessions.md](../sessions.md), [storage.md](../storage.md),
[api-design.md](../api-design.md) §9–10.
