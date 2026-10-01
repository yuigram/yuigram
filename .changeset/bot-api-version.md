---
'@yuigram/bot-api': minor
'yuigram': patch
---

`schemaInfo.botApi` reports the Bot API release the surface was generated from. It was written
by hand and went on reporting `10.2` after the surface was regenerated from 10.3; it is now read
from `BOT_API_VERSION`, which the schema generator emits beside the surface and `@yuigram/bot-api`
exports, so the two cannot disagree again.
