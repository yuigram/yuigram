# Документация Yuigram

[English](../README.md) · Русский

Yuigram — независимый TypeScript-фреймворк для Telegram Bot API и MTProto. Эти страницы —
руководство по работе с ним на русском языке: как подключить бота и аккаунт, как писать
обработчики, хранить состояние, отправлять файлы, тестировать и запускать приложение.

Проектные документы, в которых записано, *почему* фреймворк устроен именно так, остаются на
английском; каждая страница ниже ссылается на них там, где нужны подробности.

## Порядок чтения

| # | Страница | О чём она |
| --- | --- | --- |
| 1 | [Быстрый старт](getting-started.md) | Установка, первый бот, первый аккаунт, оба в одном приложении |
| 2 | [Клиенты и жизненный цикл](clients.md) | Настройка `Bot`, `Account` и `App`, запуск, остановка, отмена |
| 3 | [События и обработчики](handlers.md) | Регистрация, контекст, фильтры, middleware, роутеры |
| 4 | [Сообщения, форматирование и файлы](messages.md) | Ответы и отправка, клавиатуры, разметка, загрузка и скачивание |
| 5 | [Состояние](state.md) | Сессии, хранилища, диалоги и callback data |
| 6 | [Воркеры, стриминг, ошибки, тесты](advanced.md) | Аккаунт в воркере, потоковые ответы, ошибки и повторы, тестирование |
| 7 | [Эксплуатация](operations.md) | Среды выполнения, миграция, безопасность, проверка на живом Telegram |

## Соответствие английским документам

Русские страницы — руководства, а не перевод проектных записей. Источники, на которых они
основаны:

| Страница | Английские источники |
| --- | --- |
| [getting-started.md](getting-started.md) | [README](../../README.md), [api-design.md](../api-design.md) §1–3, [examples/](../../examples) |
| [clients.md](clients.md) | [api-design.md](../api-design.md) §1–3 и §14, [bot-api.md](../bot-api.md), [mtproto.md](../mtproto.md), [events.md](../events.md) §7 |
| [handlers.md](handlers.md) | [api-design.md](../api-design.md) §4–8, [events.md](../events.md), [middleware.md](../middleware.md), [unified-model.md](../unified-model.md) |
| [messages.md](messages.md) | [api-design.md](../api-design.md) §6, §13, [formatting.md](../formatting.md), [mtproto.md](../mtproto.md) §11 |
| [state.md](state.md) | [sessions.md](../sessions.md), [storage.md](../storage.md), [api-design.md](../api-design.md) §9–10 |
| [advanced.md](advanced.md) | [runtimes.md](../runtimes.md) §6, [formatting.md](../formatting.md), [architecture.md](../architecture.md) §6, [testing.md](../testing.md) |
| [operations.md](operations.md) | [runtimes.md](../runtimes.md), [migration.md](../migration.md), [security.md](../security.md), [live-verification.md](../live-verification.md) |

## Соглашения

- Идентификаторы, имена пакетов, команды, переменные окружения и имена файлов приводятся без
  изменений: `Bot.fromToken`, `yuigram/account-filters`, `BOT_TOKEN`, `pnpm verify`.
- «Бот» — клиент Bot API (`Bot`). «Аккаунт» — клиент MTProto (`Account`): обычно пользователь,
  но в аккаунт можно войти и как бот, через `signInAsBot`.
- Все токены, ключи и идентификаторы в примерах — заглушки. Настоящие учётные данные не
  вставляются ни в код, ни в сообщения, ни в задачи.
- Примеры кода проверяются компилятором TypeScript против упакованного пакета `yuigram`; там,
  где пример — фрагмент, имена вроде `bot`, `account` или `message` означают объекты, созданные
  в соседних примерах.

Примеры целиком лежат в [examples/](../../examples): каждый — отдельный проект, который
проверяется вместе с репозиторием.
