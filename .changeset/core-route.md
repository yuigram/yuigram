---
'@yuigram/bot-api': patch
'@yuigram/mtproto': patch
'yuigram': patch
---

Importing the Bot API and MTProto packages resolves `@yuigram/core` once per package instead of
once per module, which takes about 16 ms off a cold `import 'yuigram'` in a paired comparison of
isolated builds. Exports, signatures and the core's runtime identity are unchanged.
