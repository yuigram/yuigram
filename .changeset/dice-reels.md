---
'@yuigram/core': minor
'yuigram': minor
---

`slotMachineReels(value)`, in a new entry point `yuigram/dice` (`@yuigram/core/dice`), reads the
three reels a 🎰 dice shows from its value: left, centre, right, each `'bar'`, `'grapes'`,
`'lemon'` or `'seven'`. A value that is not a whole number from 1 to 64 is a `ValidationError`.
Programs that do not import the entry point do not load it.
