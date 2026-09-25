---
'@yuigram/mtproto': patch
'yuigram': patch
---

Removing history finishes. `deleteHistory`, `deleteMemberHistory` and `deleteTopicHistory` repeat
the request while Telegram says more is left, applying each stage's position, where they used to
stop after the first batch and report success. `deleteHistory` on a channel or supergroup uses the
channel call, and `previewChat` returns the conversation the name belongs to rather than the first
one the answer carried.
