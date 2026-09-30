---
'@yuigram/mtproto': minor
'yuigram': minor
---

`thumbnails`, `thumbnail` and `thumbnailFile` take a document as well as a photo. A document's
`thumbs` and `video_thumbs` and a photo's `video_sizes` are listed beside its sizes, and each
`Thumbnail` states its `availability`: `download` (`photoSize`, `photoSizeProgressive`,
`videoSize`), `embedded` (stripped, cached and path sizes), `unsupported` (emoji and sticker
compositions) or `unavailable` (`photoSizeEmpty`), plus whether it is a `video`. `thumbnailFile`
addresses a document's thumbnail by the document's identifier, hash, reference and datacenter
with the size named, and refuses an embedded, unsupported or empty size by what it is.

`event.download({ thumbnail })` fetches one rendering of an event's document or photo, and puts a
refused reference right from the message as the whole-file download does. `fileIdOfThumbnail`
writes the identifier other clients use for a thumbnail, and `embeddedThumbnail` on
`@yuigram/mtproto/utils` (and `yuigram/account-utils`) reads a carried one as a complete image.

`Thumbnail.raw` is now `TypePhotoSize | TypeVideoSize`; `PhotoThumbnail` remains as its former
name.
