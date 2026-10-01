---
'@yuigram/sqlite': patch
---

The SQLite counter never reports a wait longer than the window. A hit whose clock was read before
another process opened the window could be told the window's length plus the time it spent
waiting for the write lock.
