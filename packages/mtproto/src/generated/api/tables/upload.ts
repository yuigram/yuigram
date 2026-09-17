// GENERATED FILE — do not edit.
// Wire layout for upload
// Source: Telegram TL layer 229, schemas/tl/api.229.tl

import type { TlEntry } from '../../../tl/schema.js'

/** 13 combinators. */
export const ENTRIES: readonly TlEntry[] = [
  { id: 0xa99fca4f, n: 'upload.cdnFile', f: [{ n: 'bytes', t: 'bytes' }] },
  { id: 0xeea8e46e, n: 'upload.cdnFileReuploadNeeded', f: [{ n: 'request_token', t: 'bytes' }] },
  { id: 0x096a18d5, n: 'upload.file', f: [{ n: 'type', t: 'obj' }, { n: 'mtime', t: 'int' }, { n: 'bytes', t: 'bytes' }] },
  { id: 0xf18cda44, n: 'upload.fileCdnRedirect', f: [{ n: 'dc_id', t: 'int' }, { n: 'file_token', t: 'bytes' }, { n: 'encryption_key', t: 'bytes' }, { n: 'encryption_iv', t: 'bytes' }, { n: 'file_hashes', t: { v: 'obj' } }] },
  { id: 0x395f69da, n: 'upload.getCdnFile', f: [{ n: 'file_token', t: 'bytes' }, { n: 'offset', t: 'long' }, { n: 'limit', t: 'int' }] },
  { id: 0x91dc3f31, n: 'upload.getCdnFileHashes', f: [{ n: 'file_token', t: 'bytes' }, { n: 'offset', t: 'long' }] },
  { id: 0xbe5335be, n: 'upload.getFile', f: [{ n: 'flags', b: 1 }, { n: 'precise', t: 'true', c: 'flags', i: 0 }, { n: 'cdn_supported', t: 'true', c: 'flags', i: 1 }, { n: 'location', t: 'obj' }, { n: 'offset', t: 'long' }, { n: 'limit', t: 'int' }] },
  { id: 0x9156982a, n: 'upload.getFileHashes', f: [{ n: 'location', t: 'obj' }, { n: 'offset', t: 'long' }] },
  { id: 0x24e6818d, n: 'upload.getWebFile', f: [{ n: 'location', t: 'obj' }, { n: 'offset', t: 'int' }, { n: 'limit', t: 'int' }] },
  { id: 0x9b2754a8, n: 'upload.reuploadCdnFile', f: [{ n: 'file_token', t: 'bytes' }, { n: 'request_token', t: 'bytes' }] },
  { id: 0xde7b673d, n: 'upload.saveBigFilePart', f: [{ n: 'file_id', t: 'long' }, { n: 'file_part', t: 'int' }, { n: 'file_total_parts', t: 'int' }, { n: 'bytes', t: 'bytes' }] },
  { id: 0xb304a621, n: 'upload.saveFilePart', f: [{ n: 'file_id', t: 'long' }, { n: 'file_part', t: 'int' }, { n: 'bytes', t: 'bytes' }] },
  { id: 0x21e753bc, n: 'upload.webFile', f: [{ n: 'size', t: 'int' }, { n: 'mime_type', t: 'string' }, { n: 'file_type', t: 'obj' }, { n: 'mtime', t: 'int' }, { n: 'bytes', t: 'bytes' }] },
]
