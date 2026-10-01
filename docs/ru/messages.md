# Сообщения, форматирование и файлы

[Оглавление](README.md) · назад: [События и обработчики](handlers.md) · дальше:
[Состояние](state.md)

## Ответить, отправить, изменить

У бота действия над сообщением, которое пришло в обновлении, есть прямо в контексте:

```ts
bot.onMessage(async (message) => {
  await message.reply('с цитатой исходного сообщения')
  await message.send('в тот же чат, без цитаты')
  await message.reply({ photo: media.path('./cat.jpg'), caption: 'кот' })
  await message.react('👍')
})
```

`reply` и `send` — две операции с двумя именами, а не одна с флагом: разницу видно в месте
вызова. Обе принимают строку для простого случая и объект — для всего остального, вместо
семейства `replyWithPhoto`, `replyWithDocument` и так далее. Ответ наследует тему форума и
бизнес-подключение исходного сообщения, чтобы попасть туда же, где идёт разговор.

Сообщение, которого нет в обновлении, отправляется через методы клиента:

```ts
await bot.api.sendMessage({ chat_id: 123456789, text: 'привет' })
```

### Аккаунт

У аккаунта нет `sendMessage(chatId, …)`: чтобы адресовать собеседника, нужен access hash,
выданный именно этому аккаунту. Поэтому собеседник называется `@username` или `PeerRef`,
пришедшим в обновлении, и разрешается через аккаунт; незнакомый собеседник отклоняется
ошибкой `PeerError`, а не угадывается.

```ts
const sent = await account.sendText('@durov', 'привет')
if (sent.id !== undefined) {
  await account.editMessage('@durov', sent.id, 'привет ещё раз')
  await account.deleteMessages('@durov', [sent.id])                      // у всех
}

account.on('message', async (event) => {
  await event.reply('ответ')
  await event.edit('исправлено')
  await event.forward('@archive_channel')
})
```

`deleteMessages(peer, ids, { revoke: false })` удаляет сообщения только у себя. `sendText`,
`sendMedia` и `event.reply` возвращают отправленное сообщение; его `id` может отсутствовать, если
Telegram ответил коротко и не назвал его, — сообщение при этом отправлено. На вызовы сгенерированного набора методов
MTProto отвечает не сообщением, а обновлениями, которые вызвал запрос; `sentMessage(answer,
random_id)` находит в них отправленное сообщение.

## Клавиатуры

```ts
import { InlineKeyboard, Keyboard } from 'yuigram'

const menu = new InlineKeyboard()
  .text('Купить', 'buy:1')
  .url('Документация', 'https://core.telegram.org/bots/api')
  .row()
  .text('Отмена', 'cancel')

await message.reply('Выберите', { reply_markup: menu })

const numbers = new InlineKeyboard()
  .addFrom([1, 2, 3, 4, 5, 6], (n) => ({ text: String(n), callback_data: `pick:${n}` }))
  .columns(3)

await message.reply('Поделитесь номером', {
  reply_markup: new Keyboard().requestContact('Отправить номер').row().text('Нет').resized().oneTime(),
})
await message.reply('Хорошо', { reply_markup: Keyboard.remove() })
```

Клавиатура и есть разметка: `inline_keyboard` заполняется по мере добавления кнопок, поэтому
её можно передать в `reply_markup` без шага `build()`. Данные кнопки длиннее 64 байт Telegram
не примет — `InlineKeyboard` отказывает сразу, в том месте, где кнопка написана. Типизированные
данные кнопок — на странице [состояния](state.md#callback-data).

Нажатие обрабатывается так:

```ts
bot.onCallbackQuery(/^pick:/, async (query) => {
  await query.answer(`Вы выбрали ${query.data?.slice('pick:'.length)}`)
  await query.edit('Готово.')
})
```

Аккаунт, вошедший как бот, строит кнопки функциями `inlineKeyboard`, `callbackButton` и
`urlButton`, а отвечает на нажатие через `event.answerCallback()`.

## Форматирование

### Шаблон `html` для бота

```ts
import { html } from 'yuigram'

await message.reply(html`Привет, <b>${message.sender?.first_name ?? 'гость'}</b>!`, {
  parse_mode: 'HTML',
})
```

Шаблон экранирует то, что **подставлено**, и не трогает написанное в самом шаблоне: разметку
пишет разработчик, а значения приходят от посторонних. Без этого пользователь с именем `<b>`
ломает ответ ошибкой `can't parse entities`. Для текста, собранного иначе, есть `escapeHtml`,
`escapeMarkdownV2` и `escapeMarkdown`, а `raw()` вставляет уже размеченный текст без повторного
экранирования.

### Форматированный текст: `yuigram/markup`

`yuigram/markup` работает с форматированным значением — текстом и списком диапазонов — вместо
строки с разметкой. Подставленные строки и здесь остаются текстом. `as(поле)` отдаёт значение как
пару полей, которую ждёт метод: `as('text')` — `text` и `entities`, `as('caption')` — `caption` и
`caption_entities`:

```ts
import { bold, format, link } from 'yuigram/markup'

bot.onCommand('docs', async (message) => {
  const greeting = format`Привет, ${bold(message.sender?.first_name ?? 'гость')}. ${link('Документация', 'https://core.telegram.org/bots/api')}`

  await message.sendMessage({ ...greeting.as('text') })
  await message.sendPhoto({ photo: media.url('https://example.com/cat.jpg'), ...greeting.as('caption') })
})
```

Для полезной нагрузки, которая собирается во время работы, есть хук: после
`bot.extend(markup())` форматированное значение принимается в любом поле, где Telegram ждёт текст
и его диапазоны, и раскладывается на два поля при вызове. Передать вместе с ним `parse_mode`
нельзя — это отклоняется, чтобы ни одно из двух не победило молча. Читатели разметки (`html`, `md`, `parseHtml`, `parseMarkdown`)
следуют правилам Telegram: по умолчанию читают строго и отказывают с указанием позиции.

### Аккаунт

В MTProto нет `parse_mode`: диапазоны строит клиент. Для этого есть `fromHtml`, `fromMarkdown`,
`toHtml` и `toMarkdown` из основного пакета; по умолчанию они читают мягко, потому что
предназначены для разметки, которую набирает разработчик:

```ts
import { fromHtml, fromMarkdown } from 'yuigram'

await account.sendText('@durov', fromHtml`Привет, <b>${'мир'}</b>`)
await account.sendText('@durov', fromMarkdown`*жирный* и _курсив_`)
```

Упоминание `tg://user?id=N` аккаунт превращает в адресуемое, подставляя access hash, который у
него есть; упоминание того, кого аккаунт никогда не видел, отклоняется `PeerError` до отправки.
Markdown здесь — MarkdownV2, поэтому текст, экранированный для бота, безопасен и для аккаунта.

### Богатые сообщения и потоковые ответы

`yuigram/rich` строит богатые сообщения из блоков или читает их из богатого Markdown и HTML;
`yuigram/stream` показывает ответ черновиком по мере того, как он пишется. Оба описаны в
[formatting.md](../formatting.md); потоковые ответы — также на странице
[воркеров и стриминга](advanced.md#потоковые-ответы).

## Отправка файлов

### Бот

У каждого способа передать файл свой источник в пространстве `media`:

```ts
import { media } from 'yuigram'

await message.reply({ photo: media.path('./cat.jpg') })                   // с диска, потоком
await message.reply({ video: media.url('https://example.com/clip.mp4') }) // скачает сам Telegram
await message.reply({ document: media.buffer(bytes, 'report.pdf') })     // байты в памяти
await message.reply({ document: media.text('строка', 'note.txt') })        // текст как файл
await message.reply({ photo: media.id(fileId) })                          // повторно, по file_id
```

Файл с диска читается по мере того, как сокет его отправляет, так что 2 ГБ стоят один буфер, а
не 2 ГБ памяти. Повтор загрузки либо отправит байты заново, либо громко упадёт
(`NonReplayableUploadError`), но никогда молча не отправит пустой файл. `media.id` работает
только у бота: `file_id` — понятие Bot API, и у аккаунта его нет.

### Аккаунт

Аккаунт загружает байты сам. Источник — любой объект, который умеет отдать кусок байтов и
знает свою длину, если она известна:

```ts
import { type UploadSource, uploadedDocument, uploadedPhoto } from 'yuigram'

const source: UploadSource = {
  size: bytes.length,
  read: async (offset, length) => bytes.subarray(offset, offset + length),
}

const uploaded = await account.upload({ source, name: 'report.pdf' })
await account.sendMedia('@durov', uploadedDocument(uploaded, { mimeType: 'application/pdf' }), 'отчёт')

const picture = await account.upload({ source, name: 'cat.jpg' })
await account.sendMedia('@durov', uploadedPhoto(picture))
```

Источник с известной длиной можно читать с любого смещения, и части уходят параллельно; без
длины он читается по порядку. Тип содержимого документа нужно указать — его не угадывают по
имени файла. Файл, который уже есть в Telegram, отправляется заново без передачи байтов:
`documentMedia(document)` и `photoMedia(photo)`.

## Скачивание файлов

### Бот

```ts
import { downloadToFile } from 'yuigram'

bot.onMessage(async (message) => {
  const carried = await message.download()          // файл, который несёт это сообщение
  const stream = await message.downloadStream()     // то же, потоком
  void carried
  void stream
})

const { photo, document } = message.message
if (photo !== undefined) await bot.download(photo)                                  // самый большой размер
if (document !== undefined) await downloadToFile(bot.files, './out.pdf', document)  // на диск
const url = await bot.getFileUrl(fileId)
```

`message.download()` выбирает файл сообщения: документ, видео, аудио, голосовое, кружок или
анимацию как есть, фото — в самом большом размере, стикер — только если больше ничего нет;
сообщение без файла отклоняется. Методы бота работают только через транспорт и до диска не
дотягиваются, поэтому запись по пути и чтение файлов локального сервера Bot API — это функции,
которым передают `bot.files`.

> **Адрес из `getFileUrl` содержит токен бота** — так устроен файловый эндпоинт Telegram. Это
> учётные данные: не пишите его в логи и не передавайте третьим лицам.

### Аккаунт

```ts
import { documentFile } from 'yuigram'

account.on('message', async (event) => {
  const bytes = await event.download()                       // файл этого сообщения
  const preview = await event.download({ thumbnail: 'm' })   // его миниатюра
  void bytes
  void preview
})

for await (const chunk of account.downloadIterable(documentFile(document))) {
  void chunk                                                 // по частям, можно остановиться
}
```

`event.download()` сам исправляет истёкшую ссылку на файл: ссылка живёт по расписанию
датацентра, и отказ обрабатывается повторным запросом сообщения, а не передачей вызывающему
протокольной подробности. `account.download(request)` возвращает файл целиком,
`account.downloadTo({ …request, write })` передаёт части по порядку в функцию-приёмник,
`account.downloadIterable(request)` отдаёт их итератором. `documentFile`, `photoFile` и
`thumbnailFile` превращают документ, фото или миниатюру в такой запрос.

Датацентр может отдать файл через узел доставки (CDN), которым Telegram не управляет. Это
решение о доверии, а не о скорости, поэтому оно выключено по умолчанию и включается явно:
`account.download({ …request, cdn: true })`. Полученные оттуда байты расшифровываются и
сверяются с опубликованными хешами, прежде чем дойти до вызывающего.

**Куда сохранять — решает приложение.** Имя файла из Telegram выбрал отправитель, поэтому
ничто во фреймворке не превращает его в путь на диске.

Подробнее: [api-design.md](../api-design.md) §6 и §13, [formatting.md](../formatting.md),
[mtproto.md](../mtproto.md) §11.
