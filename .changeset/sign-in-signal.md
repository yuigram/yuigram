---
"@yuigram/mtproto": minor
---

Each sign-in step takes a `signal`: `sendCode(phone, { signal })`,
`resendCode({ …, signal })`, `signInWithCode({ …, signal })` and
`signInWithPassword(password, { signal })`, and `signIn({ …, signal })` stops the
wait for a prompt as well. It is checked before each request a step sends and
ends the wait for an answer with a `CancelledError`; a request already sent is not
withdrawn, so Telegram may still act on it.
