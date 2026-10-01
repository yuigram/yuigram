---
'@yuigram/core': minor
'yuigram': minor
---

`new App()` describes its clients' events as `BaseContext` when given no type argument, rather
than as an object with only a `kind`. Application-wide middleware and handlers can read
`event.log`, `event.client.name`, `event.transport` and `event.raw` without naming a type; naming
the union of the clients' contexts, `new App<AnyEventContext | MtprotoContext>()`, is still how a
handler narrows on `transport` to read what only one subsystem has.

Compatibility: an application that holds a client of its own whose events lack those members, and
relied on the old default, names its event type: `new App<MyEvent>()`.
