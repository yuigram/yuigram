---
'@yuigram/bot-api': minor
'yuigram': minor
---

`koaWebhook(handler, { path?, bodyLimit? })` serves a bot's webhook from a Koa application. It
uses the body a parser left on `ctx.request.body`, or reads the request itself under the same
size limit as `nodeWebhook`; it fills in the status, content type and body and leaves sending
them to Koa. With `path`, other requests pass to the next middleware. Koa is not a dependency.
