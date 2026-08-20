# @yuigram/mtproto

The Telegram MTProto subsystem for [Yuigram](https://github.com/yuigram/yuigram): the protocol
implementation — cryptography, the TL codec, transport framing, the authorization handshake,
the session layer, the datacenter pool, peer resolution, file transfer and the updates manager.

**Not implemented, and not published.** This package exists in the repository so the
architecture and its dependency boundaries are in place before the code is, and it is marked
private until there is something worth installing — an empty package on a registry is worse
than no package. The `@yuigram` scope reserves the name meanwhile.

See the [roadmap](https://github.com/yuigram/yuigram/blob/main/docs/roadmap.md) for what lands
when.

Applications should install [`yuigram`](https://www.npmjs.com/package/yuigram).
