---
'@yuigram/mtproto': patch
'yuigram': patch
---

`account.startTest()` builds a test number's code to the length Telegram states when it sends
the code, and uses the documented five digits only where the answer states no length. A stated
length that no code could have, or an answer that does not say how the code was sent, is refused
before a sign-in attempt is spent. The ordinary sign-in steps are unchanged and never build a code.
