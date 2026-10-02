<div align="center">

# Yuigram

**Независимый TypeScript-фреймворк для Telegram Bot API и MTProto.**

Один пакет. Боты и пользовательские аккаунты. Одна модель программирования.

[![npm](https://img.shields.io/npm/v/yuigram.svg)](https://www.npmjs.com/package/yuigram)
[![node](https://img.shields.io/node/v/yuigram.svg)](https://nodejs.org)
[![licence](https://img.shields.io/npm/l/yuigram.svg)](LICENSE)

[English](README.md) · Русский

</div>

---

> **Состояние.** Опубликованная версия `0.1.0` — клиент Bot API. Эта ветка добавляет клиент
> аккаунта на MTProto, `App` для нескольких клиентов и всё, что описано ниже; выйдет это вместе с
> накопленными changeset-записями. Что изменилось с `0.1.0` — в [docs/migration.md](docs/migration.md),
> что ещё запланировано — в [docs/roadmap.md](docs/roadmap.md).

## Что даёт Yuigram

- **`Bot`** — клиент Bot API поверх HTTPS: типизированный метод на каждый метод Bot API, свой
  контекст на каждый вид события, long polling, вебхуки с адаптерами для фреймворков,
  клавиатуры, форматирование, загрузка и скачивание файлов.
- **`Account`** — пользовательский аккаунт (или бот) поверх MTProto, реализованного в этом
  репозитории: обмен ключами, зашифрованная сессия, датацентры, обновления, собеседники и файлы,
  сгенерированный набор методов TL и операции поверх него — отправка, редактирование и пересылка
  сообщений, обход диалогов и истории, управление чатами и участниками.
- **`App`** — несколько клиентов любого вида в одном процессе: у каждого свой жизненный цикл,
  свои учётные данные и соединения, а цепочка middleware вокруг них одна.
- **Общий слой для обоих транспортов** — диспетчеризация, фильтры, middleware, роутеры, сессии,
  хранилища, диалоги, ошибки и логирование, без притворства, что Bot API и MTProto одинаковы.
  Где они различаются, об этом говорят типы.
- **Никаких зависимостей во время выполнения.** Ни один из протоколов не заимствован из другой
  Telegram-библиотеки; сборка падает, если такая появится.

## Установка

```bash
npm install yuigram
```

Нужен Node.js 22 или новее; пакет распространяется только как ESM. Хранилища `@yuigram/sqlite` и
`@yuigram/redis` — отдельные пакеты, их ставят при необходимости.

## Бот

```ts
import { Bot } from 'yuigram'

const bot = Bot.fromToken(process.env.BOT_TOKEN!)

bot.onCommand('start', (message) => message.reply('Привет.'))
bot.onText((message) => message.reply(message.text))

bot.onError((error, event) => event.log.error('обработчик упал', { error }))

await bot.poll()
```

Токен выдаёт [@BotFather](https://t.me/BotFather). Способ регистрации определяет, что получает
обработчик: `onText` сработал на тексте, поэтому `message.text` внутри него — `string`, а
обработчик `onMessage` должен учитывать фото без подписи.

## Аккаунт

Аккаунт входит как человек, поэтому ему нужно то, без чего MTProto не делает ни одного вызова:

| | Откуда |
| --- | --- |
| `apiId`, `apiHash` | Учётные данные приложения с [my.telegram.org](https://my.telegram.org). |
| `keys` | Публичные ключи серверов Telegram в формате PEM из документации MTProto, читаются `serverKeysFromPem`. Они публичные и сверяются по отпечатку; в пакет не вшиты. |
| `bootstrap` | Первый адрес датацентра из той же документации, собранный `bootstrapAt`. Полный список аккаунт получает от Telegram. |
| место для состояния | `fromSession(каталог, …)` хранит авторизацию в каталоге; `fromString(сессия, …)` принимает экспортированную строку и хранилище. |

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

`signIn` спрашивает только то, что нужно: аккаунт, уже вошедший в сохранённой сессии, не спросит
ничего, а пароль спрашивается, только если он есть. **Каталог сессии и любая экспортированная
строка — это вошедший аккаунт**: держите их вне репозиториев, логов и сообщений и отзовите
сессию в Telegram, если она утекла. Аккаунт действует от имени владельца, и Telegram ограничивает
аккаунты, которые используют для флуда и спама.

## Оба в одном приложении

```ts
import { type AnyEventContext, App, type MtprotoContext, type UnifiedContext } from 'yuigram'

const app = new App<AnyEventContext | MtprotoContext>()
app.add(bot)
app.add(account)

app.use(async (event, next) => {
  event.log.info('обновление', { client: event.client.name, kind: event.kind })
  await next()
})

app.on<UnifiedContext>('message', (event) => event.react('👀'))

await app.start()
```

Обработчик на приложении видит оба клиента; обработчик на клиенте — только свой и полностью
типизирован. `event.transport` различает их там, где нужно то, что есть только у одного.

## Точки входа и дополнительные пакеты

| Импорт | Что внутри |
| --- | --- |
| `yuigram` | Клиенты, `App`, контексты, фильтры, middleware, роутеры, сессии, хранилища, диалоги, ошибки, форматирование, источники файлов, клавиатуры |
| `yuigram/testing` | `mockBot` и `mockAccount`: настоящий конвейер, заменена только сеть |
| `yuigram/webhook` | Обработчик вебхука и адаптеры для `node:http`, Express, Fastify и серверов на Fetch API |
| `yuigram/worker` | Аккаунт в воркере, управляемый из другого потока |
| `yuigram/markup` | Форматированный текст: построители, чтение и запись HTML и Markdown |
| `yuigram/rich` | Богатые сообщения из блоков или из богатого Markdown и HTML |
| `yuigram/stream` | Ответ, который показывается черновиком по мере написания, — для бота и для аккаунта |
| `yuigram/web-app` | Данные запуска Mini App: чтение и проверка — токеном бота или подписью Telegram |
| `yuigram/dice` | Что показывает выпавший 🎰: три барабана слот-машины по значению |
| `yuigram/account-filters` | Фильтры для событий аккаунта |
| `yuigram/account-utils` | Голосовые волны, миниатюры, Instant View и идентификаторы inline-сообщений |
| `@yuigram/sqlite` | Хранилище и общий счётчик на SQLite, через драйвер самой среды выполнения |
| `@yuigram/redis` | Хранилище и общий счётчик на Redis, через клиент, который уже есть у приложения |

Каждый подпуть загружается, только когда его импортируют, а программа, использующая только
Bot API, не содержит в бандле ничего из MTProto.

## Документация

| | |
| --- | --- |
| [Документация на русском](docs/ru/README.md) | Руководства по обоим транспортам: клиенты, обработчики, сообщения и файлы, состояние, воркеры, ошибки, тесты, эксплуатация |
| [Примеры](examples) | Готовые программы, каждая проверяется вместе с репозиторием |
| [API design](docs/api-design.md) | Публичный API как он реализован и почему он такой |
| [Runtimes](docs/runtimes.md) | Где работает и что там действительно запускалось |
| [Security](docs/security.md) | Модель угроз и обращение с секретами |
| [Live verification](docs/live-verification.md) | Подготовленная проверка на самом Telegram |
| [docs/README.md](docs/README.md) | Указатель проектных документов (на английском) |

## Среды выполнения

Основная платформа — Node.js 22 или новее, на ней работает всё. Bun 1.4.2, Deno 2.9.6 и workerd
(локально, через Miniflare) прошли матрицу сред выполнения — вызовы Bot API и вебхуки,
хранилища, обмен ключами аккаунта, зашифрованные вызовы и обновления — против локального
датацентра-заменителя; страница в браузере выполнила аккаунт так же.
[docs/runtimes.md](docs/runtimes.md) содержит таблицу и разделяет запущенное и выведенное.

Ограничения:

- Long polling нужен долгоживущий процесс; на edge-платформах используют вебхук.
- Пути к файлам и хранилище `file()` требуют файловой системы. Бот, который их не использует,
  не тянет этот код в бандл, а собственные методы скачивания бота до диска не дотягиваются.
- Страница в браузере не может обращаться к Bot API напрямую: Telegram не отдаёт заголовки CORS.
- **С самим Telegram ничего не запускалось.** Вход требует настоящих учётных данных и нигде не
  выполнялся; [docs/live-verification.md](docs/live-verification.md) — подготовленная процедура.
  Проверки выше используют поддельные транспорты и датацентр-заменитель, говорящий на
  настоящем протоколе.

## Разработка

```bash
pnpm install
pnpm verify      # линтер, типы, инварианты, тесты, бюджет деклараций
pnpm smoke       # упаковать пакеты, установить и использовать как приложение
pnpm bench       # бюджеты запуска, бандлов и диспетчеризации
```

`pnpm verify` не требует ничего, кроме репозитория. Матрице сред выполнения нужны Bun, Deno и
Miniflare, тестам Redis — сервер Redis; [CONTRIBUTING.md](CONTRIBUTING.md) описывает, как их
запустить. Проверки на живом Telegram включаются явно, отдельной переменной для каждого вида
изменений, и в обычный запуск не входят.

## Безопасность

Yuigram работает с учётными данными. Токен бота управляет ботом, а утёкшая сессия MTProto — это
вошедший аккаунт. Логи редактируют и то и другое структурно. Об уязвимостях сообщайте приватно —
см. [SECURITY.md](SECURITY.md).

## Лицензия и благодарности

[MIT](LICENSE). Yuigram не содержит стороннего кода и не имеет зависимостей во время выполнения.
Он написан по опубликованным спецификациям Telegram; проекты, изученные при проектировании,
перечислены в [NOTICE.md](NOTICE.md), а анализ лицензий — в [docs/licensing.md](docs/licensing.md).
