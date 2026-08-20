# yuigram

## 0.1.0

### Minor Changes

- e9381ff: First release: the Telegram Bot API subsystem.
  
  `npm install yuigram` gives an independent Bot API framework. Every Bot API capability is
  reachable — all 185 methods and 388 objects are generated and typed — nothing in it is a stub,
  and the published packages have zero runtime dependencies.
  
  **Clients and transport.** A `Bot` client with an independent lifecycle. Long polling that
  backs off on transient failures, honours `retry_after`, stops on errors that retrying cannot
  fix, and cancels its in-flight request on shutdown. A framework-agnostic webhook handler with
  adapters for `node:http`, Express and Fastify — none of which is a dependency, since each
  describes the shape it needs structurally.
  
  **Dispatch.** Onion middleware with priority bands, handlers selected by update kind, command,
  text or composed filter, and service messages promoted to first-class kinds so applications
  stop branching inside a message handler. Every matching handler runs, so independent concerns
  compose without knowing about each other.
  
  **State.** Sessions with lazy loading, dirty tracking and per-key serialization, over a
  three-method storage contract with in-memory and filesystem adapters. Context extensions are
  carried on a type parameter, so two bots in one program can hold different state.
  
  **Types.** The full Bot API 10.2 surface, generated from a committed schema snapshot, with
  every method cancellable. `call()` reaches anything newer than
  the installed schema, so a Telegram release never blocks anyone.
  
  **Diagnostics.** An error taxonomy that preserves Telegram's own code, description and retry
  information, and structural log redaction that cannot be turned off.
  
  **Testing.** `yuigram/testing` drives the real pipeline with only the network replaced, so an
  application tests its bot the same way Yuigram tests itself.
  
  **Not yet, and planned for v0.x:** keyboard builders (pass the typed markup object meanwhile)
  and streaming upload (buffer the file meanwhile; bot uploads cap at 50 MB).
  
  MTProto is next and is being built bottom-up. See `docs/roadmap.md`.

### Patch Changes

- Updated dependencies [e9381ff]
  - @yuigram/bot-api@0.1.0
  - @yuigram/core@0.1.0
