---
'@yuigram/mtproto': patch
'yuigram': patch
---

`mockAccount` takes a list as a scripted answer, for methods such as `users.getUsers` that answer
with one. The `Answer` type now says so, and `Answered` names what a method answers with.
