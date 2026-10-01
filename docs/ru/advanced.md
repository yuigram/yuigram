# Воркеры, стриминг, ошибки и тестирование

[Оглавление](README.md) · назад: [Состояние](state.md) · дальше: [Эксплуатация](operations.md)

## Аккаунт в воркере

Аккаунт можно создать в отдельном потоке и управлять им из основного: соединение, шифрование
и разбор обновлений не занимают главный поток, а в браузере все вкладки могут делить один
аккаунт через `SharedWorker`. Код для этого — в `yuigram/worker`; основной пакет его не
загружает и воркеров сам не создаёт.

Поток воркера создаёт аккаунт по имени:

```ts
import { parentPort } from 'node:worker_threads'
import { Account, bootstrapAt, memory } from 'yuigram'
import { serveAccounts } from 'yuigram/worker'

serveAccounts(
  {
    create: (name) =>
      Account.fromString(process.env.SESSION!, {
        name,
        apiId: Number(process.env.API_ID),
        apiHash: process.env.API_HASH!,
        keys,
        bootstrap: bootstrapAt({ dc: 2, host: '149.154.167.50', port: 443 }),
        storage: memory(),
      }),
    onLastDetached: 'stop',
  },
  parentPort,
)
```

Основной поток подключается к нему и работает с аккаунтом почти как с обычным:

```ts
import { Worker } from 'node:worker_threads'
import { attachAccount, HostUnavailableError, workerEndpoint } from 'yuigram/worker'

const worker = new Worker(new URL('./host.js', import.meta.url))
const me = await attachAccount(workerEndpoint(worker), { account: 'me' })

me.onEvent((event) => {
  if (event.kind === 'host-lost') console.error('воркер пропал')
})

me.on('message', async (event) => {
  if (event.text === 'ping') await event.reply('pong')
})

await me.start()
```

Между потоками проходит только то, что есть в фиксированной таблице разрешённых вызовов, и
протокол не пишет в лог ни аргументов, ни результатов. Запросы входа (телефон, код, пароль)
выполняются на стороне вызывающего, а ответ передаётся в воркер как результат обратного вызова. Воркер, который перестал отвечать, — `HostUnavailableError`.
Какие платформы какие воркеры дают — [runtimes.md](../runtimes.md) §6; полный пример —
[15-worker](../../examples/15-worker).

## Потоковые ответы

`yuigram/stream` показывает ответ черновиком, пока он пишется (например, пока его генерирует
языковая модель), и отправляет готовые сообщения по мере заполнения:

```ts
import { Bot } from 'yuigram'
import { type StreamFlavour, stream } from 'yuigram/stream'

const bot = Bot.fromToken<StreamFlavour>(process.env.BOT_TOKEN!)
bot.extend(stream({ canStop: true }))

bot.onMessage(async (message) => {
  const result = await message.stream(answer(message.text ?? ''), { parseMode: 'MarkdownV2' })
  console.log(`сообщений: ${result.messages.length}, черновиков: ${result.drafts}`)
})
```

Источником может быть асинхронный итератор строк или событий, а адаптеры `fromOpenAI`,
`fromAnthropic`, `fromOllama`, `fromLangChain`, `fromEventEmitter` и `fromBytes` переводят
форматы распространённых SDK. С `canStop: true` у читателя есть кнопка остановки, и
`result.stopped` скажет, нажал ли он её. Для аккаунта есть `streamTo(account, peer, source)`.
Как и когда уходят черновики и сообщения — [formatting.md](../formatting.md) §3; пример —
[17-streaming](../../examples/17-streaming).

## Ошибки и повторы

Все ошибки фреймворка наследуют `YuigramError`. Основные ветви:

| Класс | Когда |
| --- | --- |
| `TelegramError` | Telegram отказал; базовый класс для ошибок обоих транспортов. |
| `BotApiError` | Bot API ответил ошибкой: `code`, `description`, `method`, исходный ответ в `cause`. |
| `RpcError` | MTProto ответил ошибкой; `MigrationError` — «аккаунт живёт в другом датацентре». |
| `FloodError` | Слишком часто: `retryAfter` — сколько секунд ждать. Одна и та же для обоих транспортов. |
| `NetworkError` | Сеть недоступна или соединение оборвалось. |
| `PeerError` | Собеседник неизвестен аккаунту или не может быть адресован. |
| `ValidationError` | Неверный аргумент — отклонён до отправки. |
| `ConfigError` | Неверная конфигурация клиента. |
| `AuthError`, `SessionError`, `StorageError`, `StorageOwnershipError` | Вход, сессии, хранилища. |
| `CancelledError`, `WaitTimeoutError`, `WaitCancelledError` | Отмена и ожидания в диалогах. |
| `PluginError` и наследники | Конфликты, циклы и сбои установки плагинов. |

Ни одна обёртка не теряет исходных данных: код, описание и исходная ошибка TL остаются
доступными.

```ts
import { BotApiError, FloodError } from 'yuigram'

bot.onError((error, event) => {
  if (error instanceof FloodError) {
    event.log.warn(`флуд, ждать ${error.retryAfter} с`)
    return
  }
  if (error instanceof BotApiError) {
    event.log.error('Telegram отказал', { code: error.code, description: error.description })
    return
  }
  event.log.error('обработчик упал', { error })
})
```

Логгер принимает сообщение, а затем поля — так структурный приёмник получает их раздельно.

### Хуки вокруг вызовов

Хук оборачивает каждый исходящий вызов Bot API; `next()` отправляет запрос. Вызвать `next()`
дважды — повторить, не вызвать — ответить без отправки. На этом механизме сделаны повторы,
ограничение скорости и кэширование:

```ts
import { createLogger, rateLimit, retryOnFloodWait, throttle } from 'yuigram'

const log = createLogger({ level: 'info' })

const paced = throttle({ globalPerSecond: 25 })
bot.hook(paced.hook)
bot.hook(retryOnFloodWait({ maxWait: 30, log }))

bot.use(
  rateLimit({
    limit: 10,
    windowMs: 10_000,
    onLimited: async (event, info) => {
      if (info.count === 11 && 'reply' in event) {
        await event.reply(`Слишком часто — попробуйте через ${Math.ceil(info.resetMs / 1000)} с.`)
      }
    },
  }),
)
```

- `throttle()` держит лимиты Telegram на исходящие сообщения: по умолчанию 30 запросов в
  секунду, одно сообщение в секунду в чат, двадцать в минуту в группу — скользящими окнами и
  честной очередью, чтобы рассылка не упёрлась в лимит в первую же секунду.
- `retryOnFloodWait({ maxWait })` повторяет вызов после `retry_after`, если ждать не дольше
  `maxWait` секунд.
- `rateLimit({ limit, windowMs })` ограничивает, сколько может попросить у бота один
  пользователь, и оставляет вам решать, что ему ответить. `limiter()` даёт тот же счётчик как
  фильтр, проверку или ожидание, в именованных корзинах и в хранилище, общем для нескольких
  процессов (`sqliteCounter`, `redisCounter`).

## Тестирование

`yuigram/testing` запускает настоящий конвейер — нормализацию, middleware, диспетчеризацию,
контекст — и заменяет только сеть. Ни токена, ни соединения с Telegram не нужно.

```ts
import { mockBot } from 'yuigram/testing'

const { bot, send, calls } = mockBot()

bot.onCommand('start', (message) => message.reply('Привет'))
await send.command('/start')

expect(calls.last('sendMessage')?.params).toMatchObject({ text: 'Привет' })
```

Для аккаунта — `mockAccount`: внутрипроцессный Telegram, который сам отвечает на отправку,
редактирование и удаление сообщений, чтение истории, реакции, набор текста и нажатие кнопок.
Всё остальное отклоняется ошибкой с именем метода и задаётся сценарием через `on` или `once`.

```ts
import { f } from 'yuigram/account-filters'
import { mockAccount } from 'yuigram/testing'

const mocked = mockAccount()
mocked.account.on('message', f.text('ping'), (event) => event.reply('pong'))

await mocked.send.message('ping')

expect(mocked.calls.last('messages.sendMessage')?.query).toMatchObject({ message: 'pong' })
await mocked.dispose()
```

В `yuigram/testing` есть и заготовки обновлений (`message`, `callbackQueryUpdate`,
`memberJoinedUpdate` и другие) и ошибок (`floodWait`, `apiError`, `rpcError`), чтобы проверять
пути отказа: `FloodError` и `MigrationError` в тесте возникают так же, как в работе.

Сам фреймворк проверяется так же — без Telegram: поддельным транспортом Bot API и
датацентром-заменителем, который говорит на настоящем протоколе через настоящие сокеты
([testing.md](../testing.md)). Проверка на живом Telegram — отдельная, по желанию, и описана на
странице [эксплуатации](operations.md#проверка-на-живом-telegram).

Подробнее: [runtimes.md](../runtimes.md) §6, [formatting.md](../formatting.md) §3,
[architecture.md](../architecture.md) §6, [testing.md](../testing.md).
