# Protocol Notes

Observed Telegram server behaviour that is not in the published specification.

This directory exists because a specification-first implementation
([mtproto.md](../mtproto.md) §1) inevitably meets cases the specification does not cover —
error recovery paths, peer edge cases, undocumented limits, responses that differ from what the
documentation implies. Those findings are expensive to obtain and easy to lose.

**The rule: a behaviour discovered once should never have to be discovered twice.**

---

## What belongs here

| Belongs | Does not belong |
|---|---|
| Server behaviour that contradicts or extends the documentation | Anything the documentation already states clearly |
| Undocumented error codes and what actually triggers them | Yuigram implementation decisions — those go in `docs/` |
| Observed limits (rate, size, count) with the conditions measured | Speculation without an observation behind it |
| Sequences that only occur under specific conditions | Copied explanations from another client's source or comments |

That last exclusion matters. These notes record **what Telegram's servers do** — factual
observations about a third party's system. They do not record how another implementation
responds to it. Reading another client to know *what to test* is legitimate; transcribing its
reasoning into this directory would import exactly the derivative relationship the project is
avoiding.

---

## Format

One file per topic, named for the area: `updates-gap-recovery.md`, `peer-min-resolution.md`,
`flood-wait-thresholds.md`.

Each entry:

```markdown
## <short description of the behaviour>

**Observed:** YYYY-MM-DD, layer NNN, DC N, test|production

**Context**
What was being done when this appeared.

**Behaviour**
What the server actually did. Constructor names, error strings, field values.
Redact anything account-identifying.

**Specification says**
Quote or link the relevant documentation, or state plainly that it is silent.

**Consequence for Yuigram**
What the implementation must do. Link the test that covers it.

**Confidence**
confirmed (reproduced N times) | probable (seen repeatedly) | single observation
```

The confidence field is not decoration. A single unreproduced observation and a behaviour
confirmed twenty times warrant different responses, and conflating them leads to code written
around a transient server condition.

---

## Working method

```
observe  ──>  reproduce if possible  ──>  write the note
                                              │
                                    add a mock-server condition
                                              │
                                        write the test
                                              │
                                      implement from the note
```

Implementation follows the note, not the live session. This keeps the finding durable and the
implementation reviewable — and it is what makes the note worth writing rather than a debugging
artifact that dies with the terminal buffer.

Every note that describes a condition the client must survive gets a corresponding injectable
condition in the mock MTProto server ([testing.md](../testing.md) §3.2). The note explains
*why* the condition exists; the mock makes it permanent.

---

## Redaction

These notes are committed to a public repository. Before committing:

- No auth keys, session strings, or any key material
- No real phone numbers, user ids, usernames, or chat ids — substitute placeholders
- No message content
- `api_id` / `api_hash` never appear

Keep the structural shape: constructor sequences, `pts` values, error codes, timing, field
presence. That is what makes a note useful, and none of it is sensitive once identifiers are
removed.

A finding that cannot be described without sensitive data is described in prose, without the
transcript.

---

## Status

Empty. Notes accumulate once implementation begins and test-datacenter work starts
([roadmap.md](../roadmap.md) Phase 6 onward).
