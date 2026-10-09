// SPDX-License-Identifier: MPL-2.0

/**
 * Reading a row in a list of conversations.
 *
 * A dialog is this account's row about a conversation, not the conversation.
 * The two constructors answer differently and the second — a folder rather than
 * somebody to talk to — is the one a reader walking a list has never seen.
 */

import { describe, expect, it } from 'vitest'
import { DialogView, readDialog } from '../src/entities/dialog.js'
import type { Dialog, DialogFolder } from '../src/generated/api/types/index.js'

const ROW: Dialog = {
  _: 'dialog',
  peer: { _: 'peerChannel', channel_id: 55n },
  top_message: 90,
  read_inbox_max_id: 88,
  read_outbox_max_id: 87,
  unread_count: 2,
  unread_mentions_count: 1,
  unread_reactions_count: 3,
  unread_poll_votes_count: 0,
  notify_settings: { _: 'peerNotifySettings' },
  pinned: true,
  unread_mark: true,
  folder_id: 1,
  pts: 400,
  ttl_period: 86_400,
  view_forum_as_messages: true,
  draft: { _: 'draftMessageEmpty' },
}

const FOLDER: DialogFolder = {
  _: 'dialogFolder',
  folder: { _: 'folder', id: 1, title: 'Archive' },
  peer: { _: 'peerUser', user_id: 5n },
  top_message: 12,
  unread_muted_peers_count: 4,
  unread_unmuted_peers_count: 2,
  unread_muted_messages_count: 40,
  unread_unmuted_messages_count: 9,
  pinned: true,
}

describe('a row about a conversation', () => {
  const row = new DialogView(ROW)

  it('points at the conversation without being it', () => {
    expect(row.form).toBe('conversation')
    expect(row.isFolder).toBe(false)
    expect(row.peer).toEqual({ kind: 'channel', id: 55n })
    expect(row.topMessageId).toBe(90)
  })

  it('says what has not been read', () => {
    expect(row.unreadCount).toBe(2)
    expect(row.unreadMentionsCount).toBe(1)
    expect(row.unreadReactionsCount).toBe(3)
    expect(row.readInboxMaxId).toBe(88)
    expect(row.readOutboxMaxId).toBe(87)
    expect(row.isMarkedUnread).toBe(true)
  })

  it('reads what the account has done to it', () => {
    expect(row.isPinned).toBe(true)
    expect(row.folderId).toBe(1)
    expect(row.pts).toBe(400)
    expect(row.ttlPeriod).toBe(86_400)
    expect(row.viewForumAsMessages).toBe(true)
    expect(row.draft).toBe(ROW.draft)
    expect(row.notifySettings).toBe(ROW.notify_settings)
  })

  it('does not call every row pinned', () => {
    const { pinned: _pinned, unread_mark: _mark, ...plain } = ROW

    expect(new DialogView(plain).isPinned).toBe(false)
    expect(new DialogView(plain).isMarkedUnread).toBe(false)
    expect(row.isPinned).toBe(true)
  })

  it('has none of the counts a folder carries', () => {
    expect(row.folder).toBeUndefined()
    expect(row.folderUnreadMutedPeers).toBeUndefined()
    expect(row.folderUnreadUnmutedMessages).toBeUndefined()
  })
})

describe('a row standing for a folder', () => {
  const folder = new DialogView(FOLDER)

  it('is a folder, and says which', () => {
    expect(folder.form).toBe('folder')
    expect(folder.isFolder).toBe(true)
    expect(folder.folder).toBe(FOLDER.folder)
  })

  it('counts muted and unmuted apart, and so has no single unread count', () => {
    // Adding two numbers that mean different things would produce a third that
    // means neither.
    expect(folder.unreadCount).toBeUndefined()
    expect(folder.folderUnreadMutedPeers).toBe(4)
    expect(folder.folderUnreadUnmutedPeers).toBe(2)
    expect(folder.folderUnreadMutedMessages).toBe(40)
    expect(folder.folderUnreadUnmutedMessages).toBe(9)
  })

  it('still carries the fields both constructors share', () => {
    expect(folder.peer).toEqual({ kind: 'user', id: 5n })
    expect(folder.topMessageId).toBe(12)
    expect(folder.isPinned).toBe(true)
  })

  it('answers the conversation-only questions as absent rather than as zero', () => {
    expect(folder.readInboxMaxId).toBeUndefined()
    expect(folder.draft).toBeUndefined()
    expect(folder.ttlPeriod).toBeUndefined()
    expect(folder.isMarkedUnread).toBe(false)
    expect(folder.viewForumAsMessages).toBe(false)
  })
})

describe('building a row', () => {
  it('takes what an answer carries, including nothing', () => {
    expect(readDialog(undefined)).toBeUndefined()
    expect(readDialog(ROW)?.topMessageId).toBe(90)
  })

  it('copies nothing', () => {
    expect(readDialog(ROW)?.raw).toBe(ROW)
    expect(new DialogView(ROW).toJSON()).toBe(ROW)
  })
})
