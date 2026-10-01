# Быстрый старт

[Оглавление](README.md) · дальше: [Клиенты и жизненный цикл](clients.md)

## Установка

```bash
npm install yuigram
```

Нужен Node.js 22 или новее; пакет распространяется только как ESM, поэтому в `package.json`
проекта должно стоять `"type": "module"` (или файлы должны иметь расширение `.mts`). Других
зависимостей у `yuigram` нет: ни Bot API, ни MTProto не заимствованы из сторонних библиотек.

Хранилища на SQLite и Redis — отдельные пакеты, их ставят по необходимости:

```bash
npm install @yuigram/sqlite
npm install @yuigram/redis
```

## Первый бот

Токен выдаёт [@BotFather](https://t.me/BotFather). Передавайте его через переменную окружения,
а не строкой в коде.

```ts
import { Bot } from 'yuigram'

const bot = Bot.fromToken(process.env.BOT_TOKEN!)

bot.onCommand('start', (message) => message.reply('Привет!'))
bot.onText((message) => message.reply(message.text))

bot.onError((error, event) => event.log.error('обработчик упал', { error }))

process.once('SIGINT', () => void bot.stop())

await bot.poll()
```

`poll()` запускает long polling и возвращается, как только бот начал получать обновления; цикл
продолжает работать в фоне, пока не вызван `stop()`.

Способ регистрации определяет, что получает обработчик. `onText` сработал на тексте, поэтому
`message.text` внутри него — `string`. Обработчик `onMessage` такого обещать не может: фото без
подписи — тоже сообщение, и текста у него нет.

Запуск примера из репозитория:

```bash
BOT_TOKEN=123456:ABC-DEF pnpm tsx examples/01-basic-bot/index.ts
```

## Первый аккаунт

Аккаунт входит в Telegram как человек, поэтому ему нужно то, без чего MTProto не начинает
работу:

| Параметр | Откуда он берётся |
| --- | --- |
| `apiId`, `apiHash` | Учётные данные приложения с [my.telegram.org](https://my.telegram.org). Они принадлежат приложению, а не аккаунту. |
| `keys` | Публичные ключи серверов Telegram в формате PEM, как их публикует документация MTProto. Читаются функцией `serverKeysFromPem`. Ключи публичные; аккаунт сверяет по отпечатку ключ, которым отвечает датацентр, и отказывается работать с незнакомым. |
| `bootstrap` | Первый адрес датацентра из той же документации, собранный `bootstrapAt`. Полный список адресов аккаунт получает от самого Telegram. |
| место для состояния | `Account.fromSession(каталог, …)` хранит авторизацию в каталоге; `Account.fromString(строка, …)` принимает экспортированную строку сессии и хранилище. |

Ни ключи, ни адреса не вшиты в пакет: опубликованные значения меняются, и зашитое в релиз
значение со временем устарело бы.

```ts
import { readFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { Account, bootstrapAt, serverKeysFromPem } from 'yuigram'

const account = Account.fromSession('./me.session', {
  apiId: Number(process.env.API_ID),
  apiHash: process.env.API_HASH!,
  keys: serverKeysFromPem(readFileSync('./telegram-keys.pem', 'utf8')),
  bootstrap: bootstrapAt({ dc: 2, host: '149.154.167.50', port: 443 }),
})

async function ask(question: string): Promise<string> {
  const input = createInterface({ input: process.stdin, output: process.stdout })
  try {
    return (await input.question(question)).trim()
  } finally {
    input.close()
  }
}

account.onMessage(async (event) => {
  if (event.text === 'ping') await event.reply('pong')
})

await account.connect()
await account.signIn({
  phone: () => ask('Телефон: '),
  code: () => ask('Код: '),
  password: () => ask('Пароль 2FA: '),
})
```

`connect()` устанавливает соединение, `signIn()` доказывает, чей это аккаунт. Это разные шаги,
потому что ломаются они по-разному: недоступная сеть и неверно введённый код — разные проблемы.

`signIn()` спрашивает только то, что действительно нужно. Аккаунт, уже вошедший в сохранённой
сессии, не спросит ничего; пароль спрашивается, только если он у аккаунта есть. Перед тем как
спрашивать человека, `signIn()` проверяет у Telegram, жива ли авторизация: сессию могли отозвать
с другого устройства, и локальный флаг об этом не знает.

Отдельные шаги тоже публичны — `sendCode`, `signInWithCode`, `signInWithPassword`,
`requestLoginToken` для входа по QR-коду, `signInAsBot(token)` для бота — на случай, когда вход
ведёт не терминал, а веб-форма или очередь.

> **Каталог сессии и экспортированная строка — это вошедший аккаунт.** Любой, у кого они есть,
> действует от имени владельца, пока сессию не отзовут в списке активных сеансов Telegram.
> Не кладите их в репозиторий, в логи и в сообщения. Аккаунт действует как человек, и
> Telegram ограничивает аккаунты, которые используют для флуда и спама.

Выход — `await account.logOut()`: Telegram отзывает авторизацию, и вместе с ней стираются ключи,
позиция в потоке обновлений и известные аккаунту собеседники.

Пример [03-basic-userbot](../../examples/03-basic-userbot) делает то же самое и при первом
запуске печатает строку `SESSION` для следующих:

```bash
API_ID=12345 API_HASH=abc… SERVER_KEYS=./telegram-keys.pem pnpm tsx examples/03-basic-userbot/index.ts
```

## Бот и аккаунт в одном приложении

```ts
import { type AnyEventContext, App, type MtprotoContext, type UnifiedContext } from 'yuigram'

const app = new App<AnyEventContext | MtprotoContext>()
app.add(bot)
app.add(account)

app.use(async (event, next) => {
  event.log.info('обновление', { client: event.client.name, kind: event.kind })
  await next()
})

app.on<UnifiedContext>('message', async (event) => {
  if (event.text === 'кто') await event.reply(`${event.client.name}, через ${event.transport}`)
})

app.onError(({ client, error }) => console.error(`${client.name} упал`, error))

await app.start()
```

`App` держит несколько клиентов любого вида. У каждого свой жизненный цикл, свои учётные данные
и соединения; общая у них только цепочка middleware. Клиент, который не смог стартовать, не мешает
остальным — его ошибка приходит в `app.onError`.

Обработчик на приложении видит оба клиента; обработчик на клиенте — только свой и полностью
типизирован. `event.transport` (`'bot-api'` или `'mtproto'`) различает их там, где нужно то, что
есть только у одного.

## Что дальше

- [Клиенты и жизненный цикл](clients.md) — все параметры клиентов, остановка и отмена.
- [События и обработчики](handlers.md) — как выбирать обновления и что приходит в обработчик.
- [examples/](../../examples) — готовые программы для каждой возможности.
