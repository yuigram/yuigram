---
'@yuigram/mtproto': minor
'yuigram': minor
---

`UserView.presence` reads a user's status into a state, `onlineUntil` or `lastSeen`, and whether it
is hidden because this account hides its own; `UserView.mention()` builds text that mentions the
account, with its access hash where known. Users gain `botManagesBots`, `botHasGuestChat`,
`botIsGuard`, `linkedCommunityId` and `photoDcId`; chats gain `linkedCommunityId` and `photoDcId`.
