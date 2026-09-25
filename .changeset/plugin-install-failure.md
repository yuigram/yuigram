---
'@yuigram/core': minor
'@yuigram/bot-api': patch
'@yuigram/mtproto': patch
'yuigram': minor
---

A plugin whose install throws now fails as `PluginInstallError`, naming the plugin and keeping its
error as the cause. The plugins installed before it in the same round are disposed, newest first,
through their new optional `dispose(value, target)`, and anything a disposal throws is kept in
`cleanup`. The client then stays failed — later updates and `start()` reject with the same error
— rather than installing again and registering middleware twice.
