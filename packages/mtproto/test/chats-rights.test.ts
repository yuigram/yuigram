// SPDX-License-Identifier: MPL-2.0

/**
 * The records administrator rights and member restrictions are written as.
 *
 * Checked against the generated tables rather than a list kept here, so a
 * right a new layer adds and these records cannot express fails the suite
 * instead of being silently impossible to grant.
 */

import { describe, expect, it } from 'vitest'
import {
  type AdminRights,
  adminRights,
  bannedRights,
  type Restrictions,
} from '../src/chats/common.js'
import { ENTRIES } from '../src/generated/api/tables/index.js'

describe('the rights records', () => {
  /** Every flag a constructor declares, from the generated tables. */
  const flagsOf = (name: string) =>
    (ENTRIES.find((entry) => entry.n === name)?.f ?? [])
      .filter((field) => field.t === 'true')
      .map((field) => field.n)
      .sort()

  it('can grant every right the schema defines', () => {
    const everything: Required<AdminRights> = {
      changeInfo: true,
      postMessages: true,
      editMessages: true,
      deleteMessages: true,
      banUsers: true,
      inviteUsers: true,
      pinMessages: true,
      addAdmins: true,
      anonymous: true,
      manageCall: true,
      manageTopics: true,
      postStories: true,
      editStories: true,
      deleteStories: true,
      manageDirectMessages: true,
      manageRanks: true,
      manageLinkedPeers: true,
      manageWelcomeMessages: true,
      other: true,
    }
    const { _: _name, ...granted } = adminRights(everything)

    // A right the schema has and this record cannot express is a right nobody
    // using it could give; the next layer's additions fail here first.
    expect(Object.keys(granted).sort()).toEqual(flagsOf('chatAdminRights'))
  })

  it('can withhold every right the schema defines', () => {
    const everything: Required<Omit<Restrictions, 'until'>> = {
      viewMessages: true,
      sendMessages: true,
      sendMedia: true,
      sendStickers: true,
      sendGifs: true,
      sendGames: true,
      sendInline: true,
      embedLinks: true,
      sendPolls: true,
      changeInfo: true,
      inviteUsers: true,
      pinMessages: true,
      manageTopics: true,
      sendPhotos: true,
      sendVideos: true,
      sendRoundvideos: true,
      sendAudios: true,
      sendVoices: true,
      sendDocs: true,
      sendPlain: true,
      editRank: true,
      sendReactions: true,
      manageLinkedPeers: true,
    }
    const { _: _name, until_date: _until, ...withheld } = bannedRights(everything)

    expect(Object.keys(withheld).sort()).toEqual(flagsOf('chatBannedRights'))
  })
})
