---
'@yuigram/core': patch
'yuigram': patch
---

`writeLink` refuses a mini app link whose `mode` is neither `'compact'` nor `'fullscreen'`,
instead of writing a link that reads back without the mode.
