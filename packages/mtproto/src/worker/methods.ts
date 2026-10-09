// SPDX-License-Identifier: MPL-2.0

/**
 * Which of an account's methods a caller may reach through a worker, and how.
 *
 * This table is the boundary. A caller names a method and the host looks it up
 * here — as an own key of a frozen record, never by walking the account's
 * properties — so a name that is not listed is refused before anything runs.
 * An account method added later is unreachable until somebody decides how its
 * arguments and results cross, and writes that decision down here.
 *
 * Four shapes:
 *
 * ```
 *   call     ──> arguments and result are data            sendText, me, chat
 *   stream   ──> the result is an async iterable          history, members
 *   handle   ──> the result has methods of its own        openWebview, stayOnline
 *   callback ──> an argument is a function the caller     signIn, upload
 *                keeps, and the host calls back through
 * ```
 *
 * The functions a callback method accepts are named by path. A function found
 * anywhere else in the arguments is refused: a caller cannot hand the host an
 * arbitrary function, only fill a slot the method declared.
 *
 * What is **not** here, and why:
 *
 * - `on`, `onMessage`, `use`, `catch` and `surround` register code, which runs
 *   on the caller's side over the updates the host forwards.
 * - `api`, `reach` and `withParams` are built on the caller's side over the
 *   raw-call targets, so the full TL surface is reachable without listing it.
 * - `downloadAsStream` and `downloadAsNodeStream` are built on the caller's side
 *   over the `downloadIterable` stream, so the bytes cross once.
 * - `closeWebview` closes a handle, which the handle does itself.
 * - `connectionStatus` and `onConnectionStatus` are kept on the caller's side
 *   from the status the host pushes as it changes.
 * - `deliver` injects an update into the host's own dispatch.
 */

/** Methods whose arguments and result are data. */
export const CALLS = [
  'addContact',
  'addMembers',
  'addStickerToSet',
  'allStoriesPage',
  'answerBotGuestChatQuery',
  'answerCallback',
  'answerInlineQuery',
  'answerPrecheckout',
  'answerShipping',
  'appendTodoList',
  'archiveChats',
  'banCommunityParticipant',
  'banMember',
  'block',
  'boost',
  'boostSlots',
  'boostStats',
  'boostsPage',
  'businessConnection',
  'businessLinks',
  'buyResaleGift',
  'canBoost',
  'canPostStory',
  'cancelRecoveryEmail',
  'chat',
  'chatEventsPage',
  'chats',
  'checkRecoveryCode',
  'closePoll',
  'commonChats',
  'confirmRecoveryEmail',
  'connect',
  'contacts',
  'copyAlbum',
  'copyMessage',
  'countStoryViews',
  'createBusinessLink',
  'createChannel',
  'createCommunity',
  'createFolder',
  'createGroup',
  'createInviteLink',
  'createStickerSet',
  'createSupergroup',
  'createTopic',
  'creatorAfterLeave',
  'decideAllJoins',
  'decideGift',
  'decideJoin',
  'decideJoinRequest',
  'deleteAllWelcomeMessages',
  'deleteBusinessLink',
  'deleteChannel',
  'deleteChatPhoto',
  'deleteContacts',
  'deleteEphemeralMessage',
  'deleteFolder',
  'deleteGroup',
  'deleteHistory',
  'deleteMemberHistory',
  'deleteMessages',
  'deleteMyCommands',
  'deleteProfilePhotos',
  'deleteScheduledMessages',
  'deleteStickerFromSet',
  'deleteStories',
  'deleteTopicHistory',
  'deleteWelcomeMessage',
  'dialogsPage',
  'discussion',
  'download',
  'downloadChunk',
  'editBusinessLink',
  'editEphemeralMessage',
  'editFolder',
  'editInlineMessage',
  'editInviteLink',
  'editMessage',
  'editProfile',
  'editStory',
  'editTopic',
  'exportInviteLink',
  'exportSession',
  'feed',
  'findByPhone',
  'findDialogs',
  'findFolder',
  'folders',
  'forumTopicsPage',
  'forwardMessages',
  'fullChat',
  'getAvailableMessageEffects',
  'getBotInfo',
  'getBotMenuButton',
  'getCallbackAnswer',
  'getCallbackQueryMessage',
  'getCollectibleInfo',
  'getCommunityLinkRequests',
  'getCommunityParticipantChats',
  'getCustomEmojis',
  'getCustomEmojisFromMessages',
  'getEphemeralCallbackAnswer',
  'getFactCheck',
  'getGameHighScores',
  'getInlineGameHighScores',
  'getInstalledStickers',
  'getJoinedCommunities',
  'getMessageByLink',
  'getMessageGroup',
  'getMessageReactions',
  'getMessages',
  'getMessagesOutsideChannels',
  'getMyCommands',
  'getMyStickerSets',
  'getReactionsOf',
  'getReplyTo',
  'getScheduledMessages',
  'getStickerSet',
  'getWebPagePreview',
  'getWelcomeMessages',
  'giftOptions',
  'giftResaleOptions',
  'giftUpgradeOptions',
  'giftValue',
  'giftWithdrawalUrl',
  'hideAllCommunityLinkRequests',
  'hideCommunityLinkRequest',
  'hideMyStoryViews',
  'historyPage',
  'importContacts',
  'inviteLink',
  'inviteLinksPage',
  'inviteMembersPage',
  'isSelfPeer',
  'joinByLink',
  'joinChat',
  'joinChatlist',
  'kickMember',
  'knows',
  'leaveChat',
  'linkCommunityPeer',
  'logOut',
  'markChatUnread',
  'markStoriesSeen',
  'me',
  'member',
  'membersPage',
  'messageAuthor',
  'messageTtl',
  'moveStickerInSet',
  'myUsername',
  'offerForGift',
  'passwordStatus',
  'peer',
  'peerDialogs',
  'peerStories',
  'peers',
  'peersOf',
  'pinMessage',
  'postStory',
  'prepareInlineMessage',
  'prepayGiftUpgrade',
  'previewChat',
  'previewChatlist',
  'previewInvite',
  'primaryInviteLink',
  'profile',
  'profilePhoto',
  'profilePhotosPage',
  'profileStoriesPage',
  'reach',
  'react',
  'reactToStory',
  'reactionsPage',
  'readHistory',
  'readReactions',
  'removePassword',
  'reorderChatUsernames',
  'reorderPinnedTopics',
  'replaceStickerInSet',
  'requestLoginToken',
  'requestPasswordRecovery',
  'resendCode',
  'resendRecoveryEmail',
  'resolve',
  'resolveMany',
  'restrictMember',
  'revokeInviteLink',
  'saveDraft',
  'savedGiftsById',
  'savedGiftsPage',
  'savedMusicPage',
  'scheduledMessages',
  'searchGlobalPage',
  'searchHashtagPage',
  'searchPage',
  'searchPostsPage',
  'sendAlbum',
  'sendCode',
  'sendEphemeralMessage',
  'sendGift',
  'sendMedia',
  'sendPaidReaction',
  'sendRichMessage',
  'sendScheduledMessages',
  'sendText',
  'sendVote',
  'setAdminRights',
  'setBirthday',
  'setBotInfo',
  'setBotMenuButton',
  'setBusinessHours',
  'setBusinessIntro',
  'setChatColor',
  'setChatDefaultPermissions',
  'setChatDescription',
  'setChatPhoto',
  'setChatStickerSet',
  'setChatTitle',
  'setChatTtl',
  'setChatUsername',
  'setCloseFriends',
  'setContactNote',
  'setEmojiStatus',
  'setFolderOrder',
  'setForumSettings',
  'setGameScore',
  'setGeneralTopicHidden',
  'setInlineGameScore',
  'setMemberRank',
  'setMessageTtl',
  'setMyCommands',
  'setMyDefaultRights',
  'setOnline',
  'setPassword',
  'setPeerStoriesArchived',
  'setPinnedGifts',
  'setResalePrice',
  'setSlowMode',
  'setStickerSetThumb',
  'setStoriesPinned',
  'setTopicClosed',
  'setTopicPinned',
  'setTyping',
  'setUsername',
  'settleGiftOffer',
  'signInAsBot',
  'signInWithCode',
  'signInWithPassword',
  'similarChannels',
  'similarChannelsPage',
  'starsTransactionsPage',
  'start',
  'startTest',
  'stop',
  'stories',
  'storyInteractions',
  'storyLink',
  'storyViewersPage',
  'toggleChatUsername',
  'toggleCommunityCollapsed',
  'toggleContentProtection',
  'toggleEmojiStatusPermission',
  'toggleJoinRequests',
  'toggleJoinToSend',
  'toggleTodoCompleted',
  'topics',
  'transferGift',
  'transferOwnership',
  'translateMessage',
  'translateText',
  'unbanCommunityParticipant',
  'unbanMember',
  'unblock',
  'uniqueGift',
  'unlinkCommunityPeer',
  'unpinAllMessages',
  'upgradeGift',
  'uploadMedia',
  'user',
  'users',
] as const

/** Methods returning an async iterable, crossed as a pulled stream. */
export const STREAMS = [
  'allStories',
  'boosts',
  'chatEvents',
  'dialogs',
  'downloadIterable',
  'forumTopics',
  'history',
  'inviteLinks',
  'inviteMembers',
  'members',
  'profilePhotos',
  'profileStories',
  'reactions',
  'savedGifts',
  'savedMusicWalk',
  'search',
  'searchGlobal',
  'searchHashtag',
  'searchPosts',
  'starsTransactions',
  'storyViewers',
] as const

/**
 * The handle kinds: what each exposes, which of its methods ends it, and what
 * releasing an orphaned one does.
 *
 * Once the ending method has run, the host forgets the handle, so a caller that
 * stops what it started does not keep holding it until it detaches. Calling the
 * ending method again is a no-op on the caller's side, as it is in-process.
 */
export const HANDLE_KINDS = {
  /** A streaming draft: written to until stopped. Nothing runs between writes. */
  draft: {
    fields: ['key', 'stopped', 'text'],
    methods: ['write', 'stop'],
    ends: 'stop',
    release: 'none',
  },
  /** An open mini app, prolonged on a timer until it is closed. */
  webview: {
    fields: ['url', 'queryId', 'fullscreen', 'open'],
    methods: ['close'],
    ends: 'close',
    release: 'close',
  },
  /** An export in progress. Ending it is explicit, so a vanished caller leaves it as it was. */
  takeout: { fields: ['id'], methods: ['call', 'finish'], ends: 'finish', release: 'none' },
  /** A function that stops something the host is doing on the caller's behalf. */
  stop: { fields: [], methods: ['call'], ends: 'call', release: 'call' },
} as const

export type HandleKind = keyof typeof HANDLE_KINDS

/** Methods returning a handle, by the kind of handle. */
export const HANDLES = {
  createRichStreamingDraft: 'draft',
  createStreamingDraft: 'draft',
  initTakeoutSession: 'takeout',
  openWebview: 'webview',
  stayOnline: 'stop',
  watchChat: 'stop',
} as const satisfies Readonly<Record<string, HandleKind>>

/**
 * Methods taking functions, with the paths those functions may be at.
 *
 * `0.phone` is the `phone` field of the first argument. The host calls a slot
 * back through the connection that made the call, and only while the call is
 * running.
 */
export const CALLBACKS = {
  /**
   * The transfer runs on the host and hands each run of bytes to the caller's
   * sink; it awaits the sink, so a caller that writes slowly slows the
   * transfer rather than having chunks pile up on either side.
   */
  downloadTo: ['0.write'],
  signIn: ['0.phone', '0.code', '0.password'],
  signInQr: ['0.onToken', '0.onApproved', '0.password'],
  upload: ['0.source.read'],
} as const

/** Properties a caller may read, which are state rather than calls. */
export const GETTERS = ['name', 'state', 'connected'] as const

/** Methods whose results are bytes, copied once into a buffer that is transferred. */
export const BYTES = ['download', 'downloadChunk'] as const

export type CallName = (typeof CALLS)[number]
export type StreamName = (typeof STREAMS)[number]
export type HandleName = keyof typeof HANDLES
export type CallbackName = keyof typeof CALLBACKS
export type GetterName = (typeof GETTERS)[number]

/** How the host treats one method name. */
export type MethodShape =
  | { readonly shape: 'call' }
  | { readonly shape: 'stream' }
  | { readonly shape: 'handle'; readonly kind: HandleKind }
  | { readonly shape: 'callback'; readonly slots: readonly string[] }

/** Every reachable method, by name. Frozen, and looked up by own key only. */
export const METHODS: Readonly<Record<string, MethodShape>> = Object.freeze({
  ...Object.fromEntries(CALLS.map((name) => [name, { shape: 'call' } as const])),
  ...Object.fromEntries(STREAMS.map((name) => [name, { shape: 'stream' } as const])),
  ...Object.fromEntries(
    Object.entries(HANDLES).map(([name, kind]) => [name, { shape: 'handle', kind } as const]),
  ),
  ...Object.fromEntries(
    Object.entries(CALLBACKS).map(([name, slots]) => [name, { shape: 'callback', slots } as const]),
  ),
})

/** The shape of a method, or `undefined` for a name that is not reachable. */
export function shapeOf(method: string): MethodShape | undefined {
  return Object.hasOwn(METHODS, method) ? METHODS[method] : undefined
}
