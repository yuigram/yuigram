---
'@yuigram/core': patch
'@yuigram/bot-api': patch
'@yuigram/mtproto': patch
'yuigram': patch
'@yuigram/sqlite': patch
'@yuigram/redis': patch
---

Each package ships a small `package.json` in `dist/` saying its files are ES modules, with its
`browser` substitutions and `sideEffects` rewritten relative to `dist/`, so Node stops looking for
a module's package one directory up. A cold `import 'yuigram'` is about 13 ms faster in a paired
comparison of isolated builds. Resolution by package name, export maps, browser substitutions in
esbuild, webpack and Rollup, and tree shaking are unchanged.
