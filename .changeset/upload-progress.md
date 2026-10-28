---
"@yuigram/mtproto": minor
---

`account.upload` takes `onProgress`, told how far the upload has come each time
the datacenter acknowledges a part: `{ sent, total }`, in bytes acknowledged
rather than read, a part sent again counted once, and the total once it is known.
A promise it returns is awaited, and an error it throws fails the upload without
sending the part again. It crosses to an account in a worker like the source does.
`UploadProgress` is exported.
