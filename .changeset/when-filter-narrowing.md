---
'@yuigram/core': patch
'yuigram': patch
---

`when(filter, middleware)` hands the middleware the context the filter proves, as its
documentation shows. A filter is itself callable, so it matched the predicate form first and the
middleware's context was inferred as `unknown`. The filter form is now tried first; a bare
predicate is unaffected.
