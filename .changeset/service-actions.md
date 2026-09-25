---
'@yuigram/mtproto': minor
'yuigram': minor
---

A service message says what happened in Yuigram's own terms. `readAction()` — also
`MessageView.serviceAction` and `event.action` on an account's message events — reads each of the
sixty-eight `messageAction*` constructors into a variant of `ServiceAction`: a `kind` to switch on
(`'members-added'`, `'joined-by-link'`, `'payment-received'`, `'gift-received'` and the rest),
camelCase fields, peers as `PeerRef`, notes as formatted text, and the constructor kept as `raw`.
An action this build has no reading for is `'unsupported'`. `f.action(...kinds)` matches service
messages by kind and narrows `event.action` to those variants.
